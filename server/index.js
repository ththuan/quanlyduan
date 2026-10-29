/* ============================================================
   QLDA - Express backend server
   Serves the frontend + a small JSON/file API backed by SQLite.
   ============================================================ */
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./db');
const legal = require('./legal');
const wiki = require('./legal-wiki');
const excelImport = require('./excel-import');
const assetImport = require('./asset-import');
const qltk = require('./qltk');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Optional HTTPS (self-signed for LAN) ----
// Ưu tiên: HTTPS_PFX (+ HTTPS_PFX_PASSPHRASE). Nếu không: HTTPS_CERT + HTTPS_KEY (PEM).
const HTTPS_PFX = process.env.HTTPS_PFX || '';
const HTTPS_PFX_PASSPHRASE = process.env.HTTPS_PFX_PASSPHRASE || '';
const HTTPS_CERT = process.env.HTTPS_CERT || '';
const HTTPS_KEY = process.env.HTTPS_KEY || '';

let tlsOptions = null;
if (HTTPS_PFX && fs.existsSync(HTTPS_PFX)) {
  tlsOptions = { pfx: fs.readFileSync(HTTPS_PFX), passphrase: HTTPS_PFX_PASSPHRASE || undefined };
} else if (HTTPS_CERT && HTTPS_KEY && fs.existsSync(HTTPS_CERT) && fs.existsSync(HTTPS_KEY)) {
  tlsOptions = { cert: fs.readFileSync(HTTPS_CERT), key: fs.readFileSync(HTTPS_KEY) };
}
const IS_HTTPS = !!tlsOptions;

app.disable('x-powered-by');
const jsonSmall = express.json({ limit: '256kb' });
const jsonMedium = express.json({ limit: '1mb' });
const jsonLarge = express.json({ limit: '12mb' });
const LARGE_BODY_PATHS = new Set([
  '/api/state', '/api/restore', '/api/admin/import-project-excel',
  '/api/admin/preview-asset-excel', '/api/admin/import-asset-excel'
]);
const MEDIUM_BODY_PATHS = new Set(['/api/ai/history', '/api/qltk/sync-assets']);
// Chỉ parse body lớn sau khi đã qua requireAuth/requireAdmin ở từng route.
app.use((req, res, next) => {
  if (LARGE_BODY_PATHS.has(req.path)) return next();
  const parser = MEDIUM_BODY_PATHS.has(req.path) ? jsonMedium : jsonSmall;
  parser(req, res, next);
});

// ---- Security headers (không cần helmet) ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // CSP: chỉ cho phép tài nguyên cùng nguồn và inline style cần thiết cho SPA
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com; " +
    "object-src 'none'; base-uri 'self'; " +
    "frame-ancestors 'none'; " +
    "frame-src 'self' blob: data:"
  );
  next();
});

// ---- Auth middleware ----
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const session = db.getSessionByAccessToken(token);
  if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const user = db.getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  req.sessionId = session.id;
  // Đồng bộ cookie phiên web (đọc bởi các luồng web cùng nguồn)
  setSessionCookie(req, res, session.id);
  req.user = { id: user.id, username: user.username, role: user.role, mustChangePassword: !!user.must_change_password };
  // Ép đổi mật khẩu: chặn mọi API trừ logout, đổi mật khẩu, /api/me
  if (req.user.mustChangePassword) {
    const allowed = req.path === '/api/me' || req.path === '/api/logout' ||
      (req.path.match(/^\/api\/users\/[^/]+\/password$/) && req.method === 'PUT');
    if (!allowed) return res.status(403).json({ error: 'Vui lòng đổi mật khẩu trước khi tiếp tục', mustChangePassword: true });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền này' });
  next();
}

