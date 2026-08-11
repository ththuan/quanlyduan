/* ============================================================
   QLDA - Database layer (SQLite via Node's built-in node:sqlite)
   Stores:
     - app_state: single-row JSON blob with projects/categories/packages
     - pdf_files: metadata for uploaded PDF attachments (blob kept on disk)
     - users: login accounts (password hashed with scrypt)
     - sessions: server-side session tokens for cookie-based login
   ============================================================ */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const seedData = require('./seed-data');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'qlda.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pdf_files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    added_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sys_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
  );
`);

function saveStateToDb(state) {
  const json = JSON.stringify(state);
  db.prepare(`
    INSERT INTO app_state (id, data) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data
  `).run(json);
}

function getState() {
  const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get();
  if (!row) {
    const initial = { projects: seedData, currentProjectId: seedData[0]?.id || null };
    saveStateToDb(initial);
    return initial;
  }
  return JSON.parse(row.data);
}

function addPdfRecord(id, name, size) {
  db.prepare('INSERT INTO pdf_files (id, name, size, added_at) VALUES (?, ?, ?, ?)').run(id, name, size, Date.now());
}

function getPdfRecord(id) {
  return db.prepare('SELECT * FROM pdf_files WHERE id = ?').get(id);
}

function deletePdfRecord(id) {
  db.prepare('DELETE FROM pdf_files WHERE id = ?').run(id);
}

// ---- Password hashing (scrypt, no external dependency) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// ---- Users ----
function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

function countAdmins() {
  return db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
}

function createUser(username, password, role = 'user') {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, hashPassword(password), role, Date.now());
  return { id, username, role };
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
}

function updateUserPassword(id, password) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
}

function verifyUser(username, password) {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return user;
}

// Seed a default admin account on first run so the app is reachable out of the box.
if (countUsers() === 0) {
  createUser('admin', 'admin123', 'admin');
  console.warn('[QLDA] Đã tạo tài khoản mặc định: admin / admin123 - vui lòng đổi mật khẩu ngay sau khi đăng nhập.');
}

// ---- Sessions ----
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
  return { id, expiresAt };
}

function getSession(id) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  return session;
}

function deleteSession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function listAllPdfs() {
  return db.prepare('SELECT id, name, size, added_at FROM pdf_files').all();
}

// ---- Cấu hình nghiệp vụ (ngưỡng tiền, mẫu biểu, cơ quan phê duyệt, ...) ----
// Lưu dạng JSON trong bảng sys_config. Admin chỉnh qua UI, không cần sửa code.
const DEFAULT_CONFIG = {
  updatedAt: null,
  limits: {
    // Hạn mức chỉ định thầu theo loại gói (khoản 4 Điều 78 NĐ 214/2025/NĐ-CP)
    directAppointment: {
      consulting: 800000000,      // gói tư vấn thuộc dự án
      construction: 2000000000,   // gói xây lắp thuộc dự án
      goods: 2000000000,          // gói hàng hóa thuộc dự án
      mixed: 2000000000,          // gói hỗn hợp thuộc dự án
      nonConsulting: 2000000000,  // gói phi tư vấn thuộc dự án
      nonProject: 500000000       // gói mua sắm không hình thành dự án
    },
    ktkt: 20000000000             // ngưỡng bắt buộc lập BCNCKT (NĐ 193/2026)
  },
  contractDeadlineWarnDays: 30,
  templates: {
    qtnd: ['Mẫu số 01/QTNĐ', 'Mẫu số 02/QTNĐ', 'Mẫu số 03/QTNĐ', 'Mẫu số 04/QTNĐ', 'Mẫu số 05/QTNĐ'],
    qtda: ['Mẫu số 01/QTDA', 'Mẫu số 02/QTDA', 'Mẫu số 03/QTDA', 'Mẫu số 04/QTDA', 'Mẫu số 05/QTDA', 'Mẫu số 06/QTDA', 'Mẫu số 07/QTDA', 'Mẫu số 08/QTDA', 'Mẫu số 09/QTDA', 'Mẫu số 10/QTDA', 'Mẫu số 11/QTDA', 'Mẫu số 12/QTDA'],
    settlement: {
      annual: {
        versions: [
          { effectiveFrom: '2025-09-26', label: 'TT 91/2025/TT-BTC (quyết toán niên độ)', qtnd: ['Mẫu số 01/QTNĐ', 'Mẫu số 02/QTNĐ', 'Mẫu số 03/QTNĐ', 'Mẫu số 04/QTNĐ', 'Mẫu số 05/QTNĐ'], qtda: ['Mẫu số 01/QTDA', 'Mẫu số 02/QTDA', 'Mẫu số 03/QTDA', 'Mẫu số 04/QTDA', 'Mẫu số 05/QTDA', 'Mẫu số 06/QTDA', 'Mẫu số 07/QTDA', 'Mẫu số 08/QTDA', 'Mẫu số 09/QTDA', 'Mẫu số 10/QTDA', 'Mẫu số 11/QTDA', 'Mẫu số 12/QTDA'] }
        ]
      },
      completion: {
        versions: [
          { effectiveFrom: '1970-01-01', label: 'TT 96/2021/TT-BTC (mẫu cũ)', qtnd: ['Mẫu số 01/QTNĐ', 'Mẫu số 02/QTNĐ', 'Mẫu số 03/QTNĐ', 'Mẫu số 04/QTNĐ', 'Mẫu số 05/QTNĐ'], qtda: ['Mẫu số 01/QTDA', 'Mẫu số 02/QTDA', 'Mẫu số 03/QTDA', 'Mẫu số 04/QTDA', 'Mẫu số 05/QTDA', 'Mẫu số 06/QTDA', 'Mẫu số 07/QTDA', 'Mẫu số 08/QTDA', 'Mẫu số 09/QTDA', 'Mẫu số 10/QTDA', 'Mẫu số 11/QTDA', 'Mẫu số 12/QTDA'] },
          { effectiveFrom: '2025-09-26', label: 'TT 91/2025/TT-BTC (chuyển tiếp)', qtnd: ['Mẫu số 01/QTNĐ', 'Mẫu số 02/QTNĐ', 'Mẫu số 03/QTNĐ', 'Mẫu số 04/QTNĐ', 'Mẫu số 05/QTNĐ'], qtda: ['Mẫu số 01/QTDA', 'Mẫu số 02/QTDA', 'Mẫu số 03/QTDA', 'Mẫu số 04/QTDA', 'Mẫu số 05/QTDA', 'Mẫu số 06/QTDA', 'Mẫu số 07/QTDA', 'Mẫu số 08/QTDA', 'Mẫu số 09/QTDA', 'Mẫu số 10/QTDA', 'Mẫu số 11/QTDA', 'Mẫu số 12/QTDA'] },
          { effectiveFrom: '2026-07-01', label: 'TT 73/2026/TT-BTC (dự án hoàn thành)', qtnd: ['Mẫu số 01/QTNĐ', 'Mẫu số 02/QTNĐ', 'Mẫu số 03/QTNĐ', 'Mẫu số 04/QTNĐ', 'Mẫu số 05/QTNĐ'], qtda: ['Mẫu số 01/QTDA', 'Mẫu số 02/QTDA', 'Mẫu số 03/QTDA', 'Mẫu số 04/QTDA', 'Mẫu số 05/QTDA', 'Mẫu số 06/QTDA', 'Mẫu số 07/QTDA', 'Mẫu số 08/QTDA', 'Mẫu số 09/QTDA', 'Mẫu số 10/QTDA', 'Mẫu số 11/QTDA', 'Mẫu số 12/QTDA'] }
        ]
      }
    }
  },
  agencies: ['Ủy ban nhân dân thành phố', 'Sở Tài chính', 'Sở Xây dựng', 'Cơ quan khác'],
  lists: {
    projectTypes: ['Đầu tư công', 'PPP', 'Vốn đầu tư chi thường xuyên', 'Đầu tư kinh doanh'],
    buildingGrades: ['Đặc biệt', 'I', 'II', 'III', 'IV'],
    contractTypes: ['Tư vấn (khảo sát, thiết kế, giám sát)', 'Thi công xây dựng', 'Hỗn hợp EPC', 'Hỗn hợp EC', 'Hỗn hợp PC', 'Hợp đồng trọn gói'],
    feasibilityStatuses: ['Chưa lập', 'Đã lập, chờ thẩm định', 'Đã thẩm định'],
    acceptanceStatuses: ['Chưa nghiệm thu', 'Đã nghiệm thu', 'Đang kiểm tra CQCM'],
    settlementStatuses: ['Chưa quyết toán', 'Đang thẩm tra', 'Đã quyết toán']
  },
  // Danh mục văn bản pháp lý (để tra cứu + giải thích mốc thời gian hiệu lực)
  legalDocuments: [
    { id: 'L135-2025', type: 'Luật', number: '135/2025/QH15', title: 'Luật Xây dựng', date: '2025-12-10', effectiveDate: '2026-07-01', provisions: [{ provision: 'Khoản 2,3 Điều 43', effectiveDate: '2026-01-01' }, { provision: 'Điều 71', effectiveDate: '2026-01-01' }, { provision: 'Khoản 3,4,5 Điều 95', effectiveDate: '2026-01-01' }], replaces: ['Luật Xây dựng 50/2014/QH13'] },
    { id: 'ND206-2026', type: 'Nghị định', number: '206/2026/NĐ-CP', title: 'Quy định chi tiết Luật Xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 10/2021/NĐ-CP'] },
    { id: 'ND217-2026', type: 'Nghị định', number: '217/2026/NĐ-CP', title: 'Quy định về quản lý dự án đầu tư xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 15/2021/NĐ-CP'] },
    { id: 'ND212-2026', type: 'Nghị định', number: '212/2026/NĐ-CP', title: 'Quy định về hợp đồng xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 37/2015/NĐ-CP'] },
    { id: 'ND214-2025', type: 'Nghị định', number: '214/2025/NĐ-CP', title: 'Quy định chi tiết về đấu thầu', date: '2025-11-20', effectiveDate: '2025-11-20', provisions: [{ provision: 'Khoản 4 Điều 78 (hạn mức chỉ định thầu)' }], replaces: ['NĐ 24/2024/NĐ-CP'] },
    { id: 'ND254-2025', type: 'Nghị định', number: '254/2025/NĐ-CP', title: 'Quy định về quản lý, thanh toán, quyết toán vốn đầu tư công', date: '2025-09-26', effectiveDate: '2025-09-26', replaces: ['NĐ 99/2021/NĐ-CP'] },
    { id: 'TT91-2025', type: 'Thông tư', number: '91/2025/TT-BTC', title: 'Hướng dẫn quyết toán vốn đầu tư công', date: '2025-09-26', effectiveDate: '2025-09-26', replaces: ['TT 96/2021/TT-BTC (quyết toán niên độ)'], note: 'Phần mẫu biểu quyết toán dự án hoàn thành bị bãi bỏ bởi TT 73/2026/TT-BTC; mẫu quyết toán niên độ vẫn hiệu lực' },
    { id: 'TT73-2026', type: 'Thông tư', number: '73/2026/TT-BTC', title: 'Hướng dẫn quyết toán dự án hoàn thành', date: '2026-06-25', effectiveDate: '2026-07-01', replaces: ['TT 91/2025/TT-BTC (phần mẫu biểu quyết toán dự án hoàn thành)'], note: 'Bãi bỏ khoản 2 Điều 1, Điều 4, khoản 2 Điều 5 của TT 91/2025/TT-BTC' },
    { id: 'ND193-2026', type: 'Nghị định', number: '193/2026/NĐ-CP', title: 'Quy định về quyết toán vốn đầu tư công', date: '2026-06-25', effectiveDate: '2026-07-01' }
  ]
};

function getConfig() {
  const row = db.prepare('SELECT data FROM sys_config WHERE id = 1').get();
  if (!row) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const parsed = JSON.parse(row.data);
    // Merge default để đảm bảo thiếu key nào cũng có giá trị mặc định
    const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    deepMerge(merged, parsed);
    return merged;
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return;
  Object.keys(override).forEach(k => {
    const v = override[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  });
}

function saveConfig(config) {
  const json = JSON.stringify(config);
  db.prepare(`
    INSERT INTO sys_config (id, data) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data
  `).run(json);
}

module.exports = {
  getState,
  saveStateToDb,
  addPdfRecord,
  getPdfRecord,
  deletePdfRecord,
  listAllPdfs,
  UPLOADS_DIR,
  createUser,
  getUserByUsername,
  getUserById,
  listUsers,
  updateUserPassword,
  deleteUser,
  verifyUser,
  countAdmins,
  createSession,
  getSession,
  deleteSession,
  getConfig,
  saveConfig,
  DEFAULT_CONFIG
};
