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
app.use(express.json({ limit: '10mb' }));

// ---- Security headers (không cần helmet) ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP: chỉ cho phép tài nguyên cùng nguồn và inline style cần thiết cho SPA
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
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
app.get('/login.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'login.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/style.css', (req, res) => res.sendFile(path.join(ROOT_DIR, 'style.css'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/logoCTEC.png', (req, res) => res.sendFile(path.join(ROOT_DIR, 'logoCTEC.png'), { headers: { 'Cache-Control': 'public, max-age=31536000' } }));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'manifest.json'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Content-Type': 'application/manifest+json' } }));
app.get('/sw.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'sw.js'), { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }));
app.get('/assets/material-symbols-rounded.css', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'material-symbols-rounded.css'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/material-symbols-rounded.woff2', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'material-symbols-rounded.woff2'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/inter-vietnamese.woff2', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'inter-vietnamese.woff2'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));
app.get('/assets/inter-latin.woff2', (req, res) => res.sendFile(path.join(ROOT_DIR, 'assets', 'inter-latin.woff2'), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }));

// ---- Auth API ----
// Rate limiter đơn giản theo IP (in-memory)
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20; // mỗi IP tối đa 20 lần / 15 phút

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + LOGIN_WINDOW_MS; }
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút.' });
  }
  rec.count++;
  loginAttempts.set(ip, rec);

  const user = db.getUserByUsername(username);
  if (!user) {
    // Timing-equalize + trả lỗi chung
    db.verifyUser(username, password);
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  if (db.isLocked(user)) {
    const mins = Math.ceil(db.getLockRemainingMs(user) / 60000);
    return res.status(429).json({ error: `Tài khoản bị khóa tạm thời. Thử lại sau ${mins} phút.` });
  }
  const verified = db.verifyUser(username, password);
  if (!verified) {
    db.recordFailedLogin(user.id);
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  db.resetFailedLogin(user.id);
  const session = db.createSession(user.id);
  res.json({
    accessToken: session.accessToken, refreshToken: session.refreshToken,
    accessExpiresAt: session.accessExpiresAt, expiresAt: session.expiresAt,
    user: { username: user.username, role: user.role, id: user.id, mustChangePassword: !!user.must_change_password }
  });
});

