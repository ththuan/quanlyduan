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

// Migrations cho phiên access token / refresh token theo từng thiết bị.
[
  ['access_token_hash', 'TEXT'],
  ['refresh_token_hash', 'TEXT'],
  ['access_expires_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_used_at', 'INTEGER NOT NULL DEFAULT 0']
].forEach(([col, type]) => {
  try { db.exec(`ALTER TABLE sessions ADD COLUMN ${col} ${type}`); }
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
const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 phút
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // tối đa 7 ngày, gia hạn khi dùng

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const accessToken = newToken();
  const refreshToken = newToken();
  const now = Date.now();
  const accessExpiresAt = now + ACCESS_TOKEN_TTL_MS;
  const expiresAt = now + REFRESH_TOKEN_TTL_MS;
  db.prepare(`INSERT INTO sessions
    (id, user_id, expires_at, access_token_hash, refresh_token_hash, access_expires_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, expiresAt, hashToken(accessToken), hashToken(refreshToken), accessExpiresAt, now);
  return { id, accessToken, refreshToken, accessExpiresAt, expiresAt };
}

function getSessionByAccessToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE access_token_hash = ?').get(hashToken(token));
  const now = Date.now();
  if (!session || session.access_expires_at < now || session.expires_at < now) return null;
  // Sliding session: mỗi lần sử dụng hợp lệ sẽ gia hạn phiên thêm 7 ngày.
  db.prepare('UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE id = ?')
    .run(now + REFRESH_TOKEN_TTL_MS, now, session.id);
  return session;
}

// Dùng cho xác thực qua cookie (iframe / proxy) — session id ổn định, không xoay vòng.
function getSessionById(id) {
  if (!id) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  const now = Date.now();
  if (!session || session.expires_at < now) return null;
  db.prepare('UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE id = ?')
    .run(now + REFRESH_TOKEN_TTL_MS, now, session.id);
  return session;
}

function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE refresh_token_hash = ?').get(hashToken(refreshToken));
  const now = Date.now();
  if (!session || session.expires_at < now) {
    if (session) db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return null;
  }
  const accessToken = newToken();
  const newRefreshToken = newToken();
  const accessExpiresAt = now + ACCESS_TOKEN_TTL_MS;
  const expiresAt = now + REFRESH_TOKEN_TTL_MS;
  db.prepare(`UPDATE sessions SET access_token_hash = ?, refresh_token_hash = ?,
    access_expires_at = ?, expires_at = ?, last_used_at = ? WHERE id = ?`)
    .run(hashToken(accessToken), hashToken(newRefreshToken), accessExpiresAt, expiresAt, now, session.id);
  return { sessionId: session.id, userId: session.user_id, accessToken, refreshToken: newRefreshToken, accessExpiresAt, expiresAt };
}

function deleteSession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function deleteSessionByRefreshToken(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE refresh_token_hash = ?').run(hashToken(token));
}

function listAllPdfs() {
  return db.prepare('SELECT id, name, size, added_at FROM pdf_files').all();
}

// ---- Cấu hình nghiệp vụ (ngưỡng tiền, mẫu biểu, cơ quan phê duyệt, ...) ----
// Lưu dạng JSON trong bảng sys_config. Admin chỉnh qua UI, không cần sửa code.
const DEFAULT_CONFIG = {
  updatedAt: null,
  limits: {
    // Hạn mức chỉ định thầu theo loại gói (khoản 4 Điều 78 NĐ 214/2025/NĐ-CP, sửa đổi bởi NĐ 349/2026/NĐ-CP)
    directAppointment: {
      consulting: 3000000000,      // gói dịch vụ tư vấn thuộc dự án
      construction: 5000000000,    // gói xây lắp thuộc dự án
      goods: 5000000000,           // gói hàng hóa thuộc dự án
      mixed: 5000000000,           // gói hỗn hợp thuộc dự án
      nonConsulting: 5000000000,   // gói dịch vụ phi tư vấn thuộc dự án
      nonProject: 1000000000       // gói thuộc dự toán mua sắm không hình thành dự án
    },
    directPurchase: 100000000,     // gói/nội dung mua sắm không quá 100 triệu do Thủ trưởng quyết định (khoản 4 Điều 80 NĐ 214/2025/NĐ-CP, sửa đổi bởi NĐ 349/2026/NĐ-CP)
    ktkt: 20000000000             // ngưỡng nghiệp vụ lập BCNCKT; quy trình quản lý dự án theo NĐ 217/2026
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
    fundSources: ['Kinh phí quỹ phát triển sự nghiệp', 'Ngân sách thành phố', 'Đầu tư công'],
    purchaseTypes: ['Mua sắm tài sản', 'Sửa chữa, bảo trì thường xuyên', 'Mua sắm vật tư, hàng hóa tiêu hao', 'Dịch vụ khác'],
    buildingGrades: ['Đặc biệt', 'I', 'II', 'III', 'IV'],
    contractTypes: ['Tư vấn (khảo sát, thiết kế, giám sát)', 'Thi công xây dựng', 'Hỗn hợp EPC', 'Hỗn hợp EC', 'Hỗn hợp PC', 'Hợp đồng trọn gói'],
    feasibilityStatuses: ['Chưa lập', 'Đã lập, chờ thẩm định', 'Đã thẩm định'],
    acceptanceStatuses: ['Chưa nghiệm thu', 'Đã nghiệm thu', 'Đang kiểm tra CQCM'],
    settlementStatuses: ['Chưa quyết toán', 'Đang thẩm tra', 'Đã quyết toán'],
    selectionMethods: [
      'Đấu thầu rộng rãi qua mạng',
      'Đấu thầu rộng rãi trong nước',
      'Đấu thầu rộng rãi quốc tế',
      'Đấu thầu hạn chế',
      'Chào hàng cạnh tranh qua mạng',
      'Chào hàng cạnh tranh trong nước',
      'Chào hàng cạnh tranh quốc tế',
      'Chỉ định thầu thông thường',
      'Chỉ định thầu rút gọn',
      'Mua sắm trực tiếp',
      'Đặt hàng (NĐ 32/2019)',
      'Tự thực hiện',
      'Không áp dụng',
      'Khác'
    ],
    legalDocTypes: [
      'Quyết định chủ trương đầu tư',
      'Phê duyệt dự án',
      'Quyết định phê duyệt BCKTKT',
      'Quyết định phê duyệt BCNCKT',
      'Quyết định phê duyệt tổng mức đầu tư',
      'Quyết định phê duyệt thiết kế - dự toán',
      'Phê duyệt dự toán',
      'Quyết định điều chỉnh dự án / dự toán',
      'Kế hoạch vốn / Quyết định giao vốn',
      'Phê duyệt KHLCNT',
      'Quyết định phê duyệt kết quả',
      'Quyết định thành lập BQLDA / tổ công tác',
      'Văn bản thẩm định / thẩm tra',
      'Quyết định phê duyệt quyết toán',
      'Báo cáo kiểm toán / kết luận thanh tra',
      'Công văn / Tờ trình',
      'Giấy phép / Chứng nhận',
      'Văn bản khác'
    ]
  },
  // Danh mục văn bản pháp lý (để tra cứu + giải thích mốc thời gian hiệu lực)
  legalDocuments: [
    // ---- Luật ----
    { id: 'L135-2025', type: 'Luật', number: '135/2025/QH15', title: 'Luật Xây dựng', date: '2025-12-10', effectiveDate: '2026-07-01', kbId: 'LXD', note: 'Trình tự đầu tư (Điều 16), phân loại dự án (Điều 17), lập, thẩm định, phê duyệt dự án và thiết kế (Điều 23-31), thi công, nghiệm thu, bàn giao, bảo hành (Điều 48-65), chi phí (Điều 73-79), hợp đồng xây dựng (Điều 80-87). Bản hợp nhất 146/2026/VBHN-LQ-VPQH.' },
    { id: 'L22-2023', type: 'Luật', number: '22/2023/QH15', title: 'Luật Đấu thầu (đã được sửa đổi, bổ sung)', date: '2023-06-23', effectiveDate: '2024-01-01', kbId: 'LDT', note: 'Hình thức lựa chọn nhà thầu (Điều 20-29b), kế hoạch lựa chọn nhà thầu (Điều 36-41), quy trình, hợp đồng (Điều 64-70). Sửa đổi bởi Luật 57/2024/QH15 (15/01/2025), 90/2025/QH15 (01/7/2025), 116/2025, 133/2025 (01/7/2026), 142/2025 (01/3/2026).' },
    { id: 'VBHN96-2025', type: 'VBHN', number: '96/VBHN-VPQH', title: 'Luật Đầu tư công (hợp nhất)', date: '2025-07-01', effectiveDate: '2025-07-01', replaces: ['Luật Đầu tư công 39/2019/QH14'], note: 'Văn bản hợp nhất do Văn phòng Quốc hội ban hành; phân loại nguồn vốn; kế hoạch đầu tư công trung hạn' },
    { id: 'VBHN97-2025', type: 'VBHN', number: '97/VBHN-VPQH', title: 'Luật Quản lý, sử dụng tài sản công (hợp nhất)', date: '2025-08-22', effectiveDate: '2025-08-22', replaces: ['Hợp nhất Luật 15/2017/QH14 (sửa đổi bởi Luật 90/2025/QH15)'], note: 'Quản lý, sử dụng tài sản công; mua sắm, thuê, sửa chữa, xử lý tài sản công tại đơn vị sự nghiệp công lập' },
    { id: 'L69-2020', type: 'Luật', number: '69/2020/QH14', title: 'Luật Đầu tư theo phương thức PPP', date: '2020-06-18', effectiveDate: '2021-01-01', note: 'Đối với dự án PPP' },

    // ---- Nghị định ----
    { id: 'ND217-2026', type: 'Nghị định', number: '217/2026/NĐ-CP', title: 'Quản lý hoạt động xây dựng', date: '2026-06-19', effectiveDate: '2026-07-01', replaces: ['NĐ 175/2024/NĐ-CP', 'Một phần các nghị định liên quan'], domains: ['chuẩn bị dự án', 'khảo sát', 'thiết kế', 'thẩm định', 'phê duyệt', 'quản lý dự án', 'giấy phép xây dựng', 'trật tự xây dựng', 'BIM'], workflowStages: [1], note: 'Trình tự đầu tư; phân loại dự án; khảo sát, thiết kế, thẩm định, phê duyệt; quản lý dự án; giấy phép, trật tự xây dựng; BIM; công trình đặc thù, khẩn cấp.' },
    { id: 'ND206-2026', type: 'Nghị định', number: '206/2026/NĐ-CP', title: 'Quản lý chi phí đầu tư xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 10/2021/NĐ-CP'], domains: ['tổng mức đầu tư', 'dự toán', 'giá gói thầu', 'định mức', 'giá xây dựng', 'chi phí quản lý dự án', 'chi phí tư vấn'], workflowStages: [1, 2, 3, 4, 6, 7, 8], note: 'Sơ bộ tổng mức đầu tư; tổng mức đầu tư; dự toán; giá gói thầu; định mức; giá và chỉ số giá; chi phí QLDA, tư vấn và chi phí khác.' },
    { id: 'ND207-2026', type: 'Nghị định', number: '207/2026/NĐ-CP', title: 'Chất lượng, thi công và bảo trì công trình', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 06/2021/NĐ-CP', 'Một phần các nghị định liên quan'], domains: ['chất lượng', 'thi công', 'an toàn công trường', 'giám sát', 'nghiệm thu', 'bàn giao', 'bảo hành', 'bảo trì', 'sự cố', 'phá dỡ'], workflowStages: [4, 5, 9], note: 'Phân loại công trình; khởi công; vật liệu, cấu kiện, thiết bị; an toàn; giám sát; nghiệm thu, bàn giao; bảo hành, bảo trì; sự cố và phá dỡ.' },
    { id: 'ND209-2026', type: 'Nghị định', number: '209/2026/NĐ-CP', title: 'Quản lý vật liệu xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 09/2021/NĐ-CP', 'Bãi bỏ Điều 14 NĐ 144/2025/NĐ-CP'], domains: ['vật liệu xây dựng', 'khoáng sản', 'amiăng', 'vật liệu tái chế', 'vật liệu xanh', 'vật liệu không nung', 'chất lượng sản phẩm'], workflowStages: [1, 2, 4, 5], note: 'Chiến lược, quy hoạch phát triển vật liệu; vật liệu mới, tái chế, xanh, nhẹ, thông minh, không nung; quản lý chất lượng sản phẩm, hàng hóa VLXD.' },
    { id: 'ND210-2026', type: 'Nghị định', number: '210/2026/NĐ-CP', title: 'Hợp đồng xây dựng', date: '2026-06-15', effectiveDate: '2026-07-01', replaces: ['NĐ 37/2015/NĐ-CP', 'NĐ 50/2021/NĐ-CP', 'Bãi bỏ Điều 9 NĐ 35/2023/NĐ-CP'], domains: ['hợp đồng', 'hình thức giá', 'tiến độ', 'khối lượng', 'tạm ứng', 'thanh toán', 'điều chỉnh hợp đồng', 'tạm dừng', 'chấm dứt', 'quyết toán A-B', 'thanh lý', 'EPC'], workflowStages: [3, 4, 5, 6, 7], note: 'Phân loại hợp đồng; hồ sơ; hình thức giá; tiến độ, chất lượng, khối lượng; tạm ứng, thanh toán; điều chỉnh, tạm dừng, chấm dứt; quyết toán, thanh lý; EPC và thầu phụ.' },
    { id: 'ND212-2026', type: 'Nghị định', number: '212/2026/NĐ-CP', title: 'Năng lực và cơ sở dữ liệu xây dựng', date: '2026-06-17', effectiveDate: '2026-07-01', replaces: ['NĐ 111/2024/NĐ-CP', 'Một phần các nghị định liên quan'], domains: ['cơ sở dữ liệu xây dựng', 'mã định danh', 'dữ liệu quy hoạch', 'dữ liệu dự án', 'chứng chỉ hành nghề', 'năng lực tổ chức', 'nhà thầu nước ngoài'], workflowStages: [1, 2, 3, 4, 5], note: 'Hệ thống thông tin, CSDL quốc gia, mã định danh; dữ liệu quy hoạch, dự án, công trình; chứng chỉ hành nghề; công khai năng lực; giấy phép nhà thầu nước ngoài.' },
    { id: 'ND214-2025', type: 'Nghị định', number: '214/2025/NĐ-CP', title: 'Quy định chi tiết một số điều và biện pháp thi hành Luật Đấu thầu về lựa chọn nhà thầu', date: '2025-08-04', effectiveDate: '2025-08-04', replaces: ['NĐ 24/2024/NĐ-CP'], kbId: 'ND214', note: 'Sửa đổi bởi NĐ 165/2026, 170/2026 (01/7/2026) và NĐ 349/2026 (09/9/2026); bản hợp nhất 36/2026/VBHN-NĐ-BTC. Giá gói thầu (Điều 18), chỉ định thầu (Điều 78-80), chào hàng cạnh tranh (Điều 81), mua sắm trực tiếp (Điều 82), hợp đồng, tạm ứng, thanh toán, thanh lý (Điều 113-121).' },
    { id: 'ND349-2026', type: 'Nghị định', number: '349/2026/NĐ-CP', title: 'Sửa đổi, bổ sung một số điều của các nghị định quy định chi tiết và biện pháp thi hành Luật Đấu thầu về lựa chọn nhà thầu', date: '2026-09-09', effectiveDate: '2026-09-09', kbId: 'ND214', note: 'Đã hợp nhất vào NĐ 214/2025 (36/2026/VBHN-NĐ-BTC). Khoản 4 Điều 78: chỉ định thầu gói thuộc dự toán mua sắm không hình thành dự án không quá 1 tỷ; gói tư vấn thuộc dự án không quá 3 tỷ; gói phi tư vấn, hàng hóa, xây lắp, hỗn hợp thuộc dự án không quá 5 tỷ.' },
    { id: 'ND254-2025', type: 'Nghị định', number: '254/2025/NĐ-CP', title: 'Quản lý, thanh toán, quyết toán dự án sử dụng vốn đầu tư công', date: '2025-09-26', effectiveDate: '2025-09-26', replaces: ['NĐ 99/2021/NĐ-CP'], kbId: 'ND254', note: 'Hồ sơ pháp lý, tạm ứng, thanh toán (Điều 8-10, 18-20); quyết toán niên độ (Điều 25-29). Điều 30-47 (quyết toán dự án) đã bị bãi bỏ từ 01/7/2026 bởi NĐ 193/2026.' },
    { id: 'ND193-2026', type: 'Nghị định', number: '193/2026/NĐ-CP', title: 'Quy định về quyết toán vốn đầu tư dự án', date: '2026-06-01', effectiveDate: '2026-07-01', replaces: ['Bãi bỏ Điều 30-47 NĐ 254/2025/NĐ-CP','Bãi bỏ Điều 58 NĐ 358/2025/NĐ-CP'], kbId: 'ND193', domains: ['quyết toán vốn','hồ sơ quyết toán','báo cáo quyết toán','kiểm toán độc lập','thẩm tra','phê duyệt quyết toán'], workflowStages: [7,8], note: 'Vốn được quyết toán (Điều 4), hồ sơ trình thẩm tra, phê duyệt (Điều 7), thẩm tra hồ sơ pháp lý (Điều 12), thời gian lập, thẩm tra, phê duyệt theo nhóm dự án (Điều 21), trách nhiệm chủ đầu tư (Điều 28).' },
    { id: 'ND347-2025', type: 'Nghị định', number: '347/2025/NĐ-CP', title: 'Kiểm soát chi NSNN qua Kho bạc Nhà nước', date: '2025-09-26', effectiveDate: '2025-09-26', note: 'Giấy rút vốn, rút dự toán; kiểm soát cam kết chi' },
    { id: 'ND104-2026', type: 'Nghị định', number: '104/2026/NĐ-CP', title: 'Quy định việc lập dự toán, quản lý, sử dụng và quyết toán chi thường xuyên để thực hiện các nhiệm vụ quy định tại Điều 40 Luật Ngân sách nhà nước', date: '2026-03-31', effectiveDate: '2026-03-31', kbId: 'ND104', replaces: ['NĐ 98/2025/NĐ-CP'], note: 'Lập dự toán, phân bổ, giao dự toán, quản lý, sử dụng và quyết toán chi thường xuyên để mua sắm, sửa chữa, cải tạo, nâng cấp tài sản, trang thiết bị (Điều 7-9, 17-19)' },
    { id: 'ND123-2020', type: 'Nghị định', number: '123/2020/NĐ-CP', title: 'Quy định về hóa đơn, chứng từ', date: '2020-10-19', effectiveDate: '2022-07-01', note: 'Hóa đơn điện tử; thời điểm xuất HĐ khi nghiệm thu; HĐ GTGT' },
    { id: 'ND70-2025', type: 'Nghị định', number: '70/2025/NĐ-CP', title: 'Sửa đổi, bổ sung NĐ 123/2020/NĐ-CP về hóa đơn', date: '2025-06-15', effectiveDate: '2025-06-15', replaces: ['Sửa đổi NĐ 123/2020/NĐ-CP'], note: 'Cập nhật quy định về hóa đơn điện tử; thời điểm lập HĐ; đồng bộ dữ liệu HĐ với cơ quan thuế' },
    { id: 'ND11-2021', type: 'Nghị định', number: '11/2021/NĐ-CP', title: 'Giao đất, cho thuê đất để thực hiện dự án', date: '2021-01-07', effectiveDate: '2021-03-01', note: 'Liên quan đến địa điểm xây dựng, giải phóng mặt bằng' },
    { id: 'ND186-2025', type: 'Nghị định', number: '186/2025/NĐ-CP', title: 'Quy định chi tiết một số điều của Luật Quản lý, sử dụng tài sản công', date: '2025-07-01', effectiveDate: '2025-07-01', replaces: ['NĐ 151/2017/NĐ-CP'], note: 'Mua sắm, thuê, khai thác, quản lý vận hành, xử lý tài sản công tại cơ quan, tổ chức, đơn vị; sử dụng tài sản công vào mục đích kinh doanh, cho thuê, liên doanh, liên kết' },

    // ---- Quyết định ----
    { id: 'QD10-2026', type: 'Quyết định', number: '10/2026/QĐ-TTg', title: 'Sửa đổi, bổ sung Quyết định 15/2025/QĐ-TTg quy định tiêu chuẩn, định mức sử dụng máy móc, thiết bị', date: '2026-03-09', effectiveDate: '2026-03-09', replaces: ['Sửa đổi QĐ 15/2025/QĐ-TTg'], note: 'Tiêu chuẩn, định mức máy móc thiết bị; số lượng và mức giá tối đa do Thủ trưởng đơn vị quyết định theo chức năng, nhiệm vụ và nguồn kinh phí' },

    // ---- Thông tư ----
    { id: 'TT73-2026', type: 'Thông tư', number: '73/2026/TT-BTC', title: 'Quy định về hệ thống mẫu biểu sử dụng trong công tác quyết toán vốn đầu tư dự án', date: '2026-06-25', effectiveDate: '2026-07-01', replaces: ['TT 27/2025/TT-BTC','K2 Điều 1, Điều 4, K2 Điều 5 TT 91/2025/TT-BTC'], kbId: 'TT73-2026', note: 'Mẫu 01-12/QTDA; dự án hoàn thành dùng Mẫu 01-07/QTDA (Điều 4). Mẫu 02: danh mục văn bản; Mẫu 04: chi tiết chi phí đầu tư đề nghị quyết toán.' },
    { id: 'TT134-2026', type: 'Thông tư', number: '134/2026/TT-BTC', title: 'Quy định chi tiết mẫu hồ sơ yêu cầu áp dụng hình thức chỉ định thầu, báo cáo đánh giá, báo cáo thẩm định, kiểm tra, giám sát, báo cáo tình hình thực hiện hoạt động đấu thầu', date: '2026-09-09', effectiveDate: '2026-09-09', replaces: ['TT 80/2025/TT-BTC'], kbId: 'TT134-2026', note: 'Kèm Phụ lục 1-8 (biên bản đóng thầu, mở thầu, quyết định và thông báo kiểm tra, bản cam kết, hướng dẫn mẫu hồ sơ yêu cầu).' },
    { id: 'TT91-2025', type: 'Thông tư', number: '91/2025/TT-BTC', title: 'Hướng dẫn quyết toán vốn đầu tư công', date: '2025-09-26', effectiveDate: '2025-09-26', replaces: ['TT 96/2021/TT-BTC'], note: 'Mẫu QTNĐ 01-05; quyết toán niên độ ngân sách hàng năm — vẫn hiệu lực' },
    { id: 'TT39-2026', type: 'Thông tư', number: '39/2026/TT-BXD', title: 'Hướng dẫn đồng bộ dữ liệu hoạt động xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Mã định danh; đồng bộ lên Hệ thống thông tin quốc gia về hoạt động xây dựng' },
    { id: 'TT79-2025', type: 'Thông tư', number: '79/2025/TT-BTC', title: 'Hướng dẫn việc cung cấp, đăng tải thông tin về đấu thầu và mẫu hồ sơ đấu thầu trên Hệ thống mạng đấu thầu quốc gia', date: '2025-08-04', effectiveDate: '2025-08-04', replaces: ['TT 22/2024/TT-BKHĐT'], kbId: 'TT79-2025', note: 'Thông tin dự án, KHLCNT (Điều 13), thông báo mời thầu (Điều 17), kết quả lựa chọn nhà thầu (Điều 20), hợp đồng điện tử (Điều 32).' },
    { id: 'TT32-2026', type: 'Thông tư', number: '32/2026/TT-BXD', title: 'Quy định về định mức xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Định mức dự toán xây dựng công trình; hao phí vật liệu, nhân công, máy thi công' },
    { id: 'TT33-2026', type: 'Thông tư', number: '33/2026/TT-BXD', title: 'Quy định về giá xây dựng và chỉ số giá xây dựng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Phương pháp xác định giá xây dựng; công bố chỉ số giá; điều chỉnh giá HĐ' },
    { id: 'TT34-2026', type: 'Thông tư', number: '34/2026/TT-BXD', title: 'Phân cấp công trình xây dựng và hướng dẫn áp dụng', date: '2026-06-25', effectiveDate: '2026-07-01', note: 'Xác định cấp công trình dựa trên quy mô, loại kết cấu, tầm quan trọng' },
    { id: 'TT36-2026', type: 'Thông tư', number: '36/2026/TT-BXD', title: 'Hướng dẫn một số nội dung, phương pháp xác định và quản lý chi phí đầu tư xây dựng', date: '2026-06-26', effectiveDate: '2026-07-01', kbId: 'TT36-BXD', note: 'Bản hợp nhất 89/2026/VBHN-TT-BXD (đính chính bởi QĐ 1538/QĐ-BXD, hiệu lực 28/8/2026). Sơ bộ tổng mức đầu tư, tổng mức đầu tư (Điều 3-5), dự toán xây dựng công trình, gói thầu, công việc (Điều 6-8), định mức, giá xây dựng, chi phí tư vấn.' },
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
    // Văn bản mặc định là nguồn chuẩn nghiệp vụ; vẫn giữ các văn bản tùy chỉnh không trùng id.
    if (parsed.legalDocuments && Array.isArray(parsed.legalDocuments)) {
      const defaultIds = new Set(DEFAULT_CONFIG.legalDocuments.map(d => d.id));
      merged.legalDocuments = [
        ...DEFAULT_CONFIG.legalDocuments,
        ...parsed.legalDocuments.filter(d => !defaultIds.has(d.id) && d.id !== 'L61-2023')
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
  getSessionByAccessToken,
  getSessionById,
  refreshSession,
  deleteSession,
  deleteSessionByRefreshToken,
  getConfig,
  saveConfig,
  DEFAULT_CONFIG
};