function setSessionCookie(req, res, sessionId) {
  const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const flags = 'HttpOnly; Path=/; SameSite=Lax; Max-Age=' + (7 * 24 * 60 * 60) + (secure ? '; Secure' : '');
  res.setHeader('Set-Cookie', `qlda_sid=${sessionId}; ${flags}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'qlda_sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

// Public healthcheck (no auth) for Docker HEALTHCHECK / monitoring
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Serve the static frontend explicitly (avoid exposing server/data/uploads) ----
const noCache = (res, path, stat) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};
app.get('/', (req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/index.html', (req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/login.html', (req, res) => res.sendFile(path.join(ROOT_DIR, 'login.html'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/app.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'app.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/motion.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'motion.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Content-Type': 'application/javascript; charset=utf-8' } }));
app.get('/motion-ui.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'motion-ui.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Content-Type': 'application/javascript; charset=utf-8' } }));
app.get('/workflow-catalog.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'workflow-catalog.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Content-Type': 'application/javascript; charset=utf-8' } }));
app.get('/workflow-ui.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'workflow-ui.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Content-Type': 'application/javascript; charset=utf-8' } }));
app.get('/legal-ui.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'legal-ui.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/wiki-ui.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'wiki-ui.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/login.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'login.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/style.css', (req, res) => res.sendFile(path.join(ROOT_DIR, 'style.css'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/logoCTEC.png', (req, res) => res.sendFile(path.join(ROOT_DIR, 'logoCTEC.png'), { headers: { 'Cache-Control': 'public, max-age=31536000' } }));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'manifest.json'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Content-Type': 'application/manifest+json' } }));
app.get('/sw.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'sw.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/assets/material-symbols-rounded.css', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'material-symbols-rounded.css'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/material-symbols-rounded.woff2', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'material-symbols-rounded.woff2'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/inter-vietnamese.woff2', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'inter-vietnamese.woff2'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/inter-latin.woff2', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'inter-latin.woff2'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/pdf.min.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'pdf.min.js'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/pdf.worker.min.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'pdf.worker.min.js'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/Mau-Tinh-Hinh-Thuc-Hien-Du-An.xlsx', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'Mau-Tinh-Hinh-Thuc-Hien-Du-An.xlsx'), { headers: { 'Cache-Control': 'public, max-age=3600' } }));

// ---- Thư viện mẫu biểu (Word/Excel) ----
app.use('/templates', express.static(path.join(ROOT_DIR, 'templates'), {
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.xlsx')) res.setHeader('Cache-Control', 'public, max-age=3600');
    else res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// ---- Auth API ----
// Rate limiter đơn giản theo IP (in-memory)
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20; // mỗi IP tối đa 20 lần / 15 phút
const LOGIN_MAX_KEYS = 5000;

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' ||
      !username || !password || username.length > 64 || password.length > 128) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }

  const cfIp = String(req.headers['cf-connecting-ip'] || '').trim().slice(0, 64);
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64);
  const ip = cfIp || xff || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + LOGIN_WINDOW_MS; }
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.' });
  }
  rec.count++;
  if (loginAttempts.size >= LOGIN_MAX_KEYS && !loginAttempts.has(ip)) {
    loginAttempts.delete(loginAttempts.keys().next().value);
  }
  loginAttempts.set(ip, rec);

  const user = db.getUserByUsername(username);
  if (!user) {
    // Timing-equalize + trả lỗi chung
    db.verifyUser(username, password);
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  if (db.isLocked(user)) {
    console.warn(`[QLDA] Đăng nhập vào tài khoản đang bị khóa: ${user.username}`);
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  const verified = db.verifyUser(username, password);
  if (!verified) {
    db.recordFailedLogin(user.id);
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  db.resetFailedLogin(user.id);
  const session = db.createSession(user.id);
  setSessionCookie(req, res, session.id);
  res.json({
    accessToken: session.accessToken, refreshToken: session.refreshToken,
    accessExpiresAt: session.accessExpiresAt, expiresAt: session.expiresAt,
    user: { username: user.username, role: user.role, id: user.id, mustChangePassword: !!user.must_change_password }
  });
});

app.post('/api/logout', (req, res) => {
  const { refreshToken } = req.body || {};
  db.deleteSessionByRefreshToken(refreshToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/refresh', (req, res) => {
  const renewed = db.refreshSession(req.body?.refreshToken);
  if (!renewed) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
  const user = db.getUserById(renewed.userId);
  if (!user) {
    db.deleteSession(renewed.sessionId);
    return res.status(401).json({ error: 'Tài khoản không còn tồn tại' });
  }
  res.json({
    accessToken: renewed.accessToken, refreshToken: renewed.refreshToken,
    accessExpiresAt: renewed.accessExpiresAt, expiresAt: renewed.expiresAt,
    user: { username: user.username, role: user.role, id: user.id, mustChangePassword: !!user.must_change_password }
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ---- User management (admin only) ----
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.json(db.listUsers());
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  const uname = String(username).trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(uname)) {
    return res.status(400).json({ error: 'Tên đăng nhập chỉ gồm chữ, số, dấu . _ - (3-64 ký tự)' });
  }
  if (!password || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 10 ký tự' });
  if (db.getUserByUsername(uname)) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  const user = db.createUser(uname, password, role === 'admin' ? 'admin' : 'user', 1);
  res.status(201).json(user);
});

app.put('/api/users/:id/password', requireAuth, (req, res) => {
  const { id } = req.params;
  const { password, currentPassword } = req.body || {};
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Bạn không có quyền đổi mật khẩu tài khoản này' });
  }
  if (!password || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 10 ký tự' });
  const target = db.getUserById(id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  // Tự đổi mật khẩu (không phải admin) phải xác nhận mật khẩu hiện tại,
  // trừ khi đang bị buộc đổi mật khẩu (must_change_password) sau lần đăng nhập đầu tiên.
  if (req.user.role !== 'admin' && req.user.id === id && !req.user.mustChangePassword) {
    if (!currentPassword || !db.verifyUser(target.username, currentPassword)) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }
  }
  db.updateUserPassword(id, password);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const target = db.getUserById(id);
  if (!target) return res.json({ ok: true });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Không thể tự xóa tài khoản đang đăng nhập' });
  if (target.role === 'admin' && db.countAdmins() <= 1) {
    return res.status(400).json({ error: 'Phải còn ít nhất một quản trị viên' });
  }
  db.deleteUser(id);
  res.json({ ok: true });
});

// ---- App state (projects/categories/packages) ----
app.get('/api/state', requireAuth, (req, res) => {
  res.json(db.getState());
});

app.put('/api/state', requireAuth, requireAdmin, jsonLarge, (req, res) => {
  const { projects, currentProjectId } = req.body || {};
  if (!Array.isArray(projects)) {
    return res.status(400).json({ error: 'projects phải là một mảng' });
  }
  // Bảo vệ chống mất dữ liệu: không ghi đè dữ liệu đang có bằng mảng rỗng
  const existing = db.getState();
  if (projects.length === 0 && (existing.projects || []).length > 0) {
    return res.status(409).json({ error: 'Từ chối ghi đè dữ liệu hiện có bằng danh sách rỗng' });
  }
  // Giữ nguyên các trường khác của state (vd migrations) để không chạy lại seed/migration
  db.saveStateToDb({ ...existing, projects, currentProjectId: currentProjectId || null });
  res.json({ ok: true });
});

// ---- Cập nhật riêng một tài sản (tránh ghi đè toàn bộ state từ dữ liệu cũ) ----
const ASSET_EDIT_FIELDS = [
  'name', 'code', 'supplier', 'unit', 'quantity', 'unitPrice', 'amount',
  'location', 'year', 'acceptanceDate', 'status', 'note', 'stt',
  'qltkDepartmentId', 'qltkDepartmentName', 'qltkCategoryId', 'qltkCategoryName',
  'qltkCategoryCode', 'qltkId', 'qltkCode', 'qltkSyncedAt', 'qltkError', 'qltkAllocations'
];

app.put('/api/projects/:projectId/assets/:assetId', requireAuth, requireAdmin, (req, res) => {
  const { asset, catId, pkgId } = req.body || {};
  const state = db.getState();
  const project = (state.projects || []).find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

  let found = null;
  let oldPkg = null;
  for (const cat of (project.categories || [])) {
    for (const pkg of (cat.packages || [])) {
      const a = (pkg.assets || []).find(x => x.id === req.params.assetId);
      if (a) { found = a; oldPkg = pkg; break; }
    }
    if (found) break;
  }
  if (!found) found = (project.assets || []).find(x => x.id === req.params.assetId);
  if (!found) return res.status(404).json({ error: 'Không tìm thấy tài sản' });

  const targetCat = (project.categories || []).find(c => c.id === catId);
  const targetPkg = targetCat?.packages.find(p => p.id === pkgId);
  if (!targetPkg) return res.status(400).json({ error: 'Gói thầu không hợp lệ' });

  const clean = {};
  for (const k of ASSET_EDIT_FIELDS) if (asset && asset[k] !== undefined) clean[k] = asset[k];
  clean.id = found.id;
  clean.projectId = project.id;
  clean.packageId = targetPkg.id;

  if (oldPkg !== targetPkg) {
    if (oldPkg) oldPkg.assets = (oldPkg.assets || []).filter(x => x.id !== found.id);
    else project.assets = (project.assets || []).filter(x => x.id !== found.id);
    targetPkg.assets = targetPkg.assets || [];
    targetPkg.assets.push({ ...found, ...clean });
  } else {
    Object.assign(found, clean);
  }

  project.auditLog = project.auditLog || [];
  project.auditLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user: req.user.username,
    action: 'update',
    target: 'tài sản',
    name: clean.name || found.name,
    detail: ''
  });
  if (project.auditLog.length > 1000) project.auditLog = project.auditLog.slice(-1000);

  db.saveStateToDb(state);
  const updated = (targetPkg.assets || []).find(x => x.id === found.id);
  res.json({ ok: true, asset: updated });
});

// ---- Kết nối phần mềm Quản lý tài sản (QLTS) ----
app.get('/api/qltk/options', requireAuth, async (req, res) => {
  if (!qltk.isConfigured()) {
    return res.json({ configured: false, departments: [], categories: [] });
  }
  try {
    const opts = await qltk.getOptions();
    res.json({ configured: true, ...opts });
  } catch (err) {
    console.error('[QLDA] Lỗi QLTS options:', err.message);
    res.json({ configured: true, departments: [], categories: [], error: 'Không kết nối được hệ thống QLTS' });
  }
});

function qltkIsBulkCategory(cat, asset) {
  if (cat?.trackingType && cat.trackingType !== 'individual') return true;
  const unit = String(cat?.unit || asset?.unit || '').toLowerCase();
  return /m2|m²|mét vuông|met vuong/.test(unit);
}

function qltkLatestAcceptanceDate(pkg) {
  if (!pkg) return '';
  const dates = (pkg.acceptances || []).map(a => a.date).filter(Boolean).sort();
  return dates[dates.length - 1] || pkg.acceptanceDate || '';
}

// Sinh mã theo loại tài sản của QLTS rồi tạo tài sản; thử lại nếu mã bị trùng
async function qltkCreateAssetWithGeneratedCode(asset, opts, categoryCode) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await qltk.generateAssetCode(categoryCode);
    try {
      return await qltk.createAsset({ ...asset, code }, opts);
    } catch (err) {
      lastErr = err;
      if (err.status === 409) continue;
      throw err;
    }
  }
  throw lastErr || new Error('Không sinh được mã tài sản QLTS');
}

// Tạo tài sản QLTS cho một dòng tài sản QLDA.
// - Loại quản lý cá thể: tách thành N bản ghi, mỗi bản ghi SL = 1.
// - Loại quản lý số lượng lớn (m2...): mỗi phòng 1 bản ghi với SL tương ứng.
async function qltkSyncOneAsset(asset, ctx) {
  const catId = Number(asset.qltkCategoryId) || 0;
  const cat = ctx.catById.get(String(catId));
  if (!cat) throw new Error('Chưa chọn loại tài sản QLTS');

  const totalQty = Number(asset.quantity) || 1;
  let allocations = (Array.isArray(asset.qltkAllocations) ? asset.qltkAllocations : [])
    .map(a => ({
      departmentId: Number(a.departmentId) || 0,
      departmentName: a.departmentName || '',
      quantity: Number(a.quantity) || 0
    }))
    .filter(a => a.departmentId && a.quantity > 0);
  if (!allocations.length) {
    const deptId = Number(asset.qltkDepartmentId || ctx.departmentId) || 0;
    if (!deptId) throw new Error('Chưa chọn phòng/khoa nhận sử dụng');
    allocations = [{ departmentId: deptId, departmentName: asset.qltkDepartmentName || '', quantity: totalQty }];
  }
  const totalAllocated = allocations.reduce((s, a) => s + a.quantity, 0);
  if (Math.abs(totalAllocated - totalQty) > 1e-6) {
    throw new Error(`Tổng phân bổ (${totalAllocated}) không bằng số lượng tài sản (${totalQty})`);
  }

  // Dữ liệu đồng bộ kiểu cũ (chưa tách): coi như đã xong, không tạo trùng.
  if (asset.qltkId && !Array.isArray(asset.qltkItems)) return { created: false };

  asset.qltkItems = Array.isArray(asset.qltkItems) ? asset.qltkItems : [];
  const bulk = qltkIsBulkCategory(cat, asset);
  const unitPrice = Number(asset.unitPrice) || (Number(asset.amount) || 0) / (totalQty || 1);
  let createdCount = 0;

  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    const existing = asset.qltkItems.filter(x => Number(x.allocIndex) === i);

    if (bulk) {
      if (existing.length) continue;
      const qty = alloc.quantity;
      const price = Math.round((Number(asset.amount) || 0) * qty / totalQty);
      const created = await qltkCreateAssetWithGeneratedCode({
        ...asset,
        quantity: qty,
        amount: price,
        unitPrice: qty ? price / qty : 0,
        qltkDepartmentId: alloc.departmentId,
        qltkDepartmentName: alloc.departmentName
      }, { projectLabel: ctx.projectLabel, packageLabel: ctx.packageLabel, category: cat, acceptanceDate: ctx.acceptanceDate }, cat.code);
      const extId = created?.id ?? created?.asset_id ?? '';
      if (!extId) throw new Error('QLTS không trả về ID tài sản');
      asset.qltkItems.push({
        id: extId, code: created?.asset_code || '',
        departmentId: alloc.departmentId, departmentName: alloc.departmentName,
        quantity: qty, allocIndex: i
      });
      createdCount++;
    } else {
      const need = Math.max(0, Math.round(alloc.quantity) - existing.length);
      for (let n = 0; n < need; n++) {
        const created = await qltkCreateAssetWithGeneratedCode({
          ...asset,
          quantity: 1,
          amount: Math.round(unitPrice),
          unitPrice,
          qltkDepartmentId: alloc.departmentId,
          qltkDepartmentName: alloc.departmentName
        }, { projectLabel: ctx.projectLabel, packageLabel: ctx.packageLabel, category: cat, acceptanceDate: ctx.acceptanceDate }, cat.code);
        const extId = created?.id ?? created?.asset_id ?? '';
        if (!extId) throw new Error('QLTS không trả về ID tài sản');
        asset.qltkItems.push({
          id: extId, code: created?.asset_code || '',
          departmentId: alloc.departmentId, departmentName: alloc.departmentName,
          quantity: 1, allocIndex: i
        });
        createdCount++;
      }
    }
  }

  const expected = bulk
    ? allocations.length
    : allocations.reduce((s, a) => s + Math.round(a.quantity), 0);
  const done = asset.qltkItems.length >= expected;
  asset.qltkId = asset.qltkItems[0]?.id || '';
  const codes = [...new Set(asset.qltkItems.map(x => x.code).filter(Boolean))];
  asset.qltkCode = codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : '');
  asset.qltkDepartmentName = [...new Set(allocations.map(a => a.departmentName).filter(Boolean))].slice(0, 3).join(', ') || asset.qltkDepartmentName || '';
  asset.qltkSyncedAt = done ? new Date().toISOString() : (asset.qltkSyncedAt || '');
  asset.qltkError = done ? '' : `Đã đồng bộ ${asset.qltkItems.length}/${expected} tài sản`;
  return { created: createdCount > 0 };
}

app.post('/api/qltk/sync-assets', requireAuth, requireAdmin, async (req, res) => {
  if (!qltk.isConfigured()) {
    return res.status(400).json({ error: 'Chưa cấu hình kết nối QLTS (QLTS_USERNAME / QLTS_PASSWORD)' });
  }
  const { projectId, packageId, assetIds, departmentId } = req.body || {};
  const state = db.getState();
  const project = (state.projects || []).find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

  const targets = [];
  (project.categories || []).forEach(cat => (cat.packages || []).forEach(pkg => {
    if (packageId && pkg.id !== packageId) return;
    (pkg.assets || []).forEach(a => targets.push({ asset: a, pkg }));
  }));
  if (!packageId) (project.assets || []).forEach(a => targets.push({ asset: a, pkg: null }));

  const only = Array.isArray(assetIds) && assetIds.length ? new Set(assetIds.map(String)) : null;
  const list = targets.filter(t => !only || only.has(String(t.asset.id)));
  const summary = { total: list.length, synced: 0, skipped: 0, failed: 0, errors: [] };

  let opts;
  try {
    opts = await qltk.getOptions();
  } catch (err) {
    console.error('[QLDA] Lỗi kết nối QLTS:', err.message);
    return res.status(502).json({ error: 'Không kết nối được hệ thống QLTS' });
  }
  const catById = new Map(opts.categories.map(c => [String(c.id), c]));
  const projectLabel = [project.code, project.name].filter(Boolean).join(' - ');

  for (const { asset, pkg } of list) {
    try {
      const result = await qltkSyncOneAsset(asset, {
        catById, projectLabel, packageLabel: pkg?.name || '', departmentId,
        acceptanceDate: qltkLatestAcceptanceDate(pkg)
      });
      if (result.created) summary.synced++;
      else summary.skipped++;
    } catch (err) {
      summary.failed++;
      asset.qltkError = err.message;
      if (summary.errors.length < 20) summary.errors.push({ asset: asset.name || asset.id, error: err.message });
    }
  }

  if (summary.synced || summary.failed) db.saveStateToDb(state);
  res.json({ ok: true, summary });
});

// ---- File attachments (PDF, Word, Excel, Ảnh, Văn bản) ----
const FILE_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain'
};
const fileExt = (name) => path.extname(name || '').toLowerCase();
const fileMime = (name) => FILE_MIME_MAP[fileExt(name)] || 'application/octet-stream';

function isValidFileContent(ext, buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return false;
  if (ext === '.pdf') return buf.slice(0, 5).toString('latin1') === '%PDF-';
  if (ext === '.png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  if (ext === '.jpg' || ext === '.jpeg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (ext === '.docx' || ext === '.xlsx') {
    return buf[0] === 0x50 && buf[1] === 0x4B && [0x03, 0x05, 0x07].includes(buf[2]) && [0x04, 0x06, 0x08].includes(buf[3]);
  }
  if (ext === '.doc' || ext === '.xls') {
    return buf.slice(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));
  }
  if (ext === '.txt') return !buf.includes(0);
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!FILE_MIME_MAP[fileExt(file.originalname)]) {
      return cb(new Error('Định dạng không được hỗ trợ'));
    }
    cb(null, true);
  }
});

app.post('/api/pdfs', requireAuth, requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File quá lớn (tối đa 50MB)' });
      }
      return res.status(400).json({ error: err.message || 'Tải file thất bại' });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file được tải lên' });
  let filename = req.file.originalname;
  try {
    filename = Buffer.from(filename, 'latin1').toString('utf8');
  } catch (e) {}
  const id = crypto.randomUUID();
  const ext = fileExt(filename);
  if (!FILE_MIME_MAP[ext] || !isValidFileContent(ext, req.file.buffer)) {
    return res.status(400).json({ error: 'Nội dung file không khớp với định dạng cho phép' });
  }
  fs.writeFileSync(path.join(db.UPLOADS_DIR, id + ext), req.file.buffer, { mode: 0o600 });
  db.addPdfRecord(id, filename, req.file.size);
  res.json({ id, name: filename, size: req.file.size });
});

app.get('/api/pdfs/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
  const record = db.getPdfRecord(id);
  if (!record) return res.status(404).json({ error: 'Không tìm thấy file' });
  const filePath = path.join(db.UPLOADS_DIR, id + fileExt(record.name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File không tồn tại trên đĩa' });
  res.setHeader('Content-Type', fileMime(record.name));
  const safeName = String(record.name || 'file').replace(/[\r\n"]/g, '');
  const inline = ['.pdf', '.png', '.jpg', '.jpeg'].includes(fileExt(record.name));
  res.setHeader('Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(safeName)}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
});

app.delete('/api/pdfs/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID không hợp lệ' });
  const record = db.getPdfRecord(id);
  if (record) {
    fs.rm(path.join(db.UPLOADS_DIR, id + fileExt(record.name)), { force: true }, () => {});
    db.deletePdfRecord(id);
  }
  res.json({ ok: true });
});

// ---- Backup & Restore API (Admin only) ----
app.get('/api/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    const state = db.getState();
    const pdfsMeta = db.listAllPdfs();
    const pdfFiles = {};
    pdfsMeta.forEach(pdf => {
      const filePath = path.join(db.UPLOADS_DIR, pdf.id + fileExt(pdf.name));
      if (fs.existsSync(filePath)) {
        pdfFiles[pdf.id] = fs.readFileSync(filePath).toString('base64');
      }
    });

    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      state,
      pdfMetadata: pdfsMeta,
      pdfFiles
    };

    const filename = `QLDA_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo bản sao lưu: ' + err.message });
  }
});