app.post('/api/logout', (req, res) => {
  const { refreshToken } = req.body || {};
  db.deleteSessionByRefreshToken(refreshToken);
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
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
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
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  const target = db.getUserById(id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  // Tự đổi mật khẩu (không phải admin) phải xác nhận mật khẩu hiện tại
  if (req.user.role !== 'admin' && req.user.id === id) {
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

app.put('/api/state', requireAuth, requireAdmin, (req, res) => {
  const { projects, currentProjectId } = req.body || {};
  if (!Array.isArray(projects)) {
    return res.status(400).json({ error: 'projects phải là một mảng' });
  }
  db.saveStateToDb({ projects, currentProjectId: currentProjectId || null });
  res.json({ ok: true });
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
  const safeExt = FILE_MIME_MAP[ext] ? ext : '.pdf';
  fs.writeFileSync(path.join(db.UPLOADS_DIR, id + safeExt), req.file.buffer);
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
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.name)}"`);
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

app.post('/api/restore', requireAuth, requireAdmin, (req, res) => {
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
      for (const meta of pdfs) {
        if (!db.getPdfRecord(meta.id)) {
          const size = Number(meta.size);
          db.addPdfRecord(meta.id, typeof meta.name === 'string' ? meta.name : '', Number.isFinite(size) && size > 0 ? size : 0);
        }
        const b64 = backup.pdfFiles[meta.id];
        if (typeof b64 === 'string' && b64.length > 0) {
          const buf = Buffer.from(b64, 'base64');
          if (buf.length && buf.length <= 50 * 1024 * 1024) {
            fs.writeFileSync(path.join(db.UPLOADS_DIR, meta.id + fileExt(meta.name)), buf);
          }
        }
      }
    }

    res.json({ ok: true, message: 'Phục hồi dữ liệu thành công' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi phục hồi dữ liệu: ' + err.message });
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
            'Giá trị trúng thầu': pkg.bidValue || 0,
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

// ---- AI Assistant (Gemini) ----
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
// Model đổi được qua env GEMINI_MODEL (không cần sửa code khi Google deprecate model)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  if (!GEMINI_KEY) return res.status(503).json({ error: 'Chưa cấu hình GEMINI_API_KEY' });
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Thiếu nội dung tin nhắn' });

    // Build context from current project data
    const state = db.getState();
    const proj = state.projects.find(p => p.id === state.currentProjectId);
    let context = '';
    if (proj) {
      const pkgs = (proj.categories || []).flatMap(c => c.packages.map(p => ({ cat: c.name, ...p })));
      const totalDisbursed = pkgs.reduce((s, p) => s + (p.cumulativeDisbursed || 0), 0);
      const totalBid = pkgs.reduce((s, p) => s + (p.bidValue || 0), 0);
      const rate = (proj.totalInvestment || 0) > 0 ? (totalDisbursed / proj.totalInvestment * 100).toFixed(1) : '0';
      const pkgDetail = pkgs.map((p, i) =>
        `${i + 1}. [${p.pkgType || 'N/A'}] ${p.name} — Giá trị: ${(p.bidValue || 0).toLocaleString('vi-VN')}đ, Tiến độ: ${p.progress || 0}%, Nhà thầu: ${p.contractor || 'N/A'}, HĐ: ${p.contract || 'N/A'}, Ngày HĐ: ${p.contractSignDate || 'N/A'} → ${p.contractEndDate || 'N/A'}, Nghiệm thu: ${p.acceptanceStatus || 'Chưa'}, Quyết toán: ${p.settlementStatus || 'Chưa'}${p.notes ? ', Ghi chú: ' + p.notes : ''}`
      ).join('\n');
      context = `DỰ ÁN: ${proj.name} (${proj.projectGroup || 'N/A'}). Nguồn vốn: ${proj.investmentSource || 'N/A'}. Chủ đầu tư: ${proj.owner || 'N/A'}. Tổng mức đầu tư: ${(proj.totalInvestment || 0).toLocaleString('vi-VN')}đ. Trúng thầu: ${totalBid.toLocaleString('vi-VN')}đ. Giải ngân: ${totalDisbursed.toLocaleString('vi-VN')}đ (${rate}%). Trạng thái quyết toán: ${proj.settlement?.status || 'Chưa quyết toán'}. Ngày nộp hồ sơ QT: ${proj.settlementSubmissionDate || 'N/A'}.\n\nDANH SÁCH GÓI THẦU (${pkgs.length} gói):\n${pkgDetail}`;
    }

    // Legal documents reference
    const config = db.getConfig();
    const referenceDate = new Date().toISOString().slice(0, 10);
    const legalRef = (config.legalDocuments || []).map(d =>
      `${d.type} ${d.number} — ${d.title} (hiệu lực ${d.effectiveDate}; trạng thái tại ${referenceDate}: ${!d.effectiveDate || d.effectiveDate <= referenceDate ? 'đang áp dụng' : 'chưa có hiệu lực'}${d.domains ? '; lĩnh vực: ' + d.domains.join(', ') : ''}${d.workflowStages ? '; bước quy trình: ' + d.workflowStages.join(', ') : ''}${d.replaces ? '; thay thế/bãi bỏ: ' + d.replaces.join(', ') : ''}${d.note ? '. Nội dung: ' + d.note : ''})`
    ).join('\n');

    const systemPrompt = `Bạn là trợ lý AI chuyên về quản lý dự án đầu tư xây dựng, tích hợp trong phần mềm QLDA của Trường Cao đẳng Kinh tế - Kỹ thuật Cần Thơ.

VAI TRÒ CỦA BẠN:
- Tư vấn, đánh giá, hướng dẫn về quản lý dự án, gói thầu, thanh toán, quyết toán vốn đầu tư công.
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
- Hạn mức chỉ định thầu theo NĐ 214/2025: tư vấn 800 triệu, xây lắp/hàng hóa/hỗn hợp 2 tỷ, mua sắm không dự án 500 triệu.
- Quyết toán dự án hoàn thành phải nộp trong 4 tháng kể từ ngày bàn giao đưa vào sử dụng (NĐ 193/2026).
- Mẫu biểu quyết toán hiện hành: TT 73/2026/TT-BTC (gồm Mẫu 01-12/QTDA).
- Hóa đơn GTGT phải cùng ngày với biên bản nghiệm thu (NĐ 123/2020).

DỮ LIỆU DỰ ÁN HIỆN TẠI:\n${context}`;

    const geminiRes = await fetch(`${GEMINI_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          { role: 'user', parts: [{ text: message }] }
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4000, topP: 0.9 }
      })
    });
    const data = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(data.error?.message || 'Lỗi API Gemini');
    // Ghép tất cả parts + kiểm tra truncation
    const cand = data.candidates?.[0];
    const reply = (cand?.content?.parts || []).map(p => p.text || '').join('');
    if (!reply) throw new Error('Không có phản hồi từ AI');
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi AI: ' + err.message });
  }
});

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Lỗi máy chủ' });
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
