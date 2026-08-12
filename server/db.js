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

// Migrations: thêm cột bảo mật cho bảng users (bỏ qua nếu đã tồn tại)
['must_change_password', 'failed_login_attempts', 'locked_until'].forEach(col => {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col} ${col === 'must_change_password' ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0'}`); }
  catch (_) { /* cột đã tồn tại */ }
});

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

function createUser(username, password, role = 'user', mustChange = 0) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, role, created_at, must_change_password) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, hashPassword(password), role, Date.now(), mustChange);
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
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, failed_login_attempts = 0, locked_until = 0 WHERE id = ?').run(hashPassword(password), id);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
}

function verifyUser(username, password) {
  const user = getUserByUsername(username);
  if (!user) {
    // Timing-equalize: chạy hash giả để không lộ user có tồn tại hay không
    const dummy = hashPassword(password);
    verifyPassword(password, dummy);
    return null;
  }
  if (!verifyPassword(password, user.password_hash)) return null;
  return user;
}

// ---- Brute-force protection ----
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // khóa 15 phút

function recordFailedLogin(userId) {
  db.prepare('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(userId);
  const u = getUserById(userId);
  if (u && u.failed_login_attempts >= MAX_LOGIN_ATTEMPTS) {
    db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').run(Date.now() + LOCKOUT_MS, userId);
  }
}

function resetFailedLogin(userId) {
  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = 0 WHERE id = ?').run(userId);
}

function isLocked(user) {
  return user.locked_until > Date.now();
}

function getLockRemainingMs(user) {
  return Math.max(0, user.locked_until - Date.now());
}

// Seed admin mặc định lần đầu với mật khẩu ngẫu nhiên, bắt buộc đổi khi đăng nhập
if (countUsers() === 0) {
  const initialPw = crypto.randomBytes(6).toString('hex');
  createUser('admin', initialPw, 'admin', 1);
  console.warn(`[QLDA] Đã tạo tài khoản admin với mật khẩu tạm: ${initialPw}`);
  console.warn('[QLDA] Mật khẩu này chỉ hiện 1 lần. Đăng nhập và đổi ngay.');
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
    // ---- Luật ----
    { id: 'L135-2025', type: 'Luật', number: '135/2025/QH15', title: 'Luật Xây dựng', date: '2025-12-10', effectiveDate: '2026-07-01', provisions: [{ provision: 'K2,3 Điều 43, Điều 71, K3-5 Điều 95', effectiveDate: '2026-01-01' }], replaces: ['Luật Xây dựng 50/2014/QH13'], note: 'Phân nhóm dự án A/B/C; quy định BCNCKT; cấp công trình' },
    { id: 'L61-2023', type: 'Luật', number: '61/2023/QH15', title: 'Luật Đấu thầu', date: '2023-06-23', effectiveDate: '2024-01-01', replaces: ['Luật Đấu thầu 43/2013/QH14'], note: 'Quy trình lựa chọn nhà thầu; các hình thức đấu thầu' },
    { id: 'VBHN96-2025', type: 'VBHN', number: '96/VBHN-VPQH', title: 'Luật Đầu tư công (hợp nhất)', date: '2025-07-01', effectiveDate: '2025-07-01', replaces: ['Luật Đầu tư công 39/2019/QH14'], note: 'Văn bản hợp nhất do Văn phòng Quốc hội ban hành; phân loại nguồn vốn; kế hoạch đầu tư công trung hạn' },
    { id: 'L69-2020', type: 'Luật', number: '69/2020/QH14', title: 'Luật Đầu tư theo phương thức PPP', date: '2020-06-18', effectiveDate: '2021-01-01', note: 'Đối với dự án PPP' },

    // ---- Nghị định ----
    { id: 'ND217-2026', type: 'Nghị định', number: '217/2026/NĐ-CP', title: 'Quản lý dự án đầu tư xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 15/2021/NĐ-CP'], note: 'Phân nhóm dự án, lập/phê duyệt dự án, BCNCKT, thiết kế' },
    { id: 'ND206-2026', type: 'Nghị định', number: '206/2026/NĐ-CP', title: 'Quy định chi tiết Luật Xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 10/2021/NĐ-CP'], note: 'Điều kiện năng lực tổ chức/cá nhân hoạt động xây dựng' },
    { id: 'ND212-2026', type: 'Nghị định', number: '212/2026/NĐ-CP', title: 'Hợp đồng xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 37/2015/NĐ-CP'], note: 'Loại hợp đồng, tạm ứng, bảo lãnh, điều chỉnh giá, thanh lý HĐ' },
    { id: 'ND207-2026', type: 'Nghị định', number: '207/2026/NĐ-CP', title: 'Phân loại công trình xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', note: 'Phân cấp công trình: Đặc biệt, I, II, III, IV' },
    { id: 'ND209-2026', type: 'Nghị định', number: '209/2026/NĐ-CP', title: 'Quy định về quản lý chất lượng công trình xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 06/2021/NĐ-CP'], note: 'Nghiệm thu công việc, giai đoạn, hoàn thành; bảo hành; bảo trì công trình' },
    { id: 'ND210-2026', type: 'Nghị định', number: '210/2026/NĐ-CP', title: 'Quy định về an toàn lao động trong thi công xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', note: 'Kế hoạch an toàn; biện pháp thi công; quản lý rủi ro' },
    { id: 'ND220-2026', type: 'Nghị định', number: '220/2026/NĐ-CP', title: 'Quy định về quản lý chi phí đầu tư xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', note: 'Tổng mức đầu tư, dự toán, định mức, giá xây dựng' },
    { id: 'ND214-2025', type: 'Nghị định', number: '214/2025/NĐ-CP', title: 'Quy định chi tiết về đấu thầu', date: '2025-11-20', effectiveDate: '2025-11-20', provisions: [{ provision: 'K4 Điều 78: hạn mức chỉ định thầu 500tr/800tr/2tỷ' }], replaces: ['NĐ 24/2024/NĐ-CP'] },
    { id: 'ND254-2025', type: 'Nghị định', number: '254/2025/NĐ-CP', title: 'Quản lý, thanh toán, quyết toán vốn đầu tư công và chi thường xuyên', date: '2025-09-26', effectiveDate: '2025-09-26', replaces: ['NĐ 99/2021/NĐ-CP'], note: 'Hồ sơ tạm ứng, thanh toán; mẫu 02a-05a/TT; giao dịch Kho bạc; áp dụng cho cả chi thường xuyên NSNN' },
    { id: 'ND193-2026', type: 'Nghị định', number: '193/2026/NĐ-CP', title: 'Quyết toán vốn đầu tư công dự án hoàn thành', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Hồ sơ trình thẩm tra, phê duyệt quyết toán; thời hạn 4 tháng từ bàn giao' },
    { id: 'ND347-2025', type: 'Nghị định', number: '347/2025/NĐ-CP', title: 'Kiểm soát chi NSNN qua Kho bạc Nhà nước', date: '2025-09-26', effectiveDate: '2025-09-26', note: 'Giấy rút vốn, rút dự toán; kiểm soát cam kết chi' },
    { id: 'ND104-2026', type: 'Nghị định', number: '104/2026/NĐ-CP', title: 'Quy định về hạn mức chỉ định thầu và mua sắm', date: '2026-06-15', effectiveDate: '2026-07-01', note: 'Hạn mức chỉ định thầu; thủ tục mua sắm đơn giản cho dưới 500 triệu đồng' },
    { id: 'ND123-2020', type: 'Nghị định', number: '123/2020/NĐ-CP', title: 'Quy định về hóa đơn, chứng từ', date: '2020-10-19', effectiveDate: '2022-07-01', note: 'Hóa đơn điện tử; thời điểm xuất HĐ khi nghiệm thu; HĐ GTGT' },
    { id: 'ND70-2025', type: 'Nghị định', number: '70/2025/NĐ-CP', title: 'Sửa đổi, bổ sung NĐ 123/2020/NĐ-CP về hóa đơn', date: '2025-06-15', effectiveDate: '2025-06-15', replaces: ['Sửa đổi NĐ 123/2020/NĐ-CP'], note: 'Cập nhật quy định về hóa đơn điện tử; thời điểm lập HĐ; đồng bộ dữ liệu HĐ với cơ quan thuế' },
    { id: 'ND11-2021', type: 'Nghị định', number: '11/2021/NĐ-CP', title: 'Giao đất, cho thuê đất để thực hiện dự án', date: '2021-01-07', effectiveDate: '2021-03-01', note: 'Liên quan đến địa điểm xây dựng, giải phóng mặt bằng' },

    // ---- Thông tư ----
    { id: 'TT73-2026', type: 'Thông tư', number: '73/2026/TT-BTC', title: 'Hướng dẫn quyết toán dự án hoàn thành', date: '2026-06-25', effectiveDate: '2026-07-01', replaces: ['TT 91/2025/TT-BTC (phần mẫu biểu QTDA hoàn thành)'], note: 'Mẫu 01-12/QTDA; hồ sơ trình thẩm tra; bãi bỏ K2 Điều 1, Điều 4, K2 Điều 5 TT91' },
    { id: 'TT91-2025', type: 'Thông tư', number: '91/2025/TT-BTC', title: 'Hướng dẫn quyết toán vốn đầu tư công', date: '2025-09-26', effectiveDate: '2025-09-26', replaces: ['TT 96/2021/TT-BTC'], note: 'Mẫu QTNĐ 01-05; quyết toán niên độ ngân sách hàng năm — vẫn hiệu lực' },
    { id: 'TT39-2026', type: 'Thông tư', number: '39/2026/TT-BXD', title: 'Hướng dẫn đồng bộ dữ liệu hoạt động xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Mã định danh; đồng bộ lên Hệ thống thông tin quốc gia về hoạt động xây dựng' },
    { id: 'TT79-2025', type: 'Thông tư', number: '79/2025/TT-BTC', title: 'Hướng dẫn thi hành quy trình quản lý, thanh toán vốn đầu tư công', date: '2025-09-26', effectiveDate: '2025-09-26', note: 'Quy trình giao dịch với Kho bạc; hướng dẫn lập hồ sơ thanh toán; thủ tục rút vốn; kiểm soát chi NSNN' },
    { id: 'TT32-2026', type: 'Thông tư', number: '32/2026/TT-BXD', title: 'Quy định về định mức xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Định mức dự toán xây dựng công trình; hao phí vật liệu, nhân công, máy thi công' },
    { id: 'TT33-2026', type: 'Thông tư', number: '33/2026/TT-BXD', title: 'Quy định về giá xây dựng và chỉ số giá xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Phương pháp xác định giá xây dựng; công bố chỉ số giá; điều chỉnh giá HĐ' },
    { id: 'TT34-2026', type: 'Thông tư', number: '34/2026/TT-BXD', title: 'Phân cấp công trình xây dựng và hướng dẫn áp dụng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Xác định cấp công trình dựa trên quy mô, loại kết cấu, tầm quan trọng' },
    { id: 'TT36-2026', type: 'Thông tư', number: '36/2026/TT-BXD', title: 'Quy định về quản lý chi phí đầu tư xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Tổng mức đầu tư; dự toán xây dựng; định mức chi phí chung; chi phí tư vấn' },
    { id: 'TT37-2026', type: 'Thông tư', number: '37/2026/TT-BXD', title: 'Quy định về đo bóc khối lượng xây dựng công trình', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Phương pháp đo bóc khối lượng; bảng tính toán khối lượng; đơn vị tính' },
    { id: 'TT38-2026', type: 'Thông tư', number: '38/2026/TT-BXD', title: 'Quy định về thẩm tra, phê duyệt thiết kế và dự toán', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Quy trình thẩm định thiết kế; phê duyệt dự toán; phân cấp thẩm quyền' },
    { id: 'TT40-2026', type: 'Thông tư', number: '40/2026/TT-BXD', title: 'Quy định về quản lý chi phí tư vấn đầu tư xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Định mức chi phí quản lý dự án, tư vấn giám sát, thiết kế, thẩm tra' },
    { id: 'TT41-2026', type: 'Thông tư', number: '41/2026/TT-BXD', title: 'Quy định về thanh toán, quyết toán vốn đầu tư xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Hồ sơ thanh toán; nghiệm thu khối lượng; quyết toán hợp đồng; thanh lý HĐ' },
    { id: 'TT26-2016', type: 'Thông tư', number: '26/2016/TT-BXD', title: 'Quy định chi tiết về bảo hành công trình xây dựng', date: '2016-10-26', effectiveDate: '2016-12-15', note: 'Thời hạn bảo hành: 24 tháng (cấp ĐB-I), 12 tháng (còn lại); mức tiền bảo hành; quy trình xử lý' }
  ]
};

function getConfig() {
  const row = db.prepare('SELECT data FROM sys_config WHERE id = 1').get();
  if (!row) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const parsed = JSON.parse(row.data);
    const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    deepMerge(merged, parsed);
    // Merge legalDocuments by id: giữ bản đã lưu + thêm mới từ default
    if (parsed.legalDocuments && Array.isArray(parsed.legalDocuments)) {
      const storedIds = new Set(parsed.legalDocuments.map(d => d.id));
      merged.legalDocuments = [
        ...parsed.legalDocuments,
        ...DEFAULT_CONFIG.legalDocuments.filter(d => !storedIds.has(d.id))
      ];
    }
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
  recordFailedLogin,
  resetFailedLogin,
  isLocked,
  getLockRemainingMs,
  createSession,
  getSession,
  deleteSession,
  getConfig,
  saveConfig,
  DEFAULT_CONFIG
};