app.post('/api/restore', requireAuth, requireAdmin, jsonLarge, (req, res) => {
  try {
    const backup = req.body;
    if (!backup || !backup.state || !Array.isArray(backup.state.projects)) {
      return res.status(400).json({ error: 'File sao lưu không đúng định dạng QLDA' });
    }

    const pdfs = Array.isArray(backup.pdfMetadata) ? backup.pdfMetadata : [];
    const hasPdfFiles = backup.pdfFiles && typeof backup.pdfFiles === 'object';

    for (const meta of pdfs) {
      if (!meta || typeof meta.id !== 'string' || !UUID_RE.test(meta.id)) {
        return res.status(400).json({ error: 'File sao lưu chứa PDF có ID không hợp lệ' });
      }
    }

    db.saveStateToDb(backup.state);

    if (hasPdfFiles) {
      const uploadsRoot = path.resolve(db.UPLOADS_DIR) + path.sep;
      for (const meta of pdfs) {
        const name = typeof meta.name === 'string' ? meta.name : '';
        const ext = fileExt(name);
        if (!FILE_MIME_MAP[ext]) continue;
        const target = path.resolve(path.join(db.UPLOADS_DIR, meta.id + ext));
        if (!target.startsWith(uploadsRoot)) continue;
        if (!db.getPdfRecord(meta.id)) {
          const size = Number(meta.size);
          db.addPdfRecord(meta.id, name, Number.isFinite(size) && size > 0 ? size : 0);
        }
        const b64 = backup.pdfFiles[meta.id];
        if (typeof b64 === 'string' && b64.length > 0) {
          const buf = Buffer.from(b64, 'base64');
          if (buf.length && buf.length <= 50 * 1024 * 1024) {
            fs.writeFileSync(target, buf, { mode: 0o600 });
          }
        }
      }
    }

    res.json({ ok: true, message: 'Phục hồi dữ liệu thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi phục hồi dữ liệu: ' + err.message });
  }
});

