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
const SESSION_COOKIE = 'qlda_sid';

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

// ---- Cookie helpers (no external dependency) ----
function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function setSessionCookie(res, token) {
  const secure = IS_HTTPS ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${secure}`);
}

function clearSessionCookie(res) {
  const secure = IS_HTTPS ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

// ---- Auth middleware ----
function requireAuth(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const session = token && db.getSession(token);
  if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const user = db.getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  req.user = { id: user.id, username: user.username, role: user.role };
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

// ---- Auth API ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  const user = db.verifyUser(username, password);
  if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  const session = db.createSession(user.id);
  setSessionCookie(res, session.id);
  res.json({ username: user.username, role: user.role, id: user.id, mustChangePassword: password === 'admin123' });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) db.deleteSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
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
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  const user = db.createUser(username, password, role === 'admin' ? 'admin' : 'user');
  res.status(201).json(user);
});

app.put('/api/users/:id/password', requireAuth, (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Bạn không có quyền đổi mật khẩu tài khoản này' });
  }
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  if (!db.getUserById(id)) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
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

app.post('/api/pdfs', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
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
    const wb = XLSX.utils.book_new();

    // Sheet 1: Danh sách dự án
    const projRows = state.projects.map(p => ({
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
    state.projects.forEach(p => {
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
    state.projects.forEach(p => {
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
    state.projects.forEach(p => {
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
    res.setHeader('Content-Disposition', 'attachment; filename=QLDA_Export.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xuất Excel: ' + err.message });
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