// Nạp/đồng bộ dự án mẫu (seed) vào dữ liệu hiện tại — bổ sung dự án có sẵn (vd dự án D,E)
// Không xóa các dự án khác; dự án cùng id sẽ được cập nhật đầy đủ theo seed.
app.post('/api/admin/import-seed', requireAuth, requireAdmin, (req, res) => {
  try {
    const seed = require('./seed-data');
    const state = db.getState();
    state.projects = Array.isArray(state.projects) ? state.projects : [];
    let created = 0, updated = 0;
    for (const sp of seed) {
      const clone = JSON.parse(JSON.stringify(sp));
      const idx = state.projects.findIndex(p => p.id === sp.id);
      if (idx >= 0) { state.projects[idx] = clone; updated += 1; }
      else { state.projects.push(clone); created += 1; }
    }
    if (!state.currentProjectId) state.currentProjectId = state.projects[0]?.id || null;
    db.saveStateToDb(state);
    res.json({ ok: true, created, updated, totalProjects: state.projects.length });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi nạp dự án mẫu: ' + err.message });
  }
});

// Nhập dự án từ file Excel theo mẫu "TÌNH HÌNH THỰC HIỆN DỰ ÁN"
app.post('/api/admin/import-project-excel', requireAuth, requireAdmin, jsonLarge, (req, res) => {
  try {
    const { contentBase64, sheetName } = req.body || {};
    if (!contentBase64) return res.status(400).json({ error: 'Thiếu nội dung file Excel' });
    const buf = Buffer.from(String(contentBase64).replace(/^data:.*;base64,/, ''), 'base64');
    if (!buf.length) return res.status(400).json({ error: 'File rỗng hoặc không hợp lệ' });
    const project = excelImport.parseWorkbook(buf, sheetName || undefined);
    if (!project) return res.status(400).json({ error: 'Không đọc được dự án. Cần đúng mẫu "TÌNH HÌNH THỰC HIỆN DỰ ÁN".' });
    const state = db.getState();
    state.projects = Array.isArray(state.projects) ? state.projects : [];
    const dup = state.projects.find(p => (p.name || '').trim().toLowerCase() === (project.name || '').trim().toLowerCase());
    if (dup) project.name = project.name + ' (nhập ' + new Date().toISOString().slice(0, 10) + ')';
    project.fullName = project.fullName || project.name;
    state.projects.push(project);
    if (!state.currentProjectId) state.currentProjectId = project.id;
    db.saveStateToDb(state);
    res.json({
      ok: true, projectId: project.id, name: project.name,
      categories: project.categories.length,
      packages: project.categories.reduce((a, c) => a + c.packages.length, 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi nhập Excel: ' + err.message });
  }
});

// Tải file Excel mẫu để nhập danh mục tài sản
app.get('/api/admin/import-asset-template', requireAuth, requireAdmin, (req, res) => {
  try {
    const headers = ['STT', 'TÊN THIẾT BỊ', 'ĐVT', 'SL', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'ĐẶT Ở', 'GHI CHÚ', 'NGÀY NGHIỆM THU', 'NĂM ĐƯA VÀO SỬ DỤNG'];
    const data = [
      headers,
      ['', 'A. Dự án mẫu - Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ', '', '', '', '', '', '', '', ''],
      ['', 'I. Gói thầu mẫu - Công ty TNHH ABC', '', '', '', '', '', '', '', ''],
      ['1', 'Máy tính để bàn', 'Cái', 2, 15000000, 30000000, 'Phòng CNTT', 'Ví dụ dòng tài sản', '2025-12-31', '2026'],
      ['2', 'Màn hình máy tính 24 inch', 'Cái', 2, 3000000, 6000000, 'Phòng CNTT', '', '2025-12-31', '2026'],
      ['', 'II. Gói thầu mẫu 2 - Công ty TNHH XYZ', '', '', '', '', '', '', '', ''],
      ['1', 'Máy in laser', 'Cái', 1, 5000000, 5000000, 'Phòng Kế toán', '', '2025-12-31', '2026'],
      ['', 'B. Dự án mẫu 2 - Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ', '', '', '', '', '', '', '', ''],
      ['', 'I. Gói thầu mẫu - Công ty TNHH DEF', '', '', '', '', '', '', '', ''],
      ['1', 'Tủ lạnh', 'Cái', 1, 8000000, 8000000, 'Khoa Cơ khí', '', '2025-12-31', '2026']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 6 }, { wch: 52 }, { wch: 8 }, { wch: 8 }, { wch: 16 },
      { wch: 16 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 18 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TB CÁC DỰ ÁN');

    const guide = [
      ['HƯỚNG DẪN NHẬP DANH MỤC TÀI SẢN TỪ EXCEL'],
      [''],
      ['1. Nhập dữ liệu vào sheet "TB CÁC DỰ ÁN". Không đổi tên các cột tiêu đề.'],
      ['2. Dòng dự án: cột B bắt đầu bằng "A. ", "B. ", "C. "... (mỗi dự án một chữ cái).'],
      ['3. Dòng gói thầu: cột B bắt đầu bằng "I. ", "II. ", "III. "...'],
      ['   Có thể ghi "I. Tên gói thầu - Tên nhà cung cấp" để tách nhà cung cấp.'],
      ['4. Dòng tài sản: cột STT là số (1, 2, 3...), điền TÊN THIẾT BỊ, ĐVT, SL, ĐƠN GIÁ, THÀNH TIỀN.'],
      ['5. Cột NGÀY NGHIỆM THU dùng để QLTS ghi nhận ngày đưa vào sử dụng/khấu hao.'],
      ['6. Cột NĂM ĐƯA VÀO SỬ DỤNG dùng để QLTS tính khấu hao. Nếu để trống, khi đồng bộ sẽ lấy năm theo biên bản nghiệm thu của gói thầu; nếu chưa có nghiệm thu thì để trống, không tự gán năm.'],
      ['7. Các cột ĐẶT Ở, GHI CHÚ có thể để trống.'],
      ['8. Sau khi nhập vào QLDA, mở từng tài sản để chọn Phòng/khoa nhận sử dụng và Loại tài sản QLTS.'],
      ['9. Kiểm tra file trước khi nhập để xem cảnh báo/lỗi.']
    ];
    const guideWs = XLSX.utils.aoa_to_sheet(guide);
    guideWs['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, guideWs, 'HƯỚNG DẪN');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mau-nhap-tai-san.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo file mẫu: ' + err.message });
  }
});

// Kiểm tra file Excel tài sản trước khi nhập
app.post('/api/admin/preview-asset-excel', requireAuth, requireAdmin, jsonLarge, (req, res) => {
  try {
    const { contentBase64, sheetName, overwrite, defaultYear, defaultAcceptanceDate } = req.body || {};
    if (!contentBase64) return res.status(400).json({ error: 'Thiếu nội dung file Excel' });
    const buf = Buffer.from(String(contentBase64).replace(/^data:.*;base64,/, ''), 'base64');
    if (!buf.length) return res.status(400).json({ error: 'File rỗng hoặc không hợp lệ' });
    const result = assetImport.validateWorkbook(buf, sheetName || undefined, defaultYear, defaultAcceptanceDate);
    const state = db.getState();
    const existing = new Set((state.projects || []).map(p => `${(p.name || '').trim().toLowerCase()}|${p.code || ''}`));
    let create = 0, update = 0, skip = 0;
    (result.projects || []).forEach(np => {
      const key = `${(np.name || '').trim().toLowerCase()}|${np.code || ''}`;
      if (existing.has(key)) {
        if (overwrite) update += 1;
        else skip += 1;
      } else create += 1;
    });
    const preview = (result.projects || []).slice(0, 20).map(p => {
      const pkgs = p.categories?.[0]?.packages || [];
      return {
        name: p.name, code: p.code,
        packages: pkgs.length,
        assets: pkgs.reduce((s, pk) => s + (pk.assets || []).length, 0)
      };
    });
    res.json({
      ok: result.errors.length === 0,
      errors: result.errors.slice(0, 50),
      warnings: result.warnings.slice(0, 50),
      stats: { ...(result.stats || {}), create, update, skip },
      preview
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi kiểm tra file: ' + err.message });
  }
});

// Nhập danh mục tài sản từ Excel "BÁO CÁO TĂNG TÀI SẢN ..." (sheet "TB CÁC DỰ ÁN")
// Phân cấp: A/B/C... = dự án; I/II/... = gói thầu; dòng STT = tài sản
app.post('/api/admin/import-asset-excel', requireAuth, requireAdmin, jsonLarge, (req, res) => {
  try {
    const { contentBase64, sheetName, overwrite, defaultYear, defaultAcceptanceDate } = req.body || {};
    if (!contentBase64) return res.status(400).json({ error: 'Thiếu nội dung file Excel' });
    const buf = Buffer.from(String(contentBase64).replace(/^data:.*;base64,/, ''), 'base64');
    if (!buf.length) return res.status(400).json({ error: 'File rỗng hoặc không hợp lệ' });
    const checked = assetImport.validateWorkbook(buf, sheetName || undefined, defaultYear, defaultAcceptanceDate);
    if (checked.errors.length) {
      return res.status(400).json({
        error: 'File có lỗi, chưa nhập. ' + checked.errors[0],
        details: checked.errors.slice(0, 50)
      });
    }
    const projects = checked.projects;
    if (!projects || !projects.length) return res.status(400).json({ error: 'Không đọc được dữ liệu. Cần sheet "TB CÁC DỰ ÁN".' });
    const state = db.getState();
    state.projects = Array.isArray(state.projects) ? state.projects : [];
    const QLTK_FIELDS = ['qltkId', 'qltkCode', 'qltkSyncedAt', 'qltkItems', 'qltkDepartmentId',
      'qltkDepartmentName', 'qltkCategoryId', 'qltkCategoryName', 'qltkCategoryCode',
      'qltkAllocations', 'qltkError'];
    let created = 0, updated = 0, skipped = 0, assets = 0, packages = 0;
    for (const np of projects) {
      const idx = state.projects.findIndex(p => (p.name || '').trim().toLowerCase() === (np.name || '').trim().toLowerCase() && (p.code || '') === (np.code || ''));
      if (idx >= 0) {
        // Mặc định không ghi đè dự án đã có để tránh mất chỉnh sửa thủ công.
        if (!overwrite) { skipped += 1; continue; }
        const prev = state.projects[idx];
        np.id = prev.id;
        np.auditLog = prev.auditLog || [];
        const links = new Map();
        for (const c of (prev.categories || [])) for (const pk of (c.packages || [])) for (const a of (pk.assets || [])) {
          if (a.code) links.set(a.code, a);
        }
        for (const c of (np.categories || [])) for (const pk of (c.packages || [])) for (const a of (pk.assets || [])) {
          const old = links.get(a.code);
          if (!old) continue;
          for (const k of QLTK_FIELDS) if (old[k] !== undefined) a[k] = old[k];
        }
        state.projects[idx] = np;
        updated += 1;
      } else {
        state.projects.push(np);
        created += 1;
      }
      assets += (np.categories || []).reduce((s, c) => s + (c.packages || []).reduce((x, pk) => x + (pk.assets || []).length, 0), 0);
      packages += np.categories.reduce((a, c) => a + c.packages.length, 0);
    }
    if (!state.currentProjectId) state.currentProjectId = state.projects[0]?.id || null;
    db.saveStateToDb(state);
    res.json({ ok: true, created, updated, skipped, assets, packages, totalProjects: state.projects.length });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi nhập Excel tài sản: ' + err.message });
  }
});

// ---- Tự động sao lưu định kỳ (bảo vệ chống mất dữ liệu) ----
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const MAX_AUTO_BACKUPS = 1; // chỉ giữ bản sao lưu gần nhất, tự xóa bản cũ
const AUTO_BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_HOURS || 6) * 3600 * 1000;

function buildBackup() {
  const state = db.getState();
  const pdfsMeta = db.listAllPdfs();
  const pdfFiles = {};
  pdfsMeta.forEach(pdf => {
    const filePath = path.join(db.UPLOADS_DIR, pdf.id + fileExt(pdf.name));
    if (fs.existsSync(filePath)) pdfFiles[pdf.id] = fs.readFileSync(filePath).toString('base64');
  });
  return { version: 1, timestamp: new Date().toISOString(), state, pdfMetadata: pdfsMeta, pdfFiles };
}

function restoreBackupData(backup) {
  db.saveStateToDb(backup.state);
  const pdfs = Array.isArray(backup.pdfMetadata) ? backup.pdfMetadata : [];
  const uploadsRoot = path.resolve(db.UPLOADS_DIR) + path.sep;
  const allowedExt = new Set(Object.keys(FILE_MIME_MAP));
  if (backup.pdfFiles && typeof backup.pdfFiles === 'object') {
    for (const meta of pdfs) {
      if (!meta || typeof meta.id !== 'string' || !UUID_RE.test(meta.id)) continue;
      const name = typeof meta.name === 'string' ? meta.name : '';
      const ext = fileExt(name);
      if (!allowedExt.has(ext)) continue;
      const target = path.resolve(path.join(db.UPLOADS_DIR, meta.id + ext));
      if (!target.startsWith(uploadsRoot)) continue;
      if (!db.getPdfRecord(meta.id)) {
        const size = Number(meta.size);
        db.addPdfRecord(meta.id, name, Number.isFinite(size) && size > 0 ? size : 0);
      }
      const b64 = backup.pdfFiles[meta.id];
      if (typeof b64 === 'string' && b64.length > 0) {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length && buf.length <= 50 * 1024 * 1024) {
          fs.writeFileSync(target, buf, { mode: 0o600 });
        }
      }
    }
  }
}

function createAutomaticBackup() {
  try {
    if (!(db.getState().projects || []).length) return; // không sao lưu khi chưa có dữ liệu
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(BACKUP_DIR, `backup-${stamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(buildBackup(), null, 2), { mode: 0o600 });
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
    while (files.length > MAX_AUTO_BACKUPS) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
    console.log(`[QLDA] Đã sao lưu tự động: ${path.basename(filePath)}`);
  } catch (err) {
    console.error('[QLDA] Lỗi sao lưu tự động:', err.message);
  }
}

setTimeout(createAutomaticBackup, 10000);
setInterval(createAutomaticBackup, AUTO_BACKUP_INTERVAL_MS);

app.get('/api/backups', requireAuth, requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json({ backups: [] });
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(filePath);
        let projectCount = 0;
        try {
          const b = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          projectCount = (b.state?.projects || []).length;
        } catch (_) { /* bỏ qua file lỗi */ }
        return { filename: f, size: stat.size, mtime: stat.mtimeMs, projectCount };
      });
    res.json({ backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/:filename/restore', requireAuth, requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^backup-[0-9A-Za-z._-]+\.json$/.test(filename)) {
    return res.status(400).json({ error: 'Tên bản sao lưu không hợp lệ' });
  }
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Không tìm thấy bản sao lưu' });
  try {
    const backup = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!backup.state || !Array.isArray(backup.state.projects)) {
      return res.status(400).json({ error: 'Bản sao lưu không hợp lệ' });
    }
    restoreBackupData(backup);
    res.json({ ok: true, message: 'Đã phục hồi từ bản sao lưu tự động' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi phục hồi: ' + err.message });
  }
});

// ---- Cấu hình nghiệp vụ (admin) ----
app.get('/api/config', requireAuth, (req, res) => {
  res.json(db.getConfig());
});

app.put('/api/config', requireAuth, requireAdmin, (req, res) => {
  try {
    const cfg = (req.body && req.body.config) || req.body || {};
    if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: 'Dữ liệu cấu hình không hợp lệ' });
    if (cfg.templates && !Array.isArray(cfg.templates)) delete cfg.templates;
    if (cfg.agencies && !Array.isArray(cfg.agencies)) delete cfg.agencies;
    if (cfg.lists && typeof cfg.lists !== 'object') delete cfg.lists;
    cfg.updatedAt = Date.now();
    db.saveConfig(cfg);
    res.json({ ok: true, config: db.getConfig() });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi lưu cấu hình: ' + err.message });
  }
});

// ---- Export Excel (SheetJS) ----
app.get('/api/export/excel', requireAuth, (req, res) => {
  try {
    const state = db.getState();
    const { projectId } = req.query;
    const projects = projectId ? state.projects.filter(p => p.id === projectId) : state.projects;
    if (projectId && projects.length === 0) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const wb = XLSX.utils.book_new();

    // Sheet 1: Danh sách dự án
    const projRows = projects.map(p => ({
      'Tên dự án': p.name,
      'Tên đầy đủ': p.fullName || '',
      'Chủ đầu tư': p.owner || '',
      'Địa điểm': p.location || '',
      'Tổng mức đầu tư': p.totalInvestment || 0,
      'Loại dự án': p.projectType || '',
      'Cấp công trình': p.buildingGrade || '',
      'Trạng thái quyết toán': p.settlement?.status || ''
    }));
    const ws1 = XLSX.utils.json_to_sheet(projRows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Dự án');

    // Sheet 2: Gói thầu
    const pkgRows = [];
    projects.forEach(p => {
      (p.categories || []).forEach(c => {
        (c.packages || []).forEach(pkg => {
          pkgRows.push({
            'Dự án': p.name,
            'Danh mục': c.name,
            'Tên gói thầu': pkg.name,
            'Phạm vi gói thầu': pkg.pkgScope === 'nonProject' ? 'Không hình thành dự án' : 'Thuộc dự án',
            'Loại hình mua sắm': pkg.purchaseType || '',
            'Giá trị trúng thầu': pkg.bidValue || 0,
            'Hình thức LCNT': pkg.selectionMethod || '',
            'Báo giá': pkg.quoteNumber || '',
            'KHLCNT': pkg.khlcntNumber || '',
            'Ngày thanh lý HĐ': pkg.liquidationDate || '',
            'Nhà thầu': pkg.contractor || '',
            'Tiến độ (%)': (pkg.pkgType === 'consulting' || pkg.pkgType === 'nonConsulting') ? '—' : (pkg.progress || 0),
            'Giải ngân lũy kế': pkg.cumulativeDisbursed || 0,
            'Trạng thái quyết toán': pkg.settlementStatus || ''
          });
        });
      });
    });
    const ws2 = XLSX.utils.json_to_sheet(pkgRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Gói thầu');

    // Sheet 3: Thanh toán
    const payRows = [];
    projects.forEach(p => {
      (p.categories || []).forEach(c => {
        (c.packages || []).forEach(pkg => {
          (pkg.payments || []).forEach(pm => {
            payRows.push({
              'Dự án': p.name,
              'Gói thầu': pkg.name,
              'Ngày': pm.date,
              'Giá trị nghiệm thu': pm.acceptanceValue || 0,
              'Giá trị hóa đơn': pm.invoiceValue || 0,
              'Số hóa đơn': pm.invoiceNumber || '',
              'Ghi chú': pm.note || ''
            });
          });
        });
      });
    });
    const ws3 = XLSX.utils.json_to_sheet(payRows);
    XLSX.utils.book_append_sheet(wb, ws3, 'Thanh toán');

    // Sheet 4: Phát sinh
    const varRows = [];
    projects.forEach(p => {
      (p.categories || []).forEach(c => {
        (c.packages || []).forEach(pkg => {
          (pkg.variations || []).forEach(vr => {
            varRows.push({
              'Dự án': p.name,
              'Gói thầu': pkg.name,
              'Ngày': vr.date,
              'Lý do': vr.reason || '',
              'Giá trị': vr.amount || 0,
              'Trạng thái': vr.status || '',
              'Người duyệt': vr.approvedBy || ''
            });
          });
        });
      });
    });
    const ws4 = XLSX.utils.json_to_sheet(varRows);
    XLSX.utils.book_append_sheet(wb, ws4, 'Phát sinh');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const rawName = projects.length === 1 ? projects[0].name : 'Export';
    // Content-Disposition chỉ chấp nhận ASCII trong phần filename=; dùng filename*= (RFC 5987) cho tên có dấu
    const asciiName = rawName
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'Export';
    const utf8Name = encodeURIComponent(`QLDA_${rawName}.xlsx`);
    res.setHeader('Content-Disposition', `attachment; filename="QLDA_${asciiName}.xlsx"; filename*=UTF-8''${utf8Name}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xuất Excel: ' + err.message });
  }
});

// ---- Kho văn bản pháp luật (tra cứu + nguồn cho chatbot) ----
app.get('/api/legal/docs', requireAuth, (req, res) => {
  res.json(legal.getDocuments());
});

app.get('/api/legal/doc/:id', requireAuth, (req, res) => {
  const outline = legal.getOutline(req.params.id);
  if (!outline.length) return res.status(404).json({ error: 'Không tìm thấy văn bản' });
  res.json(outline);
});

app.get('/api/legal/doc/:id/full', requireAuth, (req, res) => {
  const doc = legal.getDocument(req.params.id);
  if (!doc || !doc.articles.length) return res.status(404).json({ error: 'Không tìm thấy văn bản' });
  res.json(doc);
});

app.get('/api/legal/article', requireAuth, (req, res) => {
  const art = legal.getArticle(String(req.query.doc || ''), String(req.query.article || ''));
  if (!art) return res.status(404).json({ error: 'Không tìm thấy điều khoản' });
  res.json(art);
});

app.get('/api/legal/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 300);
  if (!q) return res.json([]);
  const docs = req.query.doc ? String(req.query.doc).split(',') : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 40);
  res.json(legal.search(q, { limit, docs }));
});

// ---- Kho tri thức pháp luật tự học (wiki) ----
app.get('/api/wiki/entries', requireAuth, (req, res) => {
  const status = req.user.role === 'admin' ? (req.query.status || '') : 'approved';
  res.json(wiki.list(status));
});

app.get('/api/wiki/stats', requireAuth, (req, res) => {
  const stats = wiki.countByStatus();
  if (req.user.role !== 'admin') stats.pending = 0;
  res.json(stats);
});

app.get('/api/wiki/graph', requireAuth, (req, res) => {
  const graph = wiki.graph();
  if (req.user.role !== 'admin') {
    const allowed = new Set(wiki.list('approved').map(e => e.id));
    graph.nodes = graph.nodes.filter(n => allowed.has(n.id));
    graph.edges = graph.edges.filter(e => allowed.has(e.from) && allowed.has(e.to));
  }
  res.json(graph);
});

app.post('/api/wiki/entries/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const e = wiki.approve(req.params.id);
  if (!e) return res.status(404).json({ error: 'Không tìm thấy mục' });
  res.json(e);
});

app.delete('/api/wiki/entries/:id', requireAuth, requireAdmin, (req, res) => {
  wiki.reject(req.params.id);
  res.json({ ok: true });
});

function parseJsonObject(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

// ---- AI Assistant (đa nhà cung cấp: Gemini hoặc API tương thích OpenAI) ----
const ai = require('./ai-client');

// Giới hạn số lần gọi AI theo người dùng để tránh lạm dụng quota/chi phí.
const AI_WINDOW_MS = 10 * 60 * 1000;
const AI_MAX_REQUESTS = 30;
const aiUsage = new Map();
function aiRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.user.id;
  let rec = aiUsage.get(key);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + AI_WINDOW_MS };
    aiUsage.set(key, rec);
  }
  if (rec.count >= AI_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Bạn đã dùng trợ lý AI quá nhiều lần. Vui lòng thử lại sau ít phút.' });
  }
  rec.count++;
  if (aiUsage.size > 5000) {
    for (const [k, v] of aiUsage) if (now > v.resetAt) aiUsage.delete(k);
    if (aiUsage.size > 5000) aiUsage.clear();
  }
  next();
}

let wikiIngestBusy = false;

// Lưu một cặp hỏi-đáp vào kho tri thức (AI chắt lọc thành mục khái niệm -> chờ duyệt)
app.post('/api/wiki/learn', requireAuth, aiRateLimit, async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ error: 'Chưa cấu hình API AI' });
  const question = String(req.body?.question || '').slice(0, 4000);
  const answer = String(req.body?.answer || '').slice(0, 12000);
  if (!question || !answer) return res.status(400).json({ error: 'Thiếu câu hỏi hoặc câu trả lời' });
  try {
    const system = 'Bạn là bộ trích xuất tri thức pháp luật. Từ cặp hỏi-đáp, tạo một mục wiki ngắn gọn dạng JSON thuần, ĐÚNG một đối tượng: {"title": "...", "content": "...", "sources": [{"doc":"Mã văn bản","article":"Số điều"}]}. content tối đa 400 từ, chỉ ghi nội dung đã có trong câu trả lời, giữ nguyên số điều/khoản/hạn mức nếu có, không bịa. Nếu câu trả lời không chứa kiến thức pháp luật cần lưu, trả về {"skip": true}.';
    const text = await ai.chat({ system, messages: [{ role: 'user', text: `Hỏi: ${question}\nĐáp: ${answer}` }], maxTokens: 900 });
    const parsed = parseJsonObject(text);
    if (!parsed) throw new Error('AI trả về định dạng không hợp lệ');
    if (parsed.skip) return res.json({ skipped: true });
    if (!parsed.title) throw new Error('AI không tạo được mục wiki hợp lệ');
    const entry = wiki.add({
      type: 'concept',
      title: parsed.title,
      content: parsed.content || '',
      sources: Array.isArray(parsed.sources) ? parsed.sources.filter(s => s && s.doc) : []
    });
    res.json({ entry });
  } catch (err) {
    console.error('[QLDA] Lỗi wiki learn:', err.message);
    res.status(502).json({ error: 'Không tạo được mục kho tri thức. Vui lòng thử lại sau.' });
  }
});

// Ingest: tóm tắt các văn bản pháp luật chưa có trong kho (chỉ chạy một lần cho mỗi văn bản)
app.post('/api/wiki/ingest', requireAuth, requireAdmin, aiRateLimit, async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ error: 'Chưa cấu hình API AI' });
  if (wikiIngestBusy) return res.status(429).json({ error: 'Đang ingest văn bản, vui lòng thử lại sau.' });
  wikiIngestBusy = true;
  try {
    const docs = legal.getDocuments();
    const ingested = wiki.getIngestedDocs();
    const created = [];
    for (const d of docs) {
      if (ingested[d.id]) continue;
      const outline = legal.getOutline(d.id);
      if (!outline.length) continue;
      const titles = outline.slice(0, 40).map(a => (a.article ? a.article + (a.heading ? ' - ' + a.heading : '') : '')).filter(Boolean).join('; ');
      const system = 'Bạn tóm tắt một văn bản pháp luật thành mục wiki JSON thuần, ĐÚNG một đối tượng: {"title": "...", "content": "...", "sources": [{"doc":"ID"}]}. content là tóm tắt ngắn gọn phạm vi điều chỉnh và các điểm chính (tối đa 300 từ). Chỉ dùng thông tin được cung cấp, không bịa.';
      const text = await ai.chat({ system, messages: [{ role: 'user', text: `Văn bản: ${d.short || d.title || d.id} (${d.number || ''}). Danh mục điều/khoản: ${titles}` }], maxTokens: 900 });
      const parsed = parseJsonObject(text);
      if (!parsed || !parsed.title) continue;
      wiki.add({ type: 'source-summary', title: parsed.title, content: parsed.content || '', sources: [{ doc: d.id }] });
      wiki.markIngested(d.id, d.id);
      created.push(parsed.title);
    }
    res.json({ created });
  } catch (err) {
    console.error('[QLDA] Lỗi wiki ingest:', err.message);
    res.status(502).json({ error: 'Không ingest được văn bản. Vui lòng thử lại sau.' });
  } finally {
    wikiIngestBusy = false;
  }
});

// ---- Lịch sử hội thoại AI theo từng người dùng (tách kênh assistant/legal) ----
app.get('/api/ai/history', requireAuth, (req, res) => {
  const channel = String(req.query.channel || 'assistant');
  res.json({ messages: db.listChatMessages(req.user.id, 60, channel) });
});
app.post('/api/ai/history', requireAuth, (req, res) => {
  const { messages } = req.body || {};
  const channel = String((req.body && req.body.channel) || 'assistant');
  const list = (Array.isArray(messages) ? messages : (messages ? [messages] : [])).slice(0, 50);
  for (const m of list) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) continue;
    const role = (m.role === 'model' || m.role === 'assistant') ? 'model' : 'user';
    db.addChatMessage(req.user.id, role, m.text.slice(0, 6000), channel);
  }
  res.json({ ok: true });
});
app.delete('/api/ai/history', requireAuth, (req, res) => {
  const channel = String(req.query.channel || 'assistant');
  db.clearChatMessages(req.user.id, channel);
  res.json({ ok: true });
});

app.post('/api/ai/chat', requireAuth, aiRateLimit, async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ error: 'Chưa cấu hình API AI' });
  try {
    const { message, history } = req.body || {};
    const userMessage = String(message || '').slice(0, 4000);
    if (!userMessage.trim()) return res.status(400).json({ error: 'Thiếu nội dung tin nhắn' });
    // Lịch sử hội thoại gần nhất (câu hỏi nối tiếp như "còn khoản 2?" cần ngữ cảnh)
    const prior = (Array.isArray(history) ? history : []).slice(-6)
      .filter(h => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
      .map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', text: h.text.slice(0, 2000) }));
    const lastUser = [...prior].reverse().find(h => h.role === 'user')?.text || '';
    const legalCtx = legal.buildContext(`${userMessage} ${lastUser.slice(0, 300)}`);
    const wikiCtx = wiki.context(`${userMessage} ${lastUser.slice(0, 300)}`);

    // Build context from current project data
    const state = db.getState();
    const proj = state.projects.find(p => p.id === state.currentProjectId);
    let context = '';
    if (proj) {
      const pkgs = (proj.categories || []).flatMap(c => c.packages.map(p => ({ cat: c.name, ...p })));
      const totalDisbursed = pkgs.reduce((s, p) => s + (p.cumulativeDisbursed || 0), 0);
      const totalBid = pkgs.reduce((s, p) => s + (p.bidValue || 0), 0);
      const rate = (proj.totalInvestment || 0) > 0 ? (totalDisbursed / proj.totalInvestment * 100).toFixed(1) : '0';
      const pkgDetail = pkgs.map((p, i) => {
        const scope = p.pkgScope === 'nonProject' ? 'Mua sắm (không hình thành dự án)' : 'Thuộc dự án';
        const extra = [
          p.purchaseType ? `Loại hình: ${p.purchaseType}` : '',
          p.fundSource ? `Nguồn vốn: ${p.fundSource}` : '',
          p.quoteNumber ? `Báo giá: ${p.quoteNumber}` : '',
          p.khlcntNumber ? `KHLCNT: ${p.khlcntNumber}` : '',
          p.selectionMethod ? `Hình thức LCNT: ${p.selectionMethod}` : '',
          p.liquidationDate ? `Thanh lý HĐ: ${p.liquidationDate}` : ''
        ].filter(Boolean).join(', ');
        return `${i + 1}. [${scope}][${p.pkgType || 'N/A'}] ${p.name} — Giá trị trúng thầu: ${(p.bidValue || 0).toLocaleString('vi-VN')}đ, Lũy kế giải ngân: ${(p.cumulativeDisbursed || 0).toLocaleString('vi-VN')}đ, Nhà thầu: ${p.contractor || 'N/A'}, HĐ: ${p.contract || 'N/A'} (${p.contractSignDate || 'N/A'} → ${p.contractEndDate || 'N/A'}), Nghiệm thu: ${p.acceptanceStatus || 'Chưa'}${extra ? ', ' + extra : ''}${p.notes ? ', Ghi chú: ' + p.notes : ''}`;
      }).join('\n');
      const scopeLabel = proj.projectScope === 'nonProject' ? 'MUA SẮM (không hình thành dự án)' : 'DỰ ÁN (hình thành dự án)';
      context = `${scopeLabel}: ${proj.name} (${proj.projectGroup || 'N/A'}). Nguồn vốn: ${proj.investmentSource || 'N/A'}. Chủ đầu tư: ${proj.owner || 'N/A'}. Tổng mức đầu tư: ${(proj.totalInvestment || 0).toLocaleString('vi-VN')}đ. Trúng thầu: ${totalBid.toLocaleString('vi-VN')}đ. Giải ngân: ${totalDisbursed.toLocaleString('vi-VN')}đ (${rate}%). Trạng thái quyết toán: ${proj.settlement?.status || 'Chưa quyết toán'}. Ngày nộp hồ sơ QT: ${proj.settlementSubmissionDate || 'N/A'}.\n\nDANH SÁCH GÓI THẦU (${pkgs.length} gói):\n${pkgDetail}`;
    }

    // Legal documents reference
    const config = db.getConfig();
    const referenceDate = new Date().toISOString().slice(0, 10);
    const legalRef = (config.legalDocuments || []).map(d =>
      `${d.type} ${d.number} — ${d.title} (hiệu lực ${d.effectiveDate}; trạng thái tại ${referenceDate}: ${!d.effectiveDate || d.effectiveDate <= referenceDate ? 'đang áp dụng' : 'chưa có hiệu lực'}${d.domains ? '; lĩnh vực: ' + d.domains.join(', ') : ''}${d.workflowStages ? '; bước quy trình: ' + d.workflowStages.join(', ') : ''}${d.replaces ? '; thay thế/bãi bỏ: ' + d.replaces.join(', ') : ''}${d.note ? '. Nội dung: ' + d.note : ''})`
    ).join('\n');

    const systemPrompt = `Bạn là CHUYÊN GIA TƯ VẤN PHÁP LUẬT về đầu tư công, đấu thầu và xây dựng, tích hợp trong phần mềm QLDA của Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ (đơn vị sự nghiệp công lập). Trả lời như một luật sư tư vấn nội bộ: bám sát kho văn bản của phần mềm, trích dẫn chính xác Điều/Khoản, nêu rõ rủi ro và việc cần làm.

VAI TRÒ CỦA BẠN:
- Tư vấn, đánh giá, hướng dẫn về quản lý dự án đầu tư, mua sắm tài sản, sửa chữa thường xuyên, gói thầu, hợp đồng, thanh toán, quyết toán.
- Phân tích dữ liệu dự án để phát hiện rủi ro, chậm tiến độ, vượt dự toán.
- Gợi ý các bước tiếp theo trong quy trình quản lý dự án theo đúng pháp luật Việt Nam.
- Trả lời bằng tiếng Việt, ngắn gọn, thực tế, có dẫn chứng cụ thể từ dữ liệu.
- Không dùng ký tự markdown đặc biệt (**, #, -) trong câu trả lời. Viết dạng văn bản thuần.
- Trả lời đầy đủ ý trong 1 lần, không bỏ dở câu.

HỆ THỐNG VĂN BẢN PHÁP LUẬT ÁP DỤNG:
${legalRef}

QUY TRÌNH CHÍNH:
1. Lập & phê duyệt dự án → 2. Lựa chọn nhà thầu → 3. Ký hợp đồng → 4. Thi công/Thực hiện → 5. Nghiệm thu → 6. Thanh toán (qua Kho bạc) → 7. Quyết toán A-B → 8. Quyết toán dự án hoàn thành → 9. Bảo hành.

ÁNH XẠ 07 NGHỊ ĐỊNH HƯỚNG DẪN LUẬT XÂY DỰNG 135/2025/QH15:
1. NĐ 217/2026: chuẩn bị, thẩm định, phê duyệt, quản lý dự án, giấy phép, BIM.
2. NĐ 206/2026: tổng mức đầu tư, dự toán, giá gói thầu, định mức và quản lý chi phí.
3. NĐ 207/2026: thi công, chất lượng, an toàn, nghiệm thu, bàn giao, bảo hành và bảo trì.
4. NĐ 209/2026: lựa chọn, sử dụng và kiểm soát chất lượng vật liệu xây dựng.
5. NĐ 210/2026: ký, thực hiện, điều chỉnh, thanh toán, quyết toán và thanh lý hợp đồng xây dựng.
6. NĐ 212/2026: năng lực, chứng chỉ, mã định danh và dữ liệu dự án/công trình.
7. NĐ 193/2026: hồ sơ, kiểm toán, thẩm tra, phê duyệt quyết toán vốn, công nợ và tài sản.

Khi trả lời hoặc đánh giá quy trình: xác định ngày phát sinh nghiệp vụ trước; chỉ viện dẫn văn bản đã có hiệu lực tại ngày đó. Nêu rõ nghị định áp dụng cho từng bước, hồ sơ còn thiếu, rủi ro và hành động tiếp theo. Không tự suy diễn số điều/khoản nếu dữ liệu hệ thống không cung cấp.

LƯU Ý QUAN TRỌNG:
- Hạn mức chỉ định thầu (Khoản 4 Điều 78 NĐ 214/2025, đã sửa bởi NĐ 349/2026): gói thuộc dự toán mua sắm không hình thành dự án không quá 1 tỷ; gói tư vấn thuộc dự án không quá 3 tỷ; gói phi tư vấn, hàng hóa, xây lắp, hỗn hợp thuộc dự án không quá 5 tỷ.
- Gói thầu hoặc nội dung mua sắm có giá không quá 100 triệu đồng: Thủ trưởng cơ quan, đơn vị mua sắm quyết định và tự chịu trách nhiệm, phải bảo đảm hóa đơn, chứng từ đầy đủ (Khoản 4 Điều 80 NĐ 214/2025, đã sửa bởi NĐ 349/2026).
- Mua sắm, sửa chữa tài sản công tại đơn vị sự nghiệp công lập thực hiện theo Luật Quản lý, sử dụng tài sản công (97/VBHN-VPQH), NĐ 186/2025/NĐ-CP; tiêu chuẩn, định mức máy móc thiết bị theo QĐ 10/2026/QĐ-TTg.
- Đối với mua sắm không hình thành dự án: nguồn kinh phí thường là quỹ phát triển sự nghiệp / chi thường xuyên; trên 1 tỷ phải đấu thầu rộng rãi.
- Thời gian chủ đầu tư lập hồ sơ quyết toán tối đa (tính từ ngày bàn giao đưa vào sử dụng): dự án quan trọng quốc gia và nhóm A 09 tháng, nhóm B 06 tháng, nhóm C 04 tháng; thẩm tra tối đa 04 / 04 / 2,5 / 02 tháng; phê duyệt tối đa 15 / 15 / 10 / 07 ngày (Điều 21 NĐ 193/2026).
- NĐ 193/2026 (hiệu lực 01/7/2026) bãi bỏ Điều 30-47 NĐ 254/2025 về quyết toán dự án; quyết toán dự án thực hiện theo NĐ 193/2026.
- Mẫu biểu quyết toán hiện hành: TT 73/2026/TT-BTC (Mẫu 01-12/QTDA); dự án hoàn thành dùng Mẫu 01-07/QTDA.
- Hóa đơn GTGT phải cùng ngày với biên bản nghiệm thu (NĐ 123/2020).

QUY TẮC TRẢ LỜI PHÁP LUẬT:
- CHỈ trả lời dựa trên "CĂN CỨ PHÁP LUẬT TRÍCH TỪ KHO VĂN BẢN" và "TRI THỨC ĐÃ LƯU" được cung cấp bên dưới; không suy diễn ngoài các nguồn này.
- Mọi kết luận pháp lý BẮT BUỘC kèm trích dẫn dạng (Điều X, Khoản Y, tên văn bản). Nếu không có nguồn tương ứng, nói rõ "kho văn bản hiện chưa có nội dung này" và đề nghị kiểm tra văn bản gốc; không tự bịa.
- Nguồn đánh dấu ĐÃ HẾT HIỆU LỰC không được áp dụng; nêu văn bản thay thế nếu có.
- Kho văn bản hiện gồm 39 văn bản: Luật Đầu tư công (VBHN 03/2026), Luật Đấu thầu, NĐ 214/2025 (hợp nhất 36/2026), TT 79/2025, TT 134/2026 (+ Phụ lục), Luật Xây dựng (hợp nhất 146/2026), các NĐ 206, 207, 209, 210, 217, 220/2026, các TT 32, 33, 34, 36 (hợp nhất 89/2026), 37, 38, 39, 40, 41/2026/TT-BXD, NĐ 254/2025, NĐ 193/2026, TT 73/2026, NĐ 186/2025, NĐ 286/2025, NĐ 104/2026, QĐ 10/2026/QĐ-TTg, QĐ 1040/QĐ-BXD (kèm 07 mẫu hợp đồng xây dựng) và QĐ 1041/QĐ-BXD. Khi cần nội dung cụ thể, ưu tiên trích từ "CĂN CỨ PHÁP LUẬT TRÍCH TỪ KHO VĂN BẢN" bên dưới; nếu kho chưa có, nói rõ và đề nghị kiểm tra bản gốc.

CĂN CỨ PHÁP LUẬT TRÍCH TỪ KHO VĂN BẢN (theo câu hỏi hiện tại):
${legalCtx.text || '(Không tìm thấy đoạn văn bản liên quan trong kho)'}

TRI THỨC ĐÃ LƯU (kho tri thức tự học, nếu có):
${wikiCtx.text || '(Chưa có)'}

DỮ LIỆU DỰ ÁN HIỆN TẠI:\n${context}`;

    const reply = await ai.chat({
      system: systemPrompt,
      messages: [...prior, { role: 'user', text: userMessage }],
      maxTokens: 4000,
      temperature: 0.3
    });
    res.json({ reply, sources: legalCtx.sources });
  } catch (err) {
    console.error('[QLDA] Lỗi AI chat:', err.message);
    res.status(502).json({ error: 'Không gọi được trợ lý AI. Vui lòng thử lại sau.' });
  }
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(`[QLDA] ${req.method} ${req.path}`, err);
  const status = err.status || 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Lỗi máy chủ'
    : (err.message || 'Lỗi máy chủ');
  res.status(status).json({ error: message });
});

if (tlsOptions) {
  https.createServer(tlsOptions, app).listen(PORT, () => {
    console.log(`QLDA server (HTTPS) đang chạy tại https://localhost:${PORT}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`QLDA server (HTTP) đang chạy tại http://localhost:${PORT}`);
  });
}
