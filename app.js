/* ============================================================
   QLDA - Quản lý Dự án Đầu tư Xây dựng
   Application Logic: Data, CRUD, Charts, PDF, Rendering
   Default seed data now lives on the backend (server/seed-data.js)
   and is loaded into the database on first run.
   ============================================================ */

// ============================================================
// SECTION 2: Backend API (Express + SQLite) for state & PDF storage
// ============================================================
const API_BASE = '/api';
const AUTH_STORAGE_KEY = 'qlda_auth_session';
const nativeFetch = window.fetch.bind(window);
let refreshPromise = null;

function getStoredAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); }
  catch (_) { return null; }
}

function storeAuth(data) {
  const auth = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessExpiresAt: data.accessExpiresAt,
    expiresAt: data.expiresAt,
    user: data.user
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  return auth;
}

function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem('qlda_force_pw');
}

async function renewAccessToken() {
  if (refreshPromise) return refreshPromise;
  const auth = getStoredAuth();
  if (!auth?.refreshToken) return null;
  refreshPromise = nativeFetch(`${API_BASE}/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken })
  }).then(async res => {
    if (!res.ok) { clearStoredAuth(); return null; }
    return storeAuth(await res.json());
  }).catch(() => null).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function authFetch(input, init = {}, allowRetry = true) {
  const auth = getStoredAuth();
  const headers = new Headers(init.headers || {});
  if (auth?.accessToken) headers.set('Authorization', `Bearer ${auth.accessToken}`);
  let res = await nativeFetch(input, { ...init, headers });
  if (res.status === 401 && allowRetry && auth?.refreshToken) {
    const renewed = await renewAccessToken();
    if (renewed?.accessToken) {
      headers.set('Authorization', `Bearer ${renewed.accessToken}`);
      res = await nativeFetch(input, { ...init, headers });
    }
  }
  return res;
}

// Toàn bộ API nghiệp vụ tự mang access token và tự làm mới phiên khi cần.
window.fetch = function(input, init) {
  const url = typeof input === 'string' ? input : input.url;
  return url.startsWith('/api/') ? authFetch(input, init) : nativeFetch(input, init);
};

function handleAuthResponse(res) {
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Phiên đăng nhập không còn hợp lệ');
  }
  return res;
}

async function apiGetMe() {
  const res = await fetch(`${API_BASE}/me`);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Không thể kiểm tra phiên đăng nhập');
  return res.json();
}

async function apiLogout() {
  const auth = getStoredAuth();
  try {
    await nativeFetch(`${API_BASE}/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth?.refreshToken || '' })
    });
  } finally {
    clearStoredAuth();
  }
}

async function apiListUsers() {
  const res = handleAuthResponse(await fetch(`${API_BASE}/users`));
  if (!res.ok) throw new Error('Không thể tải danh sách người dùng');
  return res.json();
}

async function apiCreateUser(username, password, role) {
  const res = handleAuthResponse(await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role })
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể tạo người dùng');
  return data;
}

async function apiChangePassword(id, password) {
  const res = handleAuthResponse(await fetch(`${API_BASE}/users/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể đổi mật khẩu');
  return data;
}

async function apiDeleteUser(id) {
  const res = handleAuthResponse(await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể xóa người dùng');
  return data;
}

async function apiGetState() {
  const res = handleAuthResponse(await fetch(`${API_BASE}/state`));
  if (!res.ok) throw new Error('Không thể tải dữ liệu từ máy chủ (HTTP ' + res.status + ')');
  return res.json();
}

async function apiSaveState(payload) {
  const res = handleAuthResponse(await fetch(`${API_BASE}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }));
  if (!res.ok) throw new Error('Không thể lưu dữ liệu (HTTP ' + res.status + ')');
  return res.json();
}

async function apiUploadPDF(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = handleAuthResponse(await fetch(`${API_BASE}/pdfs`, { method: 'POST', body: formData }));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Tải file thất bại (HTTP ' + res.status + ')');
  }
  return res.json();
}

async function apiDeletePDF(id) {
  await fetch(`${API_BASE}/pdfs/${id}`, { method: 'DELETE' });
}

async function apiGetConfig() {
  const res = handleAuthResponse(await fetch(`${API_BASE}/config`));
  if (!res.ok) throw new Error('Không thể tải cấu hình (HTTP ' + res.status + ')');
  return res.json();
}

async function apiSaveConfig(cfg) {
  const res = handleAuthResponse(await fetch(`${API_BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: cfg })
  }));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Không thể lưu cấu hình');
  }
  return res.json();
}

// ---- Định dạng file được phép đính kèm ----
const ALLOWED_UPLOAD_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'txt'];
const ALLOWED_UPLOAD_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt';
function isAllowedUpload(file) {
  const name = (file?.name || '');
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = name.slice(dot + 1).toLowerCase();
  return ALLOWED_UPLOAD_EXTS.includes(ext);
}

// ============================================================
// SECTION 3: STATE MANAGEMENT
// ============================================================
let state = {
  projects: [],
  currentProjectId: null,
  currentView: 'dashboard',
  config: null
};
let currentUser = null;
let isReadOnly = false;

// ---- Form validation ----
function validateRequired(id, label) {
  const el = document.getElementById(id);
  if (!el) return true;
  const val = el.value?.trim?.() ?? el.value ?? '';
  if (!val) { showToast(`Vui lòng nhập "${label}"`, 'error'); el.focus(); return false; }
  return true;
}

function validateNumber(id, label) {
  const el = document.getElementById(id);
  if (!el) return true;
  const n = Number(el.value);
  if (el.value && (isNaN(n) || n < 0)) { showToast(`"${label}" phải là số dương`, 'error'); el.focus(); return false; }
  return true;
}

// ---- Audit trail ----
function addAudit(project, action, target, name, detail = '') {
  if (!project) return;
  project.auditLog = project.auditLog || [];
  project.auditLog.push({
    id: generateId(),
    timestamp: new Date().toISOString(),
    user: currentUser?.username || 'unknown',
    action,   // 'create' | 'update' | 'delete'
    target,   // 'project' | 'category' | 'package' | 'initiation' | 'settlement' | 'annual'
    name,
    detail
  });
  if (project.auditLog.length > 1000) project.auditLog = project.auditLog.slice(-1000);
}

function renderAuditModal() {
  const project = getCurrentProject();
  const logs = (project?.auditLog || []).slice().reverse();
  openModal('Lịch sử chỉnh sửa — ' + esc(project?.name || ''), `
    <div style="max-height:60vh;overflow-y:auto">
      ${logs.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:20px">Chưa có lịch sử chỉnh sửa nào.</p>' : `
      <table style="width:100%;font-size:0.82rem">
        <thead><tr style="color:var(--text-muted);font-size:0.75rem"><th style="width:130px">Thời gian</th><th style="width:80px">Người dùng</th><th style="width:90px">Hành động</th><th style="width:80px">Đối tượng</th><th>Chi tiết</th></tr></thead>
        <tbody>${logs.map(l => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:4px 6px;white-space:nowrap">${formatDateVN(l.timestamp)}<br><small style="color:var(--text-muted)">${new Date(l.timestamp).toLocaleTimeString('vi-VN')}</small></td>
            <td style="padding:4px 6px">${esc(l.user)}</td>
            <td style="padding:4px 6px"><span class="badge ${l.action === 'create' ? 'badge-success' : (l.action === 'delete' ? 'badge-danger' : 'badge-warning')}">${l.action === 'create' ? 'Tạo mới' : (l.action === 'delete' ? 'Xóa' : 'Sửa')}</span></td>
            <td style="padding:4px 6px;font-size:0.75rem;color:var(--text-muted)">${esc(l.target)}</td>
            <td style="padding:4px 6px;font-size:0.8rem">${esc(l.name)}${l.detail ? `<br><small style="color:var(--text-muted)">${esc(l.detail)}</small>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>`}
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>`);
}

function requireEditPermission() {
  if (isReadOnly) { showToast('Bạn không có quyền chỉnh sửa dữ liệu', 'error'); return false; }
  return true;
}

async function loadState() {
  const data = await apiGetState();
  state.projects = data.projects || [];
  state.currentProjectId = data.currentProjectId || (state.projects[0]?.id || null);
  // Migrate old packages: ensure pkgType matches contractType
  (state.projects || []).forEach(proj => {
    (proj.categories || []).forEach(cat => {
      (cat.packages || []).forEach(pkg => {
        const isConsultingLike = (pkg.contractType || '').includes('Tư vấn');
        if (!pkg.pkgType || (isConsultingLike && pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting')) {
          pkg.pkgType = isConsultingLike ? 'consulting' : (pkg.pkgType || 'construction');
        }
        pkg.milestones = pkg.milestones || [];
        pkg.deliverables = pkg.deliverables || [];
        pkg.payments = pkg.payments || [];
        pkg.variations = pkg.variations || [];
        pkg.documentChecklist = pkg.documentChecklist || [];
        pkg.pdfs = pkg.pdfs || [];
      });
    });
  });
}

async function loadConfig() {
  try { state.config = await apiGetConfig(); }
  catch (_) { state.config = null; }
}

function applyConfig() {
  const c = state.config;
  if (!c) return;
  if (c.limits) {
    if (typeof c.limits.ktkt === 'number') CONTRACT_ROUTE_KTKT_LIMIT = c.limits.ktkt;
    if (c.limits.directAppointment && typeof c.limits.directAppointment === 'object') CONTRACT_ROUTE_DIRECT_LIMITS = c.limits.directAppointment;
    // Backward compat: nếu config cũ có limits.direct thì merge vào nonProject
    else if (typeof c.limits.direct === 'number' && !c.limits.directAppointment) {
      CONTRACT_ROUTE_DIRECT_LIMITS.nonProject = c.limits.direct;
      CONTRACT_ROUTE_DIRECT_LIMITS.consulting = c.limits.direct;
      CONTRACT_ROUTE_DIRECT_LIMITS.construction = c.limits.direct;
    }
  }
  if (typeof c.contractDeadlineWarnDays === 'number') CONTRACT_DEADLINE_WARN_DAYS = c.contractDeadlineWarnDays;
  if (Array.isArray(c.lists?.projectTypes)) PROJECT_TYPES = c.lists.projectTypes;
  if (Array.isArray(c.lists?.buildingGrades)) BUILDING_GRADES = c.lists.buildingGrades;
  if (Array.isArray(c.lists?.contractTypes)) CONTRACT_TYPES = c.lists.contractTypes;
  if (Array.isArray(c.lists?.feasibilityStatuses)) FEASIBILITY_STATUSES = c.lists.feasibilityStatuses;
  if (Array.isArray(c.lists?.acceptanceStatuses)) ACCEPTANCE_STATUSES = c.lists.acceptanceStatuses;
  if (Array.isArray(c.lists?.settlementStatuses)) SETTLEMENT_STATUSES = c.lists.settlementStatuses;
  if (Array.isArray(c.agencies)) CHU_TRUONG_AGENCIES = c.agencies;
  if (Array.isArray(c.templates?.qtnd)) QTNĐ_TITLES = c.templates.qtnd;
  if (Array.isArray(c.templates?.qtda)) QTDA_TITLES = c.templates.qtda;
}

function saveState() {
  apiSaveState({
    projects: state.projects,
    currentProjectId: state.currentProjectId
  }).catch(err => showToast('Lỗi lưu dữ liệu: ' + err.message, 'error'));
}

function getCurrentProject() {
  return state.projects.find(p => p.id === state.currentProjectId) || state.projects[0];
}

function selectProject(id) {
  if (!state.projects.some(p => p.id === id)) return;
  state.currentProjectId = id;
  const select = document.getElementById('project-selector');
  if (select) select.value = id;
  saveState();
  renderAll();
}

function generateId() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

// ============================================================
// SECTION 4: UTILITY FUNCTIONS
// ============================================================
// Escape dữ liệu nhập từ người dùng trước khi chèn vào HTML (chống XSS)
function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Luôn hiển thị số tiền đầy đủ, chính xác (không rút gọn thành "tr"/"tỷ")
function formatCurrency(n, short = false) {
  if (n == null || isNaN(n)) return '—';
  if (n === 0) return '0 ₫';
  return n.toLocaleString('vi-VN') + ' ₫';
}

function formatPercent(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}

function isPackageComplete(pkg) {
  if (!pkg) return false;
  return (pkg.acceptanceStatus === 'Đã nghiệm thu' || pkg.settlementStatus === 'Đã quyết toán')
      && pkg.invoiceValue >= (pkg.bidValue || 0);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ---- Project classification & legal lookup tables (per readme.md quy trình) ----
let PROJECT_TYPES = ['Đầu tư công', 'PPP', 'Vốn đầu tư chi thường xuyên', 'Đầu tư kinh doanh'];
let BUILDING_GRADES = ['Đặc biệt', 'I', 'II', 'III', 'IV'];
let CONTRACT_TYPES = ['Tư vấn (khảo sát, thiết kế, giám sát)', 'Thi công xây dựng', 'Hỗn hợp EPC', 'Hỗn hợp EC', 'Hỗn hợp PC', 'Hợp đồng trọn gói'];
let FEASIBILITY_STATUSES = ['Chưa lập', 'Đã lập, chờ thẩm định', 'Đã thẩm định'];
let ACCEPTANCE_STATUSES = ['Chưa nghiệm thu', 'Đã nghiệm thu', 'Đang kiểm tra CQCM'];
let SETTLEMENT_STATUSES = ['Chưa quyết toán', 'Đang thẩm tra', 'Đã quyết toán'];

// ---- Module 2: Hợp đồng & Pháp lý (NĐ 210/2026, NĐ 254/2025, NĐ 123/2020) ----
// Hạn mức chỉ định thầu theo loại gói (khoản 4 Điều 78 NĐ 214/2025/NĐ-CP)
let CONTRACT_ROUTE_DIRECT_LIMITS = { consulting: 800000000, construction: 2000000000, goods: 2000000000, mixed: 2000000000, nonConsulting: 2000000000, nonProject: 500000000 };

let CONTRACT_ROUTE_KTKT_LIMIT = 20000000000;      // ngưỡng bắt buộc lập BCNCKT
// Độ dài ngày báo sớm cho cảnh báo đỏ tiến độ hợp đồng
let CONTRACT_DEADLINE_WARN_DAYS = 30;

// Lấy hạn mức chỉ định thầu theo loại gói
function getDirectLimit(pkgType) {
  return CONTRACT_ROUTE_DIRECT_LIMITS[pkgType] || CONTRACT_ROUTE_DIRECT_LIMITS.construction || 2000000000;
}

// Đường phân nhánh hồ sơ hợp đồng theo giá trị gói
function getContractRoute(pkg) {
  const v = Number(pkg?.bidValue) || 0;
  const k = CONTRACT_ROUTE_KTKT_LIMIT;
  if (v >= k) return { code: 'bcnckt', name: 'Lập BCNCKT / thiết kế kỹ thuật', hint: `Từ ${Math.round(k/1e9)} tỷ: lập BCNCKT` };
  const d = getDirectLimit(pkg?.pkgType);
  if (v >= d) return { code: 'ktkt', name: 'Bắt buộc lập Báo cáo kinh tế - kỹ thuật', hint: `${Math.round(d/1e6)} triệu → ${Math.round(k/1e9)} tỷ` };
  return { code: 'direct', name: 'Triển khai trực tiếp', hint: `Dưới ${Math.round(d/1e6)} triệu` };
}

// Cảnh báo đỏ (red flag) tiến độ hợp đồng + ràng buộc hóa đơn/nghiệm thu (NĐ 123/2020)
function computeContractAlerts(pkg) {
  const alerts = [];
  if (!pkg) return alerts;

  // 1) Cảnh báo trễ hạn hợp đồng (tránh nhà thầu kéo dài thời gian không được ký phụ lục gia hạn hợp pháp)
  if (pkg.contractEndDate && pkg.progress < 100) {
    const d = daysUntil(pkg.contractEndDate);
    if (d != null) {
      if (d < 0) {
        alerts.push({ level: 'danger', icon: 'warning', message: `Gói "${pkg.name}": QUÁ HẠN hợp đồng ${-d} ngày (hạn ${formatDateVN(pkg.contractEndDate)}). Nếu kéo dài thời gian thực hiện, cần kiểm tra căn cứ và ký phụ lục hợp đồng theo NĐ 210/2026/NĐ-CP.` });
      } else if (d <= CONTRACT_DEADLINE_WARN_DAYS) {
        alerts.push({ level: 'warning', icon: 'schedule', message: `Gói "${pkg.name}": sắp đến hạn hoàn thành hợp đồng (còn ${d} ngày, tiến độ ${pkg.progress}%).` });
      }
    }
  }

  // 2) Ràng buộc bắt buộc: ngày xuất hóa đơn GTGT phải đồng bộ với ngày biên bản nghiệm thu KL hoàn thành (NĐ 123/2020)
  if (pkg.invoiceDate && pkg.acceptanceDate && pkg.invoiceDate < pkg.acceptanceDate) {
    alerts.push({ level: 'danger', icon: 'receipt_long', message: `Gói "${pkg.name}": ngày HĐ GTGT (${formatDateVN(pkg.invoiceDate)}) trước ngày nghiệm thu (${formatDateVN(pkg.acceptanceDate)}). Không hợp lệ theo NĐ 123/2020.` });
  }
  if (pkg.invoiceDate && !pkg.acceptanceDate) {
    alerts.push({ level: 'warning', icon: 'receipt_long', message: `Gói "${pkg.name}": đã xuất HĐ GTGT ${formatDateVN(pkg.invoiceDate)} nhưng chưa có biên bản nghiệm thu KL hoàn thành.` });
  }
  if (!pkg.invoiceDate && pkg.acceptanceDate) {
    alerts.push({ level: 'warning', icon: 'receipt_long', message: `Gói "${pkg.name}": đã nghiệm thu (${formatDateVN(pkg.acceptanceDate)}) nhưng chưa xuất HĐ GTGT đồng bộ.` });
  }

  // 4) Cảnh báo hạn nộp hồ sơ quyết toán (4 tháng kể từ bàn giao) — chỉ áp dụng cho construction/mixed/goods
  if (pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting') {
  if (pkg.handoverDate && pkg.settlementStatus !== 'Đã quyết toán') {
    const deadline = addMonths(pkg.handoverDate, 4);
    if (deadline) {
      const d = daysUntil(deadline);
      if (d != null && d <= 60) {
        const level = d < 0 ? 'danger' : (d <= 30 ? 'danger' : 'warning');
        const msg = d < 0
          ? `Gói "${pkg.name}": QUÁ HẠN nộp hồ sơ quyết toán ${-d} ngày (bàn giao ${formatDateVN(pkg.handoverDate)}, hạn ${formatDateVN(deadline)}). Cần lập văn bản đôn đốc nhà thầu theo Mẫu 02/QTDA.`
          : `Gói "${pkg.name}": còn ${d} ngày đến hạn nộp hồ sơ quyết toán (bàn giao ${formatDateVN(pkg.handoverDate)}). Cần đôn đốc nhà thầu nếu chưa nộp.`;
        alerts.push({ level, icon: 'warning', message: msg });
      }
    }
  }
  }

  return alerts;
}

// Cấp đặc biệt/I bảo hành tối thiểu 24 tháng, các cấp còn lại 12 tháng
function computeWarrantyMonths(buildingGrade) {
  return (buildingGrade === 'Đặc biệt' || buildingGrade === 'I') ? 24 : 12;
}

function addMonths(dateStr, months) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function formatDateVN(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `Ngày ${day} tháng ${month} năm ${year}`;
}

// Cảnh báo nội bộ: hạn khởi công, thẩm định quá hạn, bảo hành sắp/đã hết hạn, chưa quyết toán
function computeAlerts(project) {
  const alerts = [];
  if (!project) return alerts;

  const permit = project.permit || {};
  if (permit.issuedDate && !permit.startedDate) {
    const deadline = addMonths(permit.issuedDate, 12);
    const d = daysUntil(deadline);
    if (d != null) {
      if (d < 0) alerts.push({ level: 'danger', icon: 'gpp_maybe', message: `Quá hạn khởi công ${-d} ngày theo giấy phép số ${permit.number || '—'} (hạn ${formatDateVN(deadline)})` });
      else if (d <= 30) alerts.push({ level: 'warning', icon: 'gpp_maybe', message: `Sắp hết hạn khởi công (còn ${d} ngày) theo giấy phép số ${permit.number || '—'}` });
    }
  }

  const feas = project.feasibility || {};
  if (feas.submittedDate && feas.status !== 'Đã thẩm định') {
    const daysSince = -daysUntil(feas.submittedDate);
    if (daysSince > 5) {
      alerts.push({ level: 'warning', icon: 'schedule', message: `BCNCKT/Tổng mức đầu tư đã nộp thẩm định ${daysSince} ngày, quá thời hạn 05 ngày làm việc theo quy định nhưng chưa cập nhật kết quả` });
    }
  }

  project.categories.forEach(cat => {
    cat.packages.forEach(pkg => {
      if (pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting') {
      if (pkg.handoverDate) {
        const months = pkg.warrantyMonths || computeWarrantyMonths(project.buildingGrade);
        const end = addMonths(pkg.handoverDate, months);
        const d = daysUntil(end);
        if (d != null) {
          if (d < 0) alerts.push({ level: 'danger', icon: 'event_busy', message: `Gói thầu "${pkg.name}" đã hết hạn bảo hành (hạn ${formatDateVN(end)})` });
          else if (d <= 60) alerts.push({ level: 'warning', icon: 'event_busy', message: `Gói thầu "${pkg.name}" sắp hết hạn bảo hành (còn ${d} ngày, hạn ${formatDateVN(end)})` });
        }
      }
      }

      // Nâng cấp: giá trị trúng thầu vượt dự toán (nguy cơ chi sai nguồn vốn)
      if (pkg.bidValue && pkg.estimateValue && pkg.bidValue > pkg.estimateValue) {
        const ov = pkg.estimateValue > 0 ? ((pkg.bidValue - pkg.estimateValue) / pkg.estimateValue * 100) : 0;
        alerts.push({ level: 'danger', icon: 'trending_up', message: `Gói thầu "${pkg.name}" trúng thầu vượt dự toán ${formatCurrency(pkg.bidValue - pkg.estimateValue, true)} (${formatPercent(ov)}). Kiểm tra rà soát giá.` });
      }

      // Nâng cấp: gói đã hết hạn hợp đồng mà chưa nghiệm thu (rủi ro chậm hoàn công)
      if (pkg.contractEndDate && !pkg.acceptanceDate) {
        const d = daysUntil(pkg.contractEndDate);
        if (d != null && d < 0 && pkg.progress < 100) {
          alerts.push({ level: 'danger', icon: 'engineering', message: `Gói thầu "${pkg.name}": hết hạn hợp đồng ${-d} ngày nhưng chưa nghiệm thu hoàn thành (tiến độ ${pkg.progress}%).` });
        }
      }

      // Nâng cấp: chậm quyết toán gói đã hoàn thành lâu
      if (pkg.acceptanceDate && (!pkg.settlementStatus || pkg.settlementStatus === 'Chưa quyết toán')) {
        const daysSince = -daysUntil(pkg.acceptanceDate);
        if (daysSince != null) {
          if (daysSince > 180) alerts.push({ level: 'danger', icon: 'receipt_long', message: `Gói thầu "${pkg.name}" đã nghiệm thu ${daysSince} ngày nhưng chưa quyết toán (quá 90-180 ngày theo quy định).` });
          else if (daysSince > 90) alerts.push({ level: 'warning', icon: 'receipt_long', message: `Gói thầu "${pkg.name}" nghiệm thu ${daysSince} ngày, cần sớm hoàn thiện hồ sơ quyết toán (hạn 90 ngày sau quyết toán niên độ).` });
        }
      }

      if (pkg.progress >= 100 && (!pkg.settlementStatus || pkg.settlementStatus === 'Chưa quyết toán')) {
        alerts.push({ level: 'info', icon: 'receipt_long', message: `Gói thầu "${pkg.name}" đã hoàn thành nhưng chưa quyết toán` });
      }
      // Module 2: Hợp đồng & Pháp lý — red flag tiến độ + ràng buộc hóa đơn
      computeContractAlerts(pkg).forEach(a => alerts.push(a));
    });
  });

  return alerts;
}

function getCatInvestTotal(cat) {
  if (cat.investTotal) return cat.investTotal;
  return cat.packages.reduce((s, p) => s + (p.investValue || 0), 0);
}

// Danh mục hiển thị theo đúng thứ tự mã số (I, II, III... hoặc 1, 2, 3...), không phụ thuộc thứ tự lưu trữ
function romanToInt(str) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const s = String(str || '').trim().toUpperCase();
  if (/^\d+$/.test(s)) return Number(s);
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = map[s[i]] || 0;
    const next = map[s[i + 1]] || 0;
    result += cur < next ? -cur : cur;
  }
  return result || Number.MAX_SAFE_INTEGER;
}

function getSortedCategories(project) {
  return [...project.categories].sort((a, b) => romanToInt(a.code) - romanToInt(b.code));
}

function getCatDisbursedTotal(cat) {
  return cat.packages.reduce((s, p) => s + (p.cumulativeDisbursed || 0), 0);
}

function getCatBidTotal(cat) {
  return cat.packages.reduce((s, p) => s + (p.bidValue || 0), 0);
}

function getCatEstimateTotal(cat) {
  return cat.packages.reduce((s, p) => s + (p.estimateValue || 0), 0);
}

function getCatCumulativeTotal(cat) {
  return cat.packages.reduce((s, p) => s + (p.cumulativeValue || 0), 0);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="material-symbols-rounded">${icons[type] || 'info'}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// SECTION 5: CHART RENDERING
// ============================================================
const CAT_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#6b7280'];

// Giảm dần cỡ chữ cho tới khi text vừa với maxWidth (số tiền đầy đủ thường dài hơn số rút gọn)
function fitFontSize(ctx, text, maxWidth, weight, maxSize, minSize = 8) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size--;
  }
  return size;
}

function renderDonutChart() {
  const canvas = document.getElementById('chart-donut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const availW = canvas.parentElement ? canvas.parentElement.clientWidth : 380;
  const size = Math.max(220, Math.min(380, availW || 380));
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const project = getCurrentProject();
  if (!project) return;

  const data = getSortedCategories(project).map((cat, i) => ({
    label: cat.code + '. ' + cat.name,
    value: getCatInvestTotal(cat),
    color: cat.color || CAT_COLORS[i % CAT_COLORS.length]
  }));

  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2;
  const legendEl = document.getElementById('donut-legend');

  if (total === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chưa có dữ liệu', cx, cy);
    if (legendEl) legendEl.innerHTML = '<p class="chart-empty">Chưa có dữ liệu danh mục</p>';
    return;
  }

  const outerR = size / 2 - 30;
  const innerR = outerR * 0.62;
  let startAngle = -Math.PI / 2;

  data.forEach(d => {
    const sliceAngle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, endAngle);
    ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();

    // Gap between slices
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, endAngle - 0.01, endAngle + 0.01);
    ctx.arc(cx, cy, innerR, endAngle + 0.01, endAngle - 0.01, true);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    startAngle = endAngle;
  });

  // Center text
  const centerMaxWidth = innerR * 1.7;
  ctx.fillStyle = '#334155';
  fitFontSize(ctx, 'TỔNG MỨC ĐẦU TƯ', centerMaxWidth, 700, 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TỔNG MỨC ĐẦU TƯ', cx, cy - 14);
  const totalLabel = formatCurrency(total);
  const totalSize = fitFontSize(ctx, totalLabel, centerMaxWidth, 600, 15);
  ctx.font = `600 ${totalSize}px Inter, sans-serif`;
  ctx.fillStyle = '#2563eb';
  ctx.fillText(totalLabel, cx, cy + 14);

  // Legend
  if (legendEl) {
    legendEl.innerHTML = data.map(d => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${d.color}"></span>
        <span>${esc(d.label)}</span>
        <span class="legend-value">${formatCurrency(d.value)}</span>
      </div>
    `).join('');
  }
}

function renderBarChart() {
  const el = document.getElementById('chart-bar');
  if (!el) return;

  const project = getCurrentProject();
  const cats = project ? getSortedCategories(project) : [];

  // Legend
  const legend = `
    <div class="cmp-legend">
      <span class="cmp-lbl"><i class="cmp-dot" style="background:#2563eb"></i>Tổng mức đầu tư</span>
      <span class="cmp-lbl"><i class="cmp-dot" style="background:#06b6d4"></i>Dự toán</span>
      <span class="cmp-lbl"><i class="cmp-dot" style="background:#16a34a"></i>Giải ngân</span>
    </div>`;

  if (!cats.length) {
    el.innerHTML = legend + '<div class="plot-empty">Chưa có dữ liệu</div>';
    return;
  }

  const maxVal = Math.max(...cats.flatMap(c => [getCatInvestTotal(c), getCatEstimateTotal(c), getCatDisbursedTotal(c)]));
  if (!isFinite(maxVal) || maxVal <= 0) {
    el.innerHTML = legend + '<div class="plot-empty">Chưa có dữ liệu</div>';
    return;
  }

  const mkRow = (cat) => {
    const vals = [getCatInvestTotal(cat), getCatEstimateTotal(cat), getCatDisbursedTotal(cat)];
    const colors = ['#2563eb', '#06b6d4', '#16a34a'];
    const bars = vals.map((v, j) => {
      const pct = maxVal > 0 ? Math.round(v / maxVal * 100) : 0;
      return `
        <div class="cmp-bar-row">
          <div class="cmp-track" title="${esc(formatCurrency(v))}">
            <span class="cmp-fill" style="width:${pct}%;background:${colors[j]}"></span>
          </div>
          <span class="cmp-val">${formatCurrency(v)}</span>
        </div>`;
    }).join('');

    return `
      <div class="cmp-line">
        <div class="cmp-name">
          <span class="cmp-code">${esc(cat.code)}</span>
          <span class="cmp-title">${esc(cat.name)}</span>
        </div>
        <div class="cmp-bars">${bars}</div>
      </div>`;
  };

  el.innerHTML = legend + cats.map(mkRow).join('');
}

// ============================================================
// TIẾN ĐỘ: danh sách thẻ gói thầu
// ============================================================
function renderGanttChart() {
  const el = document.getElementById('gantt-chart');
  if (!el) return;
  const project = getCurrentProject();
  if (!project) return;

  const all = [];
  getSortedCategories(project).forEach(c => c.packages.forEach(pkg => all.push({ cat: c, pkg })));

  if (!all.length) {
    el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Chưa có gói thầu nào.</p>';
    return;
  }

  const rows = all.map(({ cat, pkg }, idx) => {
    const pc = (pkg.pkgType === 'consulting' || pkg.pkgType === 'nonConsulting') ? null : (pkg.progress || 0);
    const isConsulting = pkg.pkgType === 'consulting' || pkg.pkgType === 'nonConsulting';
    let status, badgeCls;
    if (isConsulting) {
      status = isPackageComplete(pkg) ? 'Hoàn thành' : 'Đang thực hiện';
      badgeCls = isPackageComplete(pkg) ? 'badge-success' : 'badge-info';
    } else {
      status = isPackageComplete(pkg) ? 'Hoàn thành' : (pkg.contractEndDate && daysUntil(pkg.contractEndDate) < 0 ? 'Quá hạn' : 'Đang thực hiện');
      badgeCls = isPackageComplete(pkg) ? 'badge-success' : (pkg.contractEndDate && daysUntil(pkg.contractEndDate) < 0 ? 'badge-danger' : 'badge-info');
    }
    const name = pkg.name;
    const start = pkg.contractStartDate || pkg.contractSignDate || pkg.handoverDate;
    const end = pkg.contractEndDate || pkg.handoverDate;
    const dateInfo = start ? `${formatDateShort(start)}${end ? ' → ' + formatDateShort(end) : ''}` : '';
    const contractor = pkg.contractor || '';

    return `
    <div class="gantt-row">
      <div class="gantt-row-info">
        <div class="gantt-row-name" title="${esc(pkg.name)}">${idx + 1}. ${esc(name)}</div>
        <div class="gantt-row-meta">
          ${dateInfo ? `<span>${esc(dateInfo)}</span>` : ''}
          ${contractor ? `<span> · ${esc(contractor)}</span>` : ''}
        </div>
      </div>
      <div class="gantt-row-status"><span class="badge ${badgeCls}">${status}${pc !== null ? ` ${pc}%` : ''}</span></div>
    </div>`;
  }).join('');

  el.innerHTML = rows;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ============================================================
// SECTION 6: UI RENDERING
// ============================================================
function renderProjectSelector() {
  const select = document.getElementById('project-selector');
  select.innerHTML = state.projects.map(p =>
    `<option value="${esc(p.id)}" ${p.id === state.currentProjectId ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');
}

function renderProjectInfoBar() {
  const project = getCurrentProject();
  const bar = document.getElementById('project-info-bar');
  if (!project) { bar.innerHTML = ''; return; }
  bar.innerHTML = `
    <div class="info-item"><span class="info-label">Dự án:</span><span class="info-value">${esc(project.fullName || project.name)}</span></div>
    <div class="info-item"><span class="info-label">Chủ đầu tư:</span><span class="info-value">${esc(project.owner)}</span></div>
    <div class="info-item"><span class="info-label">Địa điểm:</span><span class="info-value">${esc(project.location)}</span></div>
    <div class="info-item"><span class="info-label">Thời gian:</span><span class="info-value">${project.startYear || project.endYear ? `${project.startYear || '...'}–${project.endYear || '...'}` : 'Chưa cập nhật'}</span></div>
    <div class="info-item"><span class="info-label">Nhóm:</span><span class="info-value">${esc(project.projectGroup || '—')}</span></div>
    <div class="info-item"><span class="info-label">Năm KH vốn:</span><span class="info-value">${project.planYear || '—'}</span></div>
    <div class="info-item"><span class="info-label">Nguồn vốn:</span><span class="info-value">${esc(project.investmentSource || '—')}</span></div>
    <div class="info-item"><span class="info-label">Tổng mức đầu tư:</span><span class="info-value" style="color:var(--accent-cyan);font-weight:700">${formatCurrency(project.totalInvestment, true)}</span></div>
    ${project.identifierCode ? `<div class="info-item"><span class="info-label">Mã ĐD:</span><span class="info-value">${esc(project.identifierCode)}</span></div>` : ''}
    ${project.projectType ? `<div class="info-item"><span class="badge badge-neutral">${esc(project.projectType)}</span></div>` : ''}
    ${project.buildingGrade ? `<div class="info-item"><span class="badge badge-info">Cấp ${project.buildingGrade}</span></div>` : ''}
    ${project.bimRequired ? `<div class="info-item"><span class="badge badge-success">BIM</span></div>` : ''}
    ${project.smallProject ? `<div class="info-item"><span class="badge badge-warning">Dự án nhỏ lẻ / giá trị thấp</span></div>` : ''}
  `;
}

function renderAlertsPanel(project) {
  const panel = document.getElementById('alerts-panel');
  if (!panel) return;
  const alerts = computeAlerts(project);
  if (alerts.length === 0) { panel.innerHTML = ''; return; }
  panel.innerHTML = `
    <div class="alert-banner glass-card">
      <h3><span class="material-symbols-rounded">notifications_active</span> Cảnh báo cần theo dõi (${alerts.length})</h3>
      <div class="alert-list">
        ${alerts.map(a => `
          <div class="alert-item alert-${a.level}">
            <span class="material-symbols-rounded">${a.icon}</span>
            <span>${esc(a.message)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDashboard() {
  const project = getCurrentProject();
  if (!project) return;

  renderAlertsPanel(project);

  const allPkgs = project.categories.flatMap(c => c.packages.map(p => ({ cat: c, pkg: p })));

  const totalInvest = project.totalInvestment;
  const totalBid = project.categories.reduce((s, c) => s + getCatBidTotal(c), 0);
  const totalDisbursed = project.categories.reduce((s, c) => s + getCatDisbursedTotal(c), 0);
  const totalCumulative = project.categories.reduce((s, c) => s + getCatCumulativeTotal(c), 0);

  const disbursedRate = totalInvest > 0 ? (totalDisbursed / totalInvest) * 100 : 0;

  const kpiEl = document.getElementById('kpi-cards');
  kpiEl.innerHTML = `
    <div class="kpi-card glass-card" data-color="cyan">
      <div class="kpi-header">
        <span class="kpi-label">Tổng mức đầu tư</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">account_balance</span></div>
      </div>
      <div class="kpi-value">${formatCurrency(totalInvest, true)}</div>
      <div class="kpi-sub">KH vốn năm ${project.planYear || '—'}: ${formatCurrency(project.annualPlan, true)}</div>
    </div>
    <div class="kpi-card glass-card" data-color="purple">
      <div class="kpi-header">
        <span class="kpi-label">Giá trị trúng thầu</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">gavel</span></div>
      </div>
      <div class="kpi-value">${formatCurrency(totalBid, true)}</div>
      <div class="kpi-sub">Lũy kế thực hiện: ${formatCurrency(totalCumulative, true)}</div>
    </div>
    <div class="kpi-card glass-card" data-color="green">
      <div class="kpi-header">
        <span class="kpi-label">Lũy kế giải ngân</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">payments</span></div>
      </div>
      <div class="kpi-value">${formatCurrency(totalDisbursed, true)}</div>
      <div class="kpi-sub">Còn lại: ${formatCurrency(totalInvest - totalDisbursed, true)}</div>
    </div>
    <div class="kpi-card glass-card" data-color="amber">
      <div class="kpi-header">
        <span class="kpi-label">Tỷ lệ giải ngân</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">trending_up</span></div>
      </div>
      <div class="kpi-value">${formatPercent(disbursedRate)}</div>
      <div class="kpi-sub">/ Tổng mức đầu tư</div>
    </div>
  `;

  // Timeline alerts (Feature 3)
  const timelineItems = [];
  allPkgs.forEach(({ cat, pkg }) => {
    if (pkg.contractEndDate) {
      const d = daysUntil(pkg.contractEndDate);
      if (d != null && d >= 0 && d <= 30) {
        timelineItems.push({ date: pkg.contractEndDate, name: pkg.name, event: 'Hết hạn hợp đồng', days: d, urgent: d <= 7 });
      }
    }
    if (pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' && pkg.handoverDate) {
      const months = pkg.warrantyMonths || computeWarrantyMonths(project.buildingGrade);
      const end = addMonths(pkg.handoverDate, months);
      if (end) {
        const d = daysUntil(end);
        if (d != null && d >= 0 && d <= 60) {
          timelineItems.push({ date: end, name: pkg.name, event: 'Hết hạn bảo hành', days: d, urgent: d <= 14 });
        }
      }
    }
    if (pkg.acceptanceDate) {
      const d = daysUntil(pkg.acceptanceDate);
      if (d != null && d >= 0 && d <= 30) {
        timelineItems.push({ date: pkg.acceptanceDate, name: pkg.name, event: 'Nghiệm thu', days: d, urgent: d <= 7 });
      }
    }
    if (pkg.handoverDate) {
      const d = daysUntil(pkg.handoverDate);
      if (d != null && d >= 0 && d <= 30) {
        timelineItems.push({ date: pkg.handoverDate, name: pkg.name, event: 'Bàn giao', days: d, urgent: d <= 7 });
      }
    }
    // Settlement deadline (4 months from handover)
    if (pkg.handoverDate && pkg.settlementStatus !== 'Đã quyết toán') {
      const deadline = addMonths(pkg.handoverDate, 4);
      if (deadline) {
        const d = daysUntil(deadline);
        if (d != null && d <= 60 && d >= -30) {
          timelineItems.push({ date: deadline, name: pkg.name, event: 'Hạn nộp hồ sơ quyết toán (4 tháng từ bàn giao)', days: d, urgent: d <= 14 });
        }
      }
    }
  });
  timelineItems.sort((a, b) => a.date.localeCompare(b.date));

  renderCapitalSummary();

  const kpiContainer = kpiEl.parentElement;
  let timelineEl = document.getElementById('dashboard-timeline');
  if (!timelineEl) {
    timelineEl = document.createElement('div');
    timelineEl.id = 'dashboard-timeline';
    if (kpiContainer) kpiContainer.appendChild(timelineEl);
  }
  if (timelineItems.length > 0) {
    timelineEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin:12px 0 4px 0">
        <span class="material-symbols-rounded" style="font-size:18px;color:var(--accent-cyan)">event</span>
        <span style="font-weight:700;font-size:0.85rem">Các mốc sắp đến</span>
        <span style="font-size:0.75rem;color:var(--text-muted)">(${timelineItems.length})</span>
      </div>
      <div class="timeline-list">
        ${timelineItems.map(item => `
          <div class="timeline-item ${item.urgent ? 'urgent' : ''}">
            <span class="timeline-dot"></span>
            <div class="timeline-content">
              <strong>${esc(item.name)}</strong> &mdash; ${esc(item.event)}
              <small>${formatDateVN(item.date)} (còn ${item.days} ngày)</small>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    timelineEl.innerHTML = '';
  }

  renderDonutChart();
  renderBarChart();
  renderGanttChart();
}

function renderCapitalSummary() {
  const el = document.getElementById('capital-summary');
  if (!el) return;

  const projects = (state.projects || []).map(proj => {
    const invest = proj.totalInvestment || 0;
    const disbursed = proj.categories.reduce((s, c) => s + getCatDisbursedTotal(c), 0);
    const cumulative = proj.categories.reduce((s, c) => s + getCatCumulativeTotal(c), 0);
    const rate = invest > 0 ? (disbursed / invest) * 100 : 0;
    return { proj, invest, disbursed, cumulative, rate };
  });

  const totalInvest = projects.reduce((s, r) => s + r.invest, 0);
  const totalAnnual = projects.reduce((s, r) => s + (r.proj.annualPlan || 0), 0);
  const totalCumulativePlan = projects.reduce((s, r) => s + (r.proj.cumulativePlan || 0), 0);
  const totalDisbursed = projects.reduce((s, r) => s + r.disbursed, 0);
  const totalCumulative = projects.reduce((s, r) => s + r.cumulative, 0);
  const totalRate = totalInvest > 0 ? (totalDisbursed / totalInvest) * 100 : 0;
  const planYears = [...new Set(projects.map(r => r.proj.planYear).filter(Boolean))];
  const canTotalPlans = projects.length > 0 && projects.every(r => r.proj.planYear) && planYears.length === 1;

  el.innerHTML = `
    <details class="chart-card glass-card capital-summary-card" style="margin-bottom:24px">
      <summary class="capital-summary-toggle">
        <span><span class="material-symbols-rounded">account_balance_wallet</span> Tổng hợp kế hoạch vốn các dự án</span>
        <span class="capital-summary-meta">${projects.length} dự án <span class="material-symbols-rounded capital-expand-icon">expand_more</span></span>
      </summary>
      <div class="capital-summary-note">
        <strong>Kế hoạch vốn năm</strong> là số vốn được giao riêng trong năm kế hoạch của từng dự án.
        <strong>Lũy kế vốn đã phân bổ</strong> là tổng số vốn đã giao từ khi bắt đầu dự án đến hết năm kế hoạch đó.
        <span class="capital-summary-note-extra">Các tổng ở cuối bảng chỉ mang tính tổng hợp nhanh; khi các dự án khác năm, hãy đọc theo nhãn năm ở từng dòng.</span>
      </div>
      <div class="capital-table-wrapper">
        <table class="report-table capital-table">
          <thead>
            <tr>
              <th>TT</th>
              <th>Dự án</th>
              <th>Thời gian thực hiện</th>
              <th class="text-right">Tổng mức đầu tư</th>
              <th class="text-right">Kế hoạch vốn năm</th>
              <th class="text-right">Lũy kế vốn đã phân bổ</th>
              <th class="text-right">Lũy kế thực hiện</th>
              <th class="text-right">Lũy kế giải ngân</th>
              <th class="text-right">Tỷ lệ giải ngân</th>
            </tr>
          </thead>
          <tbody>
            ${projects.map((r, i) => `
              <tr class="${r.proj.id === state.currentProjectId ? 'row-current' : ''}" onclick="selectProject('${r.proj.id}')">
                <td>${i + 1}</td>
                <td class="pkg-name">${esc(r.proj.name)}</td>
                <td>${r.proj.startYear || r.proj.endYear ? `${r.proj.startYear || '...'}–${r.proj.endYear || '...'}` : '—'}</td>
                <td class="text-right">${formatCurrency(r.invest, true)}</td>
                <td class="text-right"><small class="capital-year-label">Năm ${r.proj.planYear || '—'}</small>${formatCurrency(r.proj.annualPlan || 0, true)}</td>
                <td class="text-right"><small class="capital-year-label">Đến hết ${r.proj.planYear || '—'}</small>${formatCurrency(r.proj.cumulativePlan || 0, true)}</td>
                <td class="text-right">${formatCurrency(r.cumulative, true)}</td>
                <td class="text-right">${formatCurrency(r.disbursed, true)}</td>
                <td class="text-right"><span class="badge ${r.rate >= 60 ? 'badge-success' : r.rate >= 30 ? 'badge-warning' : 'badge-danger'}">${formatPercent(r.rate)}</span></td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3"><strong>Tổng cộng (${projects.length} dự án)</strong></td>
              <td class="text-right"><strong>${formatCurrency(totalInvest, true)}</strong></td>
              <td class="text-right">${canTotalPlans ? `<small class="capital-year-label">Năm ${planYears[0]}</small><strong>${formatCurrency(totalAnnual, true)}</strong>` : '<span class="capital-not-totaled">Không cộng khác năm</span>'}</td>
              <td class="text-right">${canTotalPlans ? `<small class="capital-year-label">Đến hết ${planYears[0]}</small><strong>${formatCurrency(totalCumulativePlan, true)}</strong>` : '<span class="capital-not-totaled">Không cộng khác năm</span>'}</td>
              <td class="text-right"><strong>${formatCurrency(totalCumulative, true)}</strong></td>
              <td class="text-right"><strong>${formatCurrency(totalDisbursed, true)}</strong></td>
              <td class="text-right"><span class="badge badge-info">${formatPercent(totalRate)}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  `;
}

function renderPackages(searchTerm = '') {
  const project = getCurrentProject();
  const container = document.getElementById('categories-container');
  if (!project) { container.innerHTML = '<p style="color:var(--text-muted)">Chưa có dự án nào.</p>'; return; }

  const term = searchTerm.toLowerCase().trim();

  container.innerHTML = getSortedCategories(project).map((cat, ci) => {
    const filteredPkgs = term
      ? cat.packages.filter(p => p.name.toLowerCase().includes(term) || p.contractor?.toLowerCase().includes(term))
      : cat.packages;

    if (term && filteredPkgs.length === 0) return '';

    const investTotal = getCatInvestTotal(cat);
    const estimateTotal = getCatEstimateTotal(cat);
    const disbursedTotal = getCatDisbursedTotal(cat);

    return `
    <div class="category-group" data-cat-id="${cat.id}">
      <div class="category-header" onclick="toggleCategory(this)">
        <div class="category-code" style="background:${cat.color || CAT_COLORS[ci]}">${esc(cat.code)}</div>
        <div class="category-name">${esc(cat.name)}</div>
        <div class="category-stats">
          <span>Tổng mức đầu tư: <span class="stat-value">${formatCurrency(investTotal, true)}</span></span>
          <span>Dự toán: <span class="stat-value">${formatCurrency(estimateTotal, true)}</span></span>
          <span>Giải ngân: <span class="stat-value">${formatCurrency(disbursedTotal, true)}</span></span>
          <span>Gói: <span class="stat-value">${cat.packages.length}</span></span>
        </div>
        <div class="category-actions edit-only">
          <button class="btn-icon btn-sm" title="Sửa danh mục" onclick="event.stopPropagation();editCategory('${cat.id}')">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button class="btn-icon btn-sm" title="Xóa danh mục" onclick="event.stopPropagation();deleteCategory('${cat.id}')">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
        <div class="category-toggle btn-icon btn-sm">
          <span class="material-symbols-rounded">expand_more</span>
        </div>
      </div>
      <div class="category-body">
        <div class="category-body-inner">
          <div class="pkg-table-wrapper">
            <table class="pkg-table">
              <thead>
                <tr>
                  <th style="width:48px">TT</th>
                  <th>Tên gói thầu</th>
                  <th>Dự toán</th>
                  <th>Hình thức</th>
                  <th>Nhà thầu</th>
                  <th>Tiến độ</th>
                  <th>Giải ngân LK</th>
                  <th style="width:120px">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${filteredPkgs.map((pkg, pi) => {
      const progressClass = pkg.progress >= 100 ? 'complete' : pkg.progress >= 60 ? 'high' : pkg.progress >= 30 ? 'medium' : 'low';
      return `
                  <tr>
                    <td>${pi + 1}</td>
                    <td class="pkg-name">${esc(pkg.name)}${pkg.pdfs?.length ? ' <span class="material-symbols-rounded" style="font-size:14px;color:var(--accent-amber)" title="Có file đính kèm">attach_file</span>' : ''}</td>
                    <td class="text-right">${pkg.estimateValue ? formatCurrency(pkg.estimateValue, true) : '—'}</td>
                    <td class="pkg-wrap">${esc(pkg.selectionMethod || '—')}</td>
                    <td class="pkg-wrap">${esc(pkg.contractor || '—')}</td>
                    <td>
                      <span class="badge ${(() => { const r = getContractRoute(pkg); return r.code === 'ktkt' ? 'badge-warning' : (r.code === 'bcnckt' ? 'badge-info' : 'badge-neutral'); })()}">${getContractRoute(pkg).name}</span>
                      ${pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' ? `
                      <div class="progress-bar" style="margin-top:4px"><div class="progress-fill ${progressClass}" style="width:${pkg.progress}%"></div></div>
                      <span>${pkg.progress}%</span>
                      ` : '<span style="color:var(--text-muted);font-size:0.85rem">—</span>'}
                    </td>
                    <td class="text-right">${pkg.cumulativeDisbursed ? formatCurrency(pkg.cumulativeDisbursed, true) : '—'}</td>
                    <td>
                      <div class="pkg-actions">
                        <button class="btn-icon btn-sm" title="Xem chi tiết" onclick="viewPackageDetail('${cat.id}','${pkg.id}')">
                          <span class="material-symbols-rounded">visibility</span>
                        </button>
                        <button class="btn-icon btn-sm edit-only" title="Sửa" onclick="editPackage('${cat.id}','${pkg.id}')">
                          <span class="material-symbols-rounded">edit</span>
                        </button>
                        <button class="btn-icon btn-sm edit-only" title="Xóa" onclick="deletePackage('${cat.id}','${pkg.id}')">
                          <span class="material-symbols-rounded">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>`;
    }).join('')}
              </tbody>
            </table>
          </div>
          <div class="add-pkg-row edit-only">
            <button class="btn btn-secondary btn-sm" onclick="addPackage('${cat.id}')">
              <span class="material-symbols-rounded">add</span> Thêm gói thầu
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderReports() {
  const project = getCurrentProject();
  const container = document.getElementById('report-content');
  if (!project) { container.innerHTML = ''; return; }

  const totalInvest = project.totalInvestment;
  const allPkgs = project.categories.flatMap(c => c.packages);
  const totalEstimate = allPkgs.reduce((s, p) => s + (p.estimateValue || 0), 0);
  const totalBid = allPkgs.reduce((s, p) => s + (p.bidValue || 0), 0);
  const totalDisbursed = allPkgs.reduce((s, p) => s + (p.cumulativeDisbursed || 0), 0);
  const totalCumulative = allPkgs.reduce((s, p) => s + (p.cumulativeValue || 0), 0);
  const totalAcceptance = allPkgs.reduce((s, p) => s + (p.acceptanceValue || 0), 0);
  const pendingPkgs = allPkgs.filter(p => !p.contract || p.contract === '' || p.contract === '-');
  const completedPkgs = allPkgs.filter(isPackageComplete);
  const disbursedRate = totalInvest > 0 ? (totalDisbursed / totalInvest * 100) : 0;

  container.innerHTML = `
    <!-- Summary Cards -->
    <div class="report-summary-grid">
      <div class="report-summary-card glass-card">
        <h4>Tổng mức đầu tư</h4>
        <div class="big-number" style="color:var(--accent-cyan)">${formatCurrency(totalInvest, true)}</div>
        <div class="big-sub">Kế hoạch vốn năm ${project.planYear || '—'}: ${formatCurrency(project.annualPlan, true)}</div>
      </div>
      <div class="report-summary-card glass-card">
        <h4>Tỷ lệ giải ngân</h4>
        <div class="big-number" style="color:var(--accent-green)">${formatPercent(disbursedRate)}</div>
        <div class="big-sub">${formatCurrency(totalDisbursed, true)} / ${formatCurrency(totalInvest, true)}</div>
      </div>
      <div class="report-summary-card glass-card">
        <h4>Gói thầu hoàn thành</h4>
        <div class="big-number" style="color:var(--accent-amber)">${completedPkgs.length}/${allPkgs.length}</div>
        <div class="big-sub">Chưa có HĐ: ${pendingPkgs.length} gói</div>
      </div>
      <div class="report-summary-card glass-card">
        <h4>Giá trị nghiệm thu</h4>
        <div class="big-number" style="color:var(--accent-purple)">${formatCurrency(totalAcceptance, true)}</div>
        <div class="big-sub">Lũy kế thực hiện: ${formatCurrency(totalCumulative, true)}</div>
      </div>
    </div>

    <!-- Comparison Report -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">compare_arrows</span> So sánh chi phí theo danh mục</h3>
      <div class="report-table-wrapper">
        <table class="report-table rpt-compare">
          <thead>
            <tr>
              <th>TT</th>
              <th>Danh mục</th>
              <th class="text-right">Tổng mức đầu tư</th>
              <th class="text-right">Dự toán</th>
              <th class="text-right">Trúng thầu</th>
              <th class="text-right">Lũy kế giải ngân</th>
              <th class="text-right">Chênh lệch (Tổng mức đầu tư - GN)</th>
              <th class="text-right">Tỷ lệ GN/Tổng mức đầu tư</th>
            </tr>
          </thead>
          <tbody>
            ${getSortedCategories(project).map((cat, idx) => {
    const inv = getCatInvestTotal(cat);
    const est = getCatEstimateTotal(cat);
    const bid = getCatBidTotal(cat);
    const disb = getCatDisbursedTotal(cat);
    const diff = inv - disb;
    const rate = inv > 0 ? (disb / inv * 100) : 0;
    return `
              <tr>
                <td>${idx + 1}</td>
                <td>${esc(cat.name)}</td>
                <td class="text-right">${formatCurrency(inv, true)}</td>
                <td class="text-right">${formatCurrency(est, true)}</td>
                <td class="text-right">${formatCurrency(bid, true)}</td>
                <td class="text-right">${formatCurrency(disb, true)}</td>
                <td class="text-right ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}">${diff > 0 ? '+' : ''}${formatCurrency(diff, true)}</td>
                <td class="text-right">${formatPercent(rate)}</td>
              </tr>`;
  }).join('')}
            <tr class="total-row">
              <td colspan="2"><strong>TỔNG CỘNG</strong></td>
              <td class="text-right">${formatCurrency(project.categories.reduce((s, c) => s + getCatInvestTotal(c), 0), true)}</td>
              <td class="text-right">${formatCurrency(totalEstimate, true)}</td>
              <td class="text-right">${formatCurrency(totalBid, true)}</td>
              <td class="text-right">${formatCurrency(totalDisbursed, true)}</td>
              <td class="text-right">${formatCurrency(totalInvest - totalDisbursed, true)}</td>
              <td class="text-right">${formatPercent(disbursedRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pending Packages -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">warning</span> Gói thầu chưa có hợp đồng (cần theo dõi)</h3>
      ${pendingPkgs.length > 0 ? `
      <div class="report-table-wrapper">
        <table class="report-table rpt-pending">
          <thead>
            <tr><th>TT</th><th>Tên gói thầu</th><th class="text-right">Giá trị Tổng mức đầu tư</th><th class="text-right">Dự toán</th><th>Ghi chú</th></tr>
          </thead>
          <tbody>
            ${pendingPkgs.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(p.name)}</td>
              <td class="text-right">${formatCurrency(p.investValue, true)}</td>
              <td class="text-right">${p.estimateValue ? formatCurrency(p.estimateValue, true) : '—'}</td>
              <td class="warning-text">${esc(p.notes || 'Chưa có hợp đồng')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p style="color:var(--accent-green);padding:12px">✓ Tất cả gói thầu đều đã có hợp đồng.</p>'}
    </div>

    <!-- Completed Packages -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">check_circle</span> Gói thầu đã hoàn thành (100%)</h3>
      <div class="report-table-wrapper">
        <table class="report-table rpt-done">
          <thead>
            <tr><th>TT</th><th>Tên gói thầu</th><th>Nhà thầu</th><th class="text-right">Giá trị trúng thầu</th><th class="text-right">Giải ngân LK</th><th class="text-right">Nghiệm thu</th></tr>
          </thead>
          <tbody>
            ${completedPkgs.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(p.name)}</td>
              <td>${esc(p.contractor || '—')}</td>
              <td class="text-right">${formatCurrency(p.bidValue, true)}</td>
              <td class="text-right">${formatCurrency(p.cumulativeDisbursed, true)}</td>
              <td class="text-right">${formatCurrency(p.acceptanceValue, true)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <!-- Warranty Tracking -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">verified</span> Theo dõi bảo hành công trình</h3>
      ${(() => {
      const withHandover = allPkgs.filter(p => p.handoverDate && p.pkgType !== 'consulting' && p.pkgType !== 'nonConsulting');
      if (withHandover.length === 0) return '<p style="color:var(--text-secondary);padding:12px">Chưa có gói thầu nào được bàn giao.</p>';
      return `
        <div class="report-table-wrapper">
          <table class="report-table rpt-warranty">
            <thead>
              <tr><th>TT</th><th>Tên gói thầu</th><th>Ngày bàn giao</th><th class="text-right">Thời hạn bảo hành</th><th>Hết hạn</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              ${withHandover.map((p, i) => {
        const months = p.warrantyMonths || computeWarrantyMonths(project.buildingGrade);
        const end = addMonths(p.handoverDate, months);
        const d = daysUntil(end);
        const badge = d < 0 ? `<span class="badge badge-danger">Hết hạn ${-d} ngày</span>` : (d <= 60 ? `<span class="badge badge-warning">Còn ${d} ngày</span>` : `<span class="badge badge-success">Còn hiệu lực</span>`);
        return `
                <tr>
                  <td>${i + 1}</td>
                  <td>${esc(p.name)}</td>
                  <td>${formatDateVN(p.handoverDate)}</td>
                  <td class="text-right">${months} tháng</td>
                  <td>${formatDateVN(end)}</td>
                  <td>${badge}</td>
                </tr>`;
      }).join('')}
            </tbody>
          </table>
        </div>`;
    })()}
    </div>

    <!-- Settlement Report -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">receipt_long</span> Quyết toán hợp đồng A-B</h3>
      <div class="report-table-wrapper">
        <table class="report-table rpt-settlement">
          <thead>
            <tr><th>TT</th><th>Tên gói thầu</th><th class="text-right">Giá trị quyết toán</th><th class="text-right">KL phát sinh</th><th>Ngày quyết toán</th><th>Trạng thái</th></tr>
          </thead>
          <tbody>
            ${allPkgs.map((p, i) => {
      const status = p.settlementStatus || 'Chưa quyết toán';
      const cls = status === 'Đã quyết toán' ? 'badge-success' : (status === 'Đang thẩm tra' ? 'badge-warning' : 'badge-neutral');
      return `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(p.name)}</td>
                <td class="text-right">${p.settlementValue ? formatCurrency(p.settlementValue, true) : '—'}</td>
                <td class="text-right">${p.arisingValue ? formatCurrency(p.arisingValue, true) : '—'}</td>
                <td>${formatDateVN(p.settlementDate)}</td>
                <td><span class="badge ${cls}">${status}</span></td>
              </tr>`;
    }).join('')}
            <tr class="total-row">
              <td colspan="2"><strong>TỔNG GIÁ TRỊ QUYẾT TOÁN</strong></td>
              <td class="text-right">${formatCurrency(allPkgs.reduce((s, p) => s + (p.settlementValue || 0), 0), true)}</td>
              <td class="text-right">${formatCurrency(allPkgs.reduce((s, p) => s + (p.arisingValue || 0), 0), true)}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="report-section-note">
        <strong>Quyết toán vốn đầu tư dự án:</strong>
        Trạng thái: <span class="badge ${project.settlement?.status === 'Đã quyết toán' ? 'badge-success' : 'badge-neutral'}">${project.settlement?.status || 'Chưa quyết toán'}</span>
        &nbsp;|&nbsp; Giá trị: ${project.settlement?.totalValue ? formatCurrency(project.settlement.totalValue, true) : '—'}
        &nbsp;|&nbsp; Ngày phê duyệt: ${formatDateVN(project.settlement?.approvedDate)}
      </div>
    </div>

    <!-- Module 2: Hợp đồng & Pháp lý -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">gavel</span> Theo dõi hợp đồng & Pháp lý gói thầu</h3>
      <div class="report-table-wrapper">
        <table class="report-table rpt-contract">
          <thead>
            <tr>
              <th>TT</th><th>Tên gói thầu</th><th>Phân nhánh hồ sơ</th>
              <th>Ngày hết hạn HĐ</th><th class="text-center">Tiến độ</th><th>Ngày nghiệm thu</th>
              <th>Ngày HĐ GTGT</th><th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${allPkgs.map((p, i) => {
    const r = getContractRoute(p);
    let status = '<span class="badge badge-success">Bình thường</span>';
    const ca = computeContractAlerts(p);
    if (ca.some(a => a.level === 'danger')) status = '<span class="badge badge-danger">Cảnh báo đỏ</span>';
    else if (ca.length) status = '<span class="badge badge-warning">Cần lưu ý</span>';
    const routeBadge = r.code === 'ktkt' ? '<span class="badge badge-warning">' + r.name + '</span>' : (r.code === 'bcnckt' ? '<span class="badge badge-info">' + r.name + '</span>' : '<span class="badge badge-neutral">' + r.name + '</span>');
    return `
              <tr>
                <td>${i + 1}</td>
                <td class="pkg-wrap">${esc(p.name)}</td>
                <td>${routeBadge}</td>
                <td>${formatDateVN(p.contractEndDate)}</td>
                <td class="text-center">${(p.pkgType === 'consulting' || p.pkgType === 'nonConsulting') ? '<strong>—</strong>' : `<strong>${p.progress || 0}%</strong>`}</td>
                <td>${formatDateVN(p.acceptanceDate)}</td>
                <td>${p.invoiceDate ? formatDateVN(p.invoiceDate) + (p.invoiceXml ? ' <span class="badge badge-success">XML</span>' : '') : '—'}</td>
                <td>${status}</td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Template Export -->
    <!-- Template Export -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">print</span> In & Xuất mẫu biểu báo cáo</h3>
      <div class="header-actions" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px">
        <button class="btn btn-primary" onclick="exportFullProjectReport()">
          <span class="material-symbols-rounded">print</span> Báo cáo tổng hợp dự án & Giải ngân
        </button>
        <button class="btn btn-secondary" onclick="exportPackagesReport()">
          <span class="material-symbols-rounded">inventory_2</span> Báo cáo chi tiết gói thầu
        </button>
        <button class="btn btn-secondary" onclick="exportSettlementWarrantyReport()">
          <span class="material-symbols-rounded">receipt_long</span> Báo cáo Quyết toán & Bảo hành
        </button>
        <button class="btn btn-accent" onclick="exportExcel('current')">
          <span class="material-symbols-rounded">table</span> Xuất Excel (dự án hiện tại)
        </button>
        <button class="btn btn-accent" onclick="exportExcel('all')">
          <span class="material-symbols-rounded">table</span> Xuất Excel (tất cả dự án)
        </button>
      </div>
    </div>
  `;
}

// ---- Xuất mẫu biểu (in) ----
function openPrintWindow(title, bodyHTML) {
  const win = window.open('', '_blank');
  if (!win) { showToast('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup.', 'error'); return; }
  win.document.write(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 13px; color: #000; padding: 30px; line-height: 1.5; }
        .print-header { text-align: center; margin-bottom: 20px; }
        .print-header h2 { margin: 2px 0; font-size: 15px; text-transform: uppercase; }
        .print-header h3 { margin: 2px 0; font-size: 14px; font-weight: normal; }
        .print-title { text-align: center; font-weight: bold; font-size: 16px; text-transform: uppercase; margin: 20px 0 10px 0; }
        .print-subtitle { text-align: center; font-style: italic; font-size: 13px; margin-bottom: 20px; }
        .info-box { border: 1px solid #000; padding: 10px 14px; margin-bottom: 20px; background: #fafafa; }
        .info-box table { border: none !important; margin: 0 !important; }
        .info-box td { border: none !important; padding: 3px 8px !important; }
        table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
        table, th, td { border: 1px solid #000; }
        th { background: #f2f2f2; text-align: center; padding: 6px; font-weight: bold; }
        td { padding: 5px 8px; text-align: left; }
        td.text-right, th.text-right { text-align: right; }
        td.text-center, th.text-center { text-align: center; }
        .total-row td { font-weight: bold; background: #f9f9f9; }
        .section-heading { font-weight: bold; font-size: 14px; margin-top: 20px; margin-bottom: 6px; text-transform: uppercase; color: #111; }
        .sign-row { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; page-break-inside: avoid; }
        .sign-col { width: 45%; }
        .no-print { text-align: center; margin-top: 30px; }
        .no-print button { padding: 8px 20px; font-size: 14px; font-weight: bold; background: #00d4ff; color: #000; border: none; border-radius: 4px; cursor: pointer; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      ${bodyHTML}
      <div class="no-print">
        <button onclick="window.print()">🖨️ In / Xuất PDF Báo Cáo</button>
      </div>
    </body>
    </html>
  `);
  win.document.close();
}

function exportFullProjectReport() {
  const project = getCurrentProject();
  if (!project) return;
  const today = new Date();
  const allPkgs = project.categories.flatMap(c => c.packages);
  const totalInvest = project.totalInvestment || 0;
  const totalDisbursed = allPkgs.reduce((s, p) => s + (p.cumulativeDisbursed || 0), 0);
  const totalEstimate = allPkgs.reduce((s, p) => s + (p.estimateValue || 0), 0);
  const totalBid = allPkgs.reduce((s, p) => s + (p.bidValue || 0), 0);
  const totalAcceptance = allPkgs.reduce((s, p) => s + (p.acceptanceValue || 0), 0);
  const rate = totalInvest > 0 ? (totalDisbursed / totalInvest * 100) : 0;

  openPrintWindow(`Báo cáo tổng hợp dự án - ${esc(project.name)}`, `
    <div class="print-header">
      <h2>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
      <h3>Độc lập - Tự do - Hạnh phúc</h3>
      <hr style="width: 30%; margin: 8px auto; border: 0.5px solid #000;">
    </div>
    <div class="print-title">BÁO CÁO TỔNG HỢP TIẾN ĐỘ VÀ GIẢI NGÂN VỐN ĐẦU TƯ DỰ ÁN</div>
    <div class="print-subtitle">Dự án: ${esc(project.fullName || project.name)}</div>

    <div class="info-box">
      <table>
        <tr><td style="width:20%;font-weight:bold">Tên dự án:</td><td>${esc(project.fullName || project.name)}</td><td style="width:18%;font-weight:bold">Chủ đầu tư:</td><td>${esc(project.owner || '—')}</td></tr>
        <tr><td style="font-weight:bold">Địa điểm:</td><td>${esc(project.location || '—')}</td><td style="font-weight:bold">Cấp công trình:</td><td>Cấp ${project.buildingGrade || '—'}</td></tr>
        <tr><td style="font-weight:bold">Loại dự án:</td><td>${esc(project.projectType || '—')}</td><td style="font-weight:bold">Mã định danh:</td><td>${esc(project.identifierCode || '—')}</td></tr>
        <tr><td style="font-weight:bold">Tổng mức đầu tư:</td><td><strong>${formatCurrency(totalInvest)}</strong></td><td style="font-weight:bold">Giải ngân lũy kế:</td><td><strong>${formatCurrency(totalDisbursed)} (${rate.toFixed(1)}%)</strong></td></tr>
      </table>
    </div>

    <div class="section-heading">I. BẢNG SO SÁNH CHI PHÍ THEO DANH MỤC</div>
    <table>
      <thead>
        <tr>
          <th style="width:35px">TT</th>
          <th>Danh mục chi phí</th>
          <th class="text-right">Tổng mức đầu tư</th>
          <th class="text-right">Dự toán</th>
          <th class="text-right">Trúng thầu</th>
          <th class="text-right">Lũy kế giải ngân</th>
          <th class="text-right">Tỷ lệ GN</th>
        </tr>
      </thead>
      <tbody>
        ${getSortedCategories(project).map(cat => {
    const inv = getCatInvestTotal(cat);
    const est = getCatEstimateTotal(cat);
    const bid = getCatBidTotal(cat);
    const disb = getCatDisbursedTotal(cat);
    const r = inv > 0 ? (disb / inv * 100) : 0;
    return `
          <tr>
            <td class="text-center">${esc(cat.code)}</td>
            <td>${esc(cat.name)}</td>
            <td class="text-right">${formatCurrency(inv)}</td>
            <td class="text-right">${formatCurrency(est)}</td>
            <td class="text-right">${formatCurrency(bid)}</td>
            <td class="text-right">${formatCurrency(disb)}</td>
            <td class="text-right">${r.toFixed(1)}%</td>
          </tr>`;
  }).join('')}
        <tr class="total-row">
          <td colspan="2" class="text-center">TỔNG CỘNG</td>
          <td class="text-right">${formatCurrency(totalInvest)}</td>
          <td class="text-right">${formatCurrency(totalEstimate)}</td>
          <td class="text-right">${formatCurrency(totalBid)}</td>
          <td class="text-right">${formatCurrency(totalDisbursed)}</td>
          <td class="text-right">${rate.toFixed(1)}%</td>
        </tr>
      </tbody>
    </table>

    <div class="section-heading">II. DANH SÁCH CÁC GÓI THẦU & TIẾN ĐỘ THỰC HIỆN</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">TT</th>
          <th>Tên gói thầu</th>
          <th>Nhà thầu trúng thầu</th>
          <th>Loại HĐ</th>
          <th class="text-right">Giá trị trúng thầu</th>
          <th class="text-right">Lũy kế giải ngân</th>
          <th class="text-center">Tiến độ</th>
        </tr>
      </thead>
      <tbody>
        ${allPkgs.map((p, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${esc(p.name)}</td>
          <td>${esc(p.contractor || '—')}</td>
          <td class="text-center">${esc(p.contractType || '—')}</td>
          <td class="text-right">${formatCurrency(p.bidValue)}</td>
          <td class="text-right">${formatCurrency(p.cumulativeDisbursed)}</td>
          ${p.pkgType !== 'consulting' && p.pkgType !== 'nonConsulting' ? `<td class="text-center">${p.progress || 0}%</td>` : '<td class="text-center">—</td>'}
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="sign-row">
      <div class="sign-col">
        <p><strong>NGƯỜI LẬP BÁO CÁO</strong></p>
        <p style="margin-top:60px">(Ký, ghi rõ họ tên)</p>
      </div>
      <div class="sign-col">
        <p>${esc(project.location || '.....')}, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}</p>
        <p><strong>ĐẠI DIỆN CHỦ ĐẦU TƯ</strong></p>
        <p style="margin-top:60px">(Ký, ghi rõ họ tên, đóng dấu)</p>
      </div>
    </div>
  `);
}

function exportPackagesReport() {
  const project = getCurrentProject();
  if (!project) return;
  const today = new Date();
  const allPkgs = project.categories.flatMap(c => c.packages);

  openPrintWindow(`Báo cáo chi tiết gói thầu - ${esc(project.name)}`, `
    <div class="print-header">
      <h2>${esc(project.owner || 'CHỦ ĐẦU TƯ')}</h2>
      <h3>DỰ ÁN: ${esc(project.fullName || project.name)}</h3>
      <hr style="width: 30%; margin: 8px auto; border: 0.5px solid #000;">
    </div>
    <div class="print-title">BÁO CÁO CHI TIẾT DANH MỤC VÀ TIẾN ĐỘ THỰC HIỆN GÓI THẦU</div>

    <table>
      <thead>
        <tr>
          <th style="width:30px">TT</th>
          <th>Tên gói thầu</th>
          <th class="text-right">Giá trị TMĐT</th>
          <th class="text-right">Dự toán</th>
          <th>Số HĐ / QĐ</th>
          <th>Nhà thầu</th>
          <th class="text-right">Giá trị trúng thầu</th>
          <th class="text-center">Tiến độ</th>
        </tr>
      </thead>
      <tbody>
        ${project.categories.map(cat => `
          <tr style="background:#eef2ff;font-weight:bold">
            <td class="text-center">${esc(cat.code)}</td>
            <td colspan="7">${esc(cat.name)}</td>
          </tr>
          ${cat.packages.map((p, idx) => `
          <tr>
            <td class="text-center">${esc(cat.code)}.${idx + 1}</td>
            <td>${esc(p.name)}</td>
            <td class="text-right">${formatCurrency(p.investValue)}</td>
            <td class="text-right">${formatCurrency(p.estimateValue)}</td>
            <td>${esc(p.contract || p.bidDecision || '—')}</td>
            <td>${esc(p.contractor || '—')}</td>
            <td class="text-right">${formatCurrency(p.bidValue)}</td>
            ${p.pkgType !== 'consulting' && p.pkgType !== 'nonConsulting' ? `<td class="text-center">${p.progress || 0}%</td>` : '<td class="text-center">—</td>'}
          </tr>`).join('')}
        `).join('')}
      </tbody>
    </table>

    <div class="sign-row">
      <div class="sign-col"></div>
      <div class="sign-col">
        <p>Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}</p>
        <p><strong>CÁN BỘ QUẢN LÝ DỰ ÁN</strong></p>
        <p style="margin-top:60px">(Ký, ghi rõ họ tên)</p>
      </div>
    </div>
  `);
}

function exportSettlementWarrantyReport() {
  const project = getCurrentProject();
  if (!project) return;
  const today = new Date();
  const allPkgs = project.categories.flatMap(c => c.packages);

  openPrintWindow(`Báo cáo Quyết toán & Bảo hành - ${esc(project.name)}`, `
    <div class="print-header">
      <h2>${esc(project.owner || 'CHỦ ĐẦU TƯ')}</h2>
      <h3>DỰ ÁN: ${esc(project.fullName || project.name)}</h3>
    </div>
    <div class="print-title">BÁO CÁO THỐNG KÊ QUYẾT TOÁN HỢP ĐỒNG (A-B) VÀ BẢO HÀNH CÔNG TRÌNH</div>

    <div class="section-heading">I. QUYẾT TOÁN HỢP ĐỒNG A-B</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">TT</th>
          <th>Tên gói thầu</th>
          <th>Đơn vị thi công</th>
          <th class="text-right">Giá trị quyết toán</th>
          <th class="text-right">Khối lượng phát sinh</th>
          <th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        ${allPkgs.map((p, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${esc(p.name)}</td>
          <td>${esc(p.contractor || '—')}</td>
          <td class="text-right">${formatCurrency(p.settlementValue)}</td>
          <td class="text-right">${formatCurrency(p.arisingValue)}</td>
          <td class="text-center">${p.settlementStatus || 'Chưa quyết toán'}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="section-heading">II. THEO DÕI THỜI HẠN BẢO HÀNH</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">TT</th>
          <th>Tên gói thầu</th>
          <th class="text-center">Ngày bàn giao</th>
          <th class="text-center">Thời hạn bảo hành</th>
          <th class="text-center">Ngày hết hạn</th>
          <th class="text-center">Trạng thái bảo hành</th>
        </tr>
      </thead>
      <tbody>
        ${allPkgs.filter(p => p.handoverDate && p.pkgType !== 'consulting' && p.pkgType !== 'nonConsulting').map((p, i) => {
    const months = p.warrantyMonths || computeWarrantyMonths(project.buildingGrade);
    const end = addMonths(p.handoverDate, months);
    const d = daysUntil(end);
    const st = d < 0 ? 'Hết hạn' : (d <= 60 ? `Sắp hết hạn (còn ${d} ngày)` : `Còn hiệu lực (${d} ngày)`);
    return `
          <tr>
            <td class="text-center">${i + 1}</td>
            <td>${esc(p.name)}</td>
            <td class="text-center">${formatDateVN(p.handoverDate)}</td>
            <td class="text-center">${months} tháng</td>
            <td class="text-center">${formatDateVN(end)}</td>
            <td class="text-center">${st}</td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>

    <div class="sign-row">
      <div class="sign-col"></div>
      <div class="sign-col">
        <p>Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}</p>
        <p><strong>ĐẠI DIỆN CHỦ ĐẦU TƯ</strong></p>
        <p style="margin-top:60px">(Ký, ghi rõ họ tên)</p>
      </div>
    </div>
  `);
}

// ---- Xuất Excel (dự án hiện tại hoặc toàn bộ dữ liệu) ----
async function exportExcel(scope) {
  try {
    let url = `${API_BASE}/export/excel`;
    let filename = 'QLDA_Export.xlsx';
    if (scope === 'current') {
      const project = getCurrentProject();
      if (!project) { showToast('Chưa có dự án nào để xuất', 'error'); return; }
      url += `?projectId=${encodeURIComponent(project.id)}`;
      filename = `QLDA_${project.name}.xlsx`;
    }
    const res = handleAuthResponse(await fetch(url));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Xuất Excel thất bại (HTTP ' + res.status + ')');
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch (err) {
    showToast('Lỗi khi xuất Excel: ' + err.message, 'error');
  }
}

// ============================================================
// SECTION 6.5: MODULE 1 - CHỦ TRƯƠNG (Quyết định & Công văn)
// ============================================================
// Chủ trương là nơi lưu trữ các quyết định / công văn của Sở Tài chính,
// Sở Xây dựng, UBND... liên quan đến dự án. Không có quy trình phê duyệt
// bên trong phần mềm — chỉ upload + xem + quản lý hồ sơ.
// Dữ liệu lưu trong project.initiations: [{ id, title, agency, number, date, note, files:[{id,name,size}] }]
let CHU_TRUONG_AGENCIES = ['Ủy ban nhân dân thành phố', 'Sở Tài chính', 'Sở Xây dựng', 'Cơ quan khác'];

let chuTruongEditId = null;
let chuTruongFiles = []; // PDF đang chờ lưu của hồ sơ đang mở

// ---- Render KPI ----
function renderInitiationKPIs() {
  const project = getCurrentProject();
  const ini = project?.initiations || [];
  const totalFiles = ini.reduce((s, i) => s + (i.files?.length || 0), 0);
  const countAgency = (a) => ini.filter(i => i.agency === a).length;
  const el = document.getElementById('initiation-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="kpi-card glass-card" data-color="cyan">
      <div class="kpi-header"><span class="kpi-label">Tổng văn bản chủ trương</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">description</span></div></div>
      <div class="kpi-value">${ini.length}</div>
      <div class="kpi-sub">Quyết định & công văn</div>
    </div>
    <div class="kpi-card glass-card" data-color="green">
      <div class="kpi-header"><span class="kpi-label">Sở Tài chính</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">account_balance</span></div></div>
      <div class="kpi-value">${countAgency('Sở Tài chính')}</div>
      <div class="kpi-sub">Văn bản của cơ quan</div>
    </div>
    <div class="kpi-card glass-card" data-color="purple">
      <div class="kpi-header"><span class="kpi-label">Sở Xây dựng</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">location_city</span></div></div>
      <div class="kpi-value">${countAgency('Sở Xây dựng')}</div>
      <div class="kpi-sub">Văn bản của cơ quan</div>
    </div>
    <div class="kpi-card glass-card" data-color="amber">
      <div class="kpi-header"><span class="kpi-label">UBND thành phố</span>
        <div class="kpi-icon"><span class="material-symbols-rounded">account_balance_wallet</span></div></div>
      <div class="kpi-value">${countAgency('Ủy ban nhân dân thành phố')}</div>
      <div class="kpi-sub">Văn bản của cơ quan</div>
    </div>
  `;
}

// ---- Render danh sách ----
function renderInitiationChuTruongList() {
  const project = getCurrentProject();
  const container = document.getElementById('initiations-container');
  if (!project) { if (container) container.innerHTML = ''; return; }
  const list = project.initiations || [];
  if (list.length === 0) {
    container.innerHTML = `<div class="ini-empty glass-card">
      <span class="material-symbols-rounded">folder_open</span>
      <p>Chưa có văn bản chủ trương nào. Bấm "Thêm văn bản chủ trương" để upload quyết định / công văn.</p>
    </div>`;
    return;
  }
  container.innerHTML = `<div class="ini-list">` + list.map(ini => {
    const files = ini.files || [];
    return `
    <div class="ini-card glass-card">
      <div class="ini-card-head">
        <div style="min-width:0">
          <div class="ini-card-title">
            <span class="material-symbols-rounded" style="color:var(--accent-cyan)">description</span>
            <span>${esc(ini.title || ini.name || 'Chưa có tên')}</span>
          </div>
          <div class="ini-card-sub">
            <span class="tpl-chip">${esc(ini.agency || '—')}</span>
            ${ini.number ? `<span>Số: <strong>${esc(ini.number)}</strong></span>` : ''}
          </div>
        </div>
      </div>

      <div class="ini-meta">
        <div class="ini-meta-item"><span class="label">Cơ quan ban hành</span><span class="value">${esc(ini.agency || '—')}</span></div>
        <div class="ini-meta-item"><span class="label">Số văn bản</span><span class="value">${esc(ini.number || '—')}</span></div>
        <div class="ini-meta-item"><span class="label">Ngày ban hành</span><span class="value">${formatDateVN(ini.date)}</span></div>
        <div class="ini-meta-item"><span class="label">File đính kèm</span><span class="value">${files.length} file</span></div>
      </div>

      ${ini.note ? `<div class="ini-note">${esc(ini.note)}</div>` : ''}

      ${files.length ? `<div class="ini-files">${files.map(f => `
        <div class="pdf-item">
          <span class="material-symbols-rounded">attach_file</span>
          <span class="pdf-name" onclick="viewPDF('${f.id}')" title="Nhấn để xem">${esc(f.name)}</span>
          <span class="pdf-size">${formatFileSize(f.size)}</span>
        </div>`).join('')}</div>` : ''}

      <div class="ini-actions edit-only">
        <button class="btn btn-secondary btn-sm" onclick="openChuTruongDetail('${ini.id}')">
          <span class="material-symbols-rounded">visibility</span> Xem
        </button>
        <button class="btn btn-secondary btn-sm" onclick="editChuTruong('${ini.id}')">
          <span class="material-symbols-rounded">edit</span> Sửa
        </button>
        <button class="btn-icon btn-sm" title="Xóa" onclick="deleteChuTruong('${ini.id}')">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    </div>
  `;
  }).join('') + `</div>`;
}

function renderInitiationView() {
  renderInitiationKPIs();
  renderInitiationChuTruongList();
}

// ---- Form thêm / sửa ----
function renderChuTruongPDFList() {
  const container = document.getElementById('ct-pdf-list');
  if (!container) return;
  if (!chuTruongFiles.length) {
    container.innerHTML = '<p class="pdf-empty">Chưa có file đính kèm</p>';
    return;
  }
  container.innerHTML = chuTruongFiles.map(f => `
    <div class="pdf-item">
      <span class="material-symbols-rounded">attach_file</span>
      <span class="pdf-name" onclick="viewPDF('${f.id}')" title="Nhấn để xem">${esc(f.name)}</span>
      <span class="pdf-size">${formatFileSize(f.size)}</span>
      <button type="button" class="btn-icon btn-sm" title="Xóa file" onclick="removeChuTruPDF('${f.id}')">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `).join('');
}

function openChuTruongForm(doc = null) {
  if (!requireEditPermission()) return;
  chuTruongEditId = doc ? doc.id : null;
  chuTruongFiles = doc ? [...(doc.files || [])] : [];
  openModal(doc ? 'Sửa văn bản chủ trương' : 'Thêm văn bản chủ trương', `
    <div class="form-grid">
      <div class="form-group full-width"><label>Tiêu đề văn bản *</label><input type="text" id="ct-title" value="${esc(doc?.title || '')}"></div>
      <div class="form-group"><label>Cơ quan ban hành *</label>
        <select id="ct-agency">${CHU_TRUONG_AGENCIES.map(a => `<option value="${a}" ${doc?.agency === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Số văn bản</label><input type="text" id="ct-number" value="${esc(doc?.number || '')}" placeholder="VD: 152/SXD-GXD"></div>
      <div class="form-group"><label>Ngày ban hành</label><input type="date" id="ct-date" value="${doc?.date || ''}"></div>
      <div class="form-group full-width"><label>Nội dung / Ghi chú</label><textarea id="ct-note">${esc(doc?.note || '')}</textarea></div>
    </div>
    <div class="form-section-title"><span class="material-symbols-rounded">attach_file</span> Tệp đính kèm</div>
    <div id="ct-pdf-list"></div>
    <div class="pdf-upload-area" style="margin-top:8px">
      <input type="file" id="ct-pdf-input" accept="${ALLOWED_UPLOAD_ACCEPT}" onchange="handleChuTruongPDFUpload()">
      <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('ct-pdf-input').click()">
        <span class="material-symbols-rounded">upload_file</span> Tải lên file
      </button>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveChuTruong()">
      <span class="material-symbols-rounded">save</span> Lưu
    </button>
  `);
  renderChuTruongPDFList();
  document.getElementById('ct-date').value = doc?.date || '';
}

function handleChuTruongPDFUpload() {
  if (!requireEditPermission()) return;
  const input = document.getElementById('ct-pdf-input');
  const file = input.files?.[0];
  if (!file) return;
  if (!isAllowedUpload(file)) {
    showToast('Định dạng file không được hỗ trợ', 'error');
    input.value = '';
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('File quá lớn (tối đa 50MB)', 'error');
    input.value = '';
    return;
  }
  (async () => {
    try {
      const meta = await apiUploadPDF(file);
      chuTruongFiles.push(meta);
      renderChuTruongPDFList();
      showToast('Đã tải lên: ' + meta.name);
    } catch (err) {
      showToast('Lỗi khi tải file: ' + err.message, 'error');
    }
    input.value = '';
  })();
}

async function removeChuTruPDF(pdfId) {
  if (!requireEditPermission()) return;
  try {
    await apiDeletePDF(pdfId);
    chuTruongFiles = chuTruongFiles.filter(f => f.id !== pdfId);
    renderChuTruongPDFList();
    if (chuTruongEditId) showToast('Đã xóa file (lưu để xác nhận)', 'info');
  } catch (err) {
    showToast('Lỗi xóa file: ' + err.message, 'error');
  }
}

function saveChuTruong() {
  const title = document.getElementById('ct-title').value.trim();
  const agency = document.getElementById('ct-agency').value;
  if (!title || !agency) { showToast('Vui lòng nhập tiêu đề và cơ quan ban hành', 'error'); return; }
  const project = getCurrentProject();
  if (!project.initiations) project.initiations = [];
  if (chuTruongEditId) {
    const ini = project.initiations.find(i => i.id === chuTruongEditId);
    if (ini) {
      ini.title = title;
      ini.agency = agency;
      ini.number = document.getElementById('ct-number').value.trim();
      ini.date = document.getElementById('ct-date').value;
      ini.note = document.getElementById('ct-note').value.trim();
      ini.files = [...chuTruongFiles];
    }
  } else {
    project.initiations.push({
      id: generateId(),
      title, agency,
      number: document.getElementById('ct-number').value.trim(),
      date: document.getElementById('ct-date').value,
      note: document.getElementById('ct-note').value.trim(),
      files: [...chuTruongFiles]
    });
  }
  addAudit(project, chuTruongEditId ? 'update' : 'create', 'chủ trương', title, `Cơ quan: ${agency}`);
  saveState(); closeModal(); renderInitiationView();
  showToast('Đã lưu văn bản chủ trương');
}

function editChuTruong(iniId) {
  const project = getCurrentProject();
  const ini = project.initiations?.find(i => i.id === iniId);
  if (!ini) return;
  openChuTruongForm(ini);
}

function deleteChuTruong(iniId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const ini = project.initiations?.find(i => i.id === iniId);
  if (!ini) return;
  openModal('Xác nhận xóa', `
    <div class="confirm-content">
      <span class="material-symbols-rounded">warning</span>
      <p>Xóa văn bản chủ trương:</p><p class="confirm-name">"${esc(ini.title || ini.name || '')}"?</p>
    </div>`, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-danger" onclick="confirmDeleteChuTruong('${iniId}')"><span class="material-symbols-rounded">delete</span> Xóa</button>
  `);
}
function confirmDeleteChuTruong(iniId) {
  const project = getCurrentProject();
  const ini = project.initiations?.find(i => i.id === iniId);
  (ini?.files || []).forEach(f => apiDeletePDF(f.id).catch(() => { }));
  project.initiations = (project.initiations || []).filter(i => i.id !== iniId);
  addAudit(project, 'delete', 'chủ trương', ini.title);
  saveState(); closeModal(); renderInitiationView(); showToast('Đã xóa văn bản', 'info');
}

// ---- Chi tiết ----
function openChuTruongDetail(iniId) {
  const project = getCurrentProject();
  const ini = project.initiations?.find(i => i.id === iniId);
  if (!ini) return;
  const files = ini.files || [];
  openModal('Chi tiết văn bản chủ trương', `
    <div class="detail-grid">
      <div class="detail-item full-width"><span class="detail-label">Tiêu đề</span><span class="detail-value">${esc(ini.title || ini.name || '')}</span></div>
      <div class="detail-item"><span class="detail-label">Cơ quan</span><span class="detail-value">${esc(ini.agency || '—')}</span></div>
      <div class="detail-item"><span class="detail-label">Số văn bản</span><span class="detail-value">${esc(ini.number || '—')}</span></div>
      <div class="detail-item"><span class="detail-label">Ngày ban hành</span><span class="detail-value">${formatDateVN(ini.date)}</span></div>
      <div class="detail-item full-width"><span class="detail-label">Nội dung / Ghi chú</span><span class="detail-value">${esc(ini.note || '—')}</span></div>
    </div>
    <div class="form-section-title"><span class="material-symbols-rounded">attach_file</span> Văn bản đính kèm</div>
    ${files.length ? `<div class="ini-files">${files.map(f => `
      <div class="pdf-item">
        <span class="material-symbols-rounded">attach_file</span>
        <span class="pdf-name" onclick="viewPDF('${f.id}')" title="Nhấn để xem">${esc(f.name)}</span>
        <span class="pdf-size">${formatFileSize(f.size)}</span>
      </div>`).join('')}</div>` : '<p class="pdf-empty">Không có file đính kèm</p>'}
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
  `);
}

document.getElementById('btn-add-initiation')?.addEventListener('click', () => openChuTruongForm());

// ============================================================
// SECTION 6.7: MODULE 4 - QUYẾT TOÁN VỐN ĐẦU TƯ
// ============================================================
let QTNĐ_TITLES = ['Mẫu số 01/QTNĐ', 'Mẫu số 02/QTNĐ', 'Mẫu số 03/QTNĐ', 'Mẫu số 04/QTNĐ', 'Mẫu số 05/QTNĐ'];
let QTDA_TITLES = ['Mẫu số 01/QTDA', 'Mẫu số 02/QTDA', 'Mẫu số 03/QTDA', 'Mẫu số 04/QTDA', 'Mẫu số 05/QTDA', 'Mẫu số 06/QTDA', 'Mẫu số 07/QTDA', 'Mẫu số 08/QTDA', 'Mẫu số 09/QTDA', 'Mẫu số 10/QTDA', 'Mẫu số 11/QTDA', 'Mẫu số 12/QTDA'];

// Lấy bộ mẫu biểu quyết toán phù hợp cho dự án (theo loại quyết toán + ngày nộp hồ sơ)
function getSettlementTemplates(project) {
  const settleType = project?.settlementType || 'completion';
  const submissionDate = project?.settlementSubmissionDate || '1970-01-01';
  const versions = (state.config?.templates?.settlement?.[settleType]?.versions) || [];
  let selected = versions[0] || null;
  for (const v of versions) {
    if (v.effectiveFrom <= submissionDate) selected = v;
  }
  return selected || { label: 'Chưa xác định', qtnd: QTNĐ_TITLES, qtda: QTDA_TITLES };
}

// Tra cứu văn bản pháp lý áp dụng cho dự án
function getApplicableLegalDocs(project) {
  const docs = state.config?.legalDocuments || [];
  const projectDates = [
    project?.settlementSubmissionDate,
    project?.completionDate,
    project?.startDate,
    new Date().toISOString().slice(0, 10)
  ].filter(Boolean);
  const referenceDate = projectDates[0];
  return docs.filter(d => !d.effectiveDate || d.effectiveDate <= referenceDate);
}

function getSettlementStats(project) {
  const allPkgs = (project?.categories || []).flatMap(c => c.packages || []);
  const totalInvest = Number(project?.totalInvestment) || 0;
  const totalDisbursed = allPkgs.reduce((s, p) => s + (p.cumulativeDisbursed || 0), 0);
  const totalPropose = allPkgs.reduce((s, p) => s + (p.settlementValue || 0), 0);
  const totalBid = allPkgs.reduce((s, p) => s + (p.bidValue || 0), 0);
  const done = allPkgs.filter(p => p.settlementStatus === 'Đã quyết toán');
  return { allPkgs, totalInvest, totalDisbursed, totalPropose, totalBid, doneCount: done.length, settledCount: allPkgs.length };
}

function renderSettlementView() {
  const project = getCurrentProject();
  if (!project) return;
  const st = getSettlementStats(project);
  const settlement = project.settlement || {};
  const tmpl = getSettlementTemplates(project);
  const rate = st.totalInvest > 0 ? (st.totalDisbursed / st.totalInvest * 100) : 0;

  document.getElementById('settlement-kpis').innerHTML = `
    <div class="kpi-card"><div class="kpi-icon cyan"><span class="material-symbols-rounded">account_balance</span></div><div><div class="kpi-label">Tổng mức đầu tư</div><div class="kpi-value">${formatCurrency(st.totalInvest)}</div></div></div>
    <div class="kpi-card"><div class="kpi-icon green"><span class="material-symbols-rounded">verified</span></div><div><div class="kpi-label">Gói đã quyết toán</div><div class="kpi-value">${st.doneCount}/${st.settledCount}</div></div></div>
    <div class="kpi-card"><div class="kpi-icon amber"><span class="material-symbols-rounded">receipt_long</span></div><div><div class="kpi-label">Đề nghị quyết toán A-B</div><div class="kpi-value">${formatCurrency(st.totalPropose)}</div></div></div>
    <div class="kpi-card"><div class="kpi-icon amber"><span class="material-symbols-rounded">trending_up</span></div><div><div class="kpi-label">Đã giải ngân (${formatPercent(rate)})</div><div class="kpi-value">${formatCurrency(st.totalDisbursed)}</div></div></div>
    <div class="kpi-card full" style="flex-basis:100%;background:#f0f9ff;border:1px solid #bae6fd;padding:8px 16px;font-size:0.8rem;color:var(--text-secondary)">
      <span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;margin-right:4px">description</span>
      Loại quyết toán: <strong>${project.settlementType === 'annual' ? 'Niên độ ngân sách' : 'Dự án hoàn thành'}</strong> &mdash; Mẫu biểu áp dụng: <strong style="color:var(--accent-blue)">${esc(tmpl.label)}</strong>
      ${project.settlementSubmissionDate ? ` (hồ sơ nộp ngày ${formatDateVN(project.settlementSubmissionDate)})` : ' (chưa có ngày nộp hồ sơ)'}
    </div>`;

  renderSettlementAnnual();
  renderSettlementCloseout();
}

function renderSettlementAnnual() {
  const project = getCurrentProject();

  // Dự án nhỏ lẻ: không cần quyết toán theo niên độ nhiều năm
  if (project.smallProject) {
    document.getElementById('settlement-annual').innerHTML = `
      <div class="card pay-card sett-section">
        <div class="sett-section-head">
          <h3><span class="material-symbols-rounded" style="color:var(--accent-amber)">check_circle</span> Dự án nhỏ lẻ — quyết toán trọn gói</h3>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;line-height:1.6">
          Dự án này được đánh dấu là <strong>nhỏ lẻ / giá trị thấp</strong>: không phải quyết toán theo niên độ hàng năm mà quyết toán trọn gói một lần khi hoàn thành toàn bộ gói thầu. Bạn chỉ cần cập nhật trạng thái quyết toán và giá trị trong mục "Quyết toán dự án hoàn thành" ở phần Sửa thông tin dự án.
        </p>
      </div>`;
    return;
  }

  const annual = project.settlementAnnual || [];
  const el = document.getElementById('settlement-annual');
  const rows = annual.length ? annual.map(a => {
    const diff = (Number(a.cdt) || 0) - (Number(a.kbnn) || 0);
    const cls = diff === 0 ? '' : (diff < 0 ? 'neg' : 'pos');
    return `
      <tr>
        <td><strong>Năm ${a.year}</strong></td>
        <td class="text-right">${formatCurrency(a.allocated, true)}</td>
        <td class="text-right">${formatCurrency(a.cdt, true)}</td>
        <td class="text-right">${formatCurrency(a.kbnn, true)}</td>
        <td class="text-right"><span class="sett-diff ${cls}">${formatCurrency(diff, true)}</span></td>
        <td>${esc(a.note || '—')}</td>
        <td><div class="pay-actions">
          <button class="btn-icon edit-only" title="Sửa" onclick="editAnnualSettlement('${a.id}')"><span class="material-symbols-rounded">edit</span></button>
          <button class="btn-icon edit-only" title="Xóa" onclick="deleteAnnualSettlement('${a.id}')"><span class="material-symbols-rounded">delete</span></button>
        </div></td>
      </tr>`;
  }).join('') : '<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:14px">Chưa có số liệu quyết toán niên độ. Bấm "Cập nhật quyết toán niên độ" để thêm.</td></tr>';

  el.innerHTML = `
    <div class="card pay-card sett-section">
      <div class="sett-section-head">
        <h3><span class="material-symbols-rounded" style="color:var(--accent-cyan)">calendar_month</span> Quyết toán niên độ ngân sách hàng năm</h3>
      </div>
      <p style="font-size:0.8rem;color:var(--text-muted);margin:4px 0 10px">Đối chiếu số liệu hàng năm giữa Chủ đầu tư (CĐT) và Kho bạc Nhà nước nơi giao dịch (KBNN). Chênh lệch tự động = CĐT − KBNN.</p>
      <div class="sett-table-wrapper" style="overflow-x:auto">
        <table class="sett-table">
          <thead><tr><th>Niên độ</th><th class="text-right">Dự toán giao</th><th class="text-right">CĐT quyết toán</th><th class="text-right">KBNN đối chiếu</th><th class="text-right">Chênh lệch</th><th>Ghi chú</th><th style="text-align:right">Thao tác</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderSettlementCloseout() {
  const project = getCurrentProject();
  const st = getSettlementStats(project);
  const pkgs = st.allPkgs.filter(p => isPackageComplete(p) || p.settlementStatus === 'Đã quyết toán' || (p.settlementValue || 0) > 0);
  const el = document.getElementById('settlement-closeout');
  const cls = project.settlement || {};
  const rowPropose = pkgs.reduce((s, p) => s + (Number(p.settlementValue) || 0), 0);
  const rowBid = pkgs.reduce((s, p) => s + (Number(p.bidValue) || 0), 0);
  const allDiff = rowPropose - rowBid;

  const rows = pkgs.length ? pkgs.map(p => {
    const diff = (Number(p.settlementValue) || 0) - (Number(p.bidValue) || 0);
    const dCls = diff === 0 ? '' : (diff < 0 ? 'neg' : 'pos');
    return `
      <tr>
        <td>${esc(p.name)}</td>
        <td class="text-right">${formatCurrency(p.bidValue, true)}</td>
        <td class="text-right">${formatCurrency(p.acceptanceValue, true)}</td>
        <td class="text-right">${formatCurrency(p.settlementValue, true)}</td>
        <td class="text-right">${formatCurrency(p.arisingValue, true)}</td>
        <td class="text-right"><span class="sett-diff ${dCls}">${formatCurrency(diff, true)}</span></td>
        <td><span class="badge ${p.settlementStatus === 'Đã quyết toán' ? 'badge-success' : (p.settlementStatus === 'Đang thẩm tra' ? 'badge-warning' : 'badge-info')}">${p.settlementStatus || 'Chưa quyết toán'}</span></td>
        <td>${formatDateVN(p.settlementDate)}</td>
      </tr>`;
  }).join('') : '<tr><td colspan="8" style="color:var(--text-muted);text-align:center;padding:14px">Chưa có gói thầu hoàn thành nào để tập hợp quyết toán A-B.</td></tr>';

  el.innerHTML = `
    <div class="card pay-card sett-section">
      <div class="sett-section-head">
        <h3><span class="material-symbols-rounded" style="color:var(--accent-green)">functions</span> Quyết toán dự án hoàn thành</h3>
      </div>
      <p style="font-size:0.8rem;color:var(--text-muted);margin:4px 0 10px">Chênh lệch = Giá trị quyết toán A-B − Giá trị trúng thầu.</p>
      <div class="settled-wrapper" style="overflow-x:auto">
        <table class="sett-table">
          <thead><tr><th>Gói thầu</th><th class="text-right">GT trúng thầu</th><th class="text-right">Nghiệm thu</th><th class="text-right">QT đề nghị (A-B)</th><th class="text-right">Phát sinh</th><th class="text-right">Chênh lệch</th><th>Trạng thái</th><th>Ngày QT</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;padding:12px;background:#f8fafc;border:1px solid var(--border-glass);border-radius:8px">
        <strong>Quyết toán toàn dự án:</strong> tổng đề nghị A-B <span class="money">${formatCurrency(rowPropose)}</span> − tổng trúng thầu (các gói đã quyết toán) <span class="money">${formatCurrency(rowBid)}</span> =
        <span class="sett-diff ${allDiff < 0 ? 'neg' : 'pos'}">${formatCurrency(allDiff)}</span>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.2);border-radius:8px">
        <span class="material-symbols-rounded" style="color:var(--accent-green)">verified</span>
        <div style="flex:1">
          <strong>Trạng thái toàn dự án:</strong> <span class="badge ${clsStatusBadge(cls.status)}">${cls.status || 'Chưa quyết toán'}</span>
          ${cls.totalValue ? ` · Giá trị quyết toán: <span class="money">${formatCurrency(cls.totalValue)}</span>` : ''}
          ${cls.approvedDate ? ` · Ngày phê duyệt: ${formatDateVN(cls.approvedDate)}` : ''}
        </div>
        <button class="btn btn-secondary edit-only" onclick="openCloseoutStatus()"><span class="material-symbols-rounded">edit</span> Cập nhật</button>
      </div>
    </div>`;
}

function clsStatusBadge(st) {
  if (st === 'Đã quyết toán') return 'badge-success';
  if (st === 'Đang thẩm tra') return 'badge-warning';
  return 'badge-info';
}

// ---- Annual settlement (quyết toán niên độ) CRUD ----
function openAnnualSettlementForm(row) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  if (!project) return;
  const existingYears = (project.settlementAnnual || []).map(a => a.year).join(', ');
  openModal(row ? 'Sửa quyết toán niên độ' : 'Cập nhật quyết toán niên độ', `
    <div class="form-grid">
      <div class="form-group"><label>Năm niên độ *</label><input type="number" id="an-year" min="2000" max="2100" value="${row?.year || new Date().getFullYear()}"></div>
      <div class="form-group"><label>Dự toán được giao (VNĐ)</label><input type="number" id="an-allocated" value="${row?.allocated || ''}"></div>
      <div class="form-group"><label>CĐT quyết toán (VNĐ)</label><input type="number" id="an-cdt" value="${row?.cdt || ''}"></div>
      <div class="form-group"><label>KBNN đối chiếu (VNĐ)</label><input type="number" id="an-kbnn" value="${row?.kbnn || ''}"></div>
      <div class="form-group full-width"><label>Ghi chú</label><textarea id="an-note">${esc(row?.note || '')}</textarea></div>
      ${existingYears ? `<p style="grid-column:1/-1;font-size:0.78rem;color:var(--text-muted)">Niên độ hiện có: ${existingYears}</p>` : ''}
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveAnnualSettlement('${row ? row.id : ''}')"><span class="material-symbols-rounded">save</span> Lưu</button>
  `);
}

document.getElementById('btn-add-annual')?.addEventListener('click', () => { openAnnualSettlementForm(null); });

function saveAnnualSettlement(id) {
  const project = getCurrentProject();
  if (!project) return;
  const year = Number(document.getElementById('an-year').value);
  if (!year) { showToast('Vui lòng nhập năm niên độ', 'error'); return; }
  if (!project.settlementAnnual) project.settlementAnnual = [];
  const data = {
    year,
    allocated: Number(document.getElementById('an-allocated').value) || 0,
    cdt: Number(document.getElementById('an-cdt').value) || 0,
    kbnn: Number(document.getElementById('an-kbnn').value) || 0,
    note: document.getElementById('an-note').value.trim()
  };
  if (id) {
    const i = project.settlementAnnual.findIndex(a => a.id === id);
    if (i > -1) Object.assign(project.settlementAnnual[i], data);
  } else {
    data.id = generateId();
    project.settlementAnnual.push(data);
  }
  addAudit(project, id ? 'update' : 'create', 'quyết toán', `Niên độ ${data.year}`, `CĐT: ${formatCurrency(data.cdt, true)}`);
  saveState(); closeModal(); renderSettlementAnnual();
  showToast(id ? 'Đã cập nhật niên độ ' + year : 'Đã thêm niên độ ' + year);
}

function editAnnualSettlement(id) {
  const project = getCurrentProject();
  const row = project?.settlementAnnual?.find(a => a.id === id);
  if (row) openAnnualSettlementForm(row);
}

function deleteAnnualSettlement(id) {
  const project = getCurrentProject();
  if (!confirm('Xóa niên độ này?')) return;
  const entry = project.settlementAnnual?.find(a => a.id === id);
  project.settlementAnnual = (project.settlementAnnual || []).filter(a => a.id !== id);
  addAudit(project, 'delete', 'quyết toán', `Niên độ ${entry?.year || ''}`);
  saveState(); renderSettlementAnnual();
  showToast('Đã xóa niên độ', 'info');
}

// ---- Closeout status of whole project ----
function openCloseoutStatus() {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  if (!project) return;
  const cls = project.settlement || {};
  openModal('Cập nhật quyết toán toàn dự án', `
    <div class="form-grid">
      <div class="form-group full-width"><label>Trạng thái quyết toán dự án</label>
        <select id="co-status">${SETTLEMENT_STATUSES.map(s => `<option value="${s}" ${(cls.status || SETTLEMENT_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Giá trị quyết toán (VNĐ)</label><input type="number" id="co-value" value="${cls.totalValue || ''}"></div>
      <div class="form-group"><label>Ngày phê duyệt quyết toán</label><input type="date" id="co-date" value="${cls.approvedDate || ''}"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveCloseoutStatus()"><span class="material-symbols-rounded">save</span> Lưu</button>
  `);
}

function saveCloseoutStatus() {
  const project = getCurrentProject();
  if (!project) return;
  project.settlement = project.settlement || {};
  project.settlement.status = document.getElementById('co-status').value;
  project.settlement.totalValue = Number(document.getElementById('co-value').value) || 0;
  project.settlement.approvedDate = document.getElementById('co-date').value;
  addAudit(project, 'update', 'project', 'Trạng thái quyết toán hoàn thành');
  saveState(); closeModal(); renderSettlementView();
  showToast('Đã cập nhật trạng thái quyết toán dự án');
}

// ============================================================
// SECTION 7: MODAL & CRUD
// ============================================================
function openModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
}

function togglePkgTypeFields() {
  const sel = document.getElementById('f-pkgType');
  if (!sel) return;
  const type = sel.value;
  document.querySelectorAll('.pkg-show').forEach(el => {
    const show = (el.dataset.show || '').split(' ').includes(type);
    el.style.display = show ? '' : 'none';
  });
}

let tempUploadedPDFs = [];
let tempPayments = [];

// ---- Package CRUD ----
function getPackageFormHTML(pkg = null, catId = '') {
  const methods = ['Đấu thầu rộng rãi qua mạng', 'Chào hàng cạnh tranh qua mạng', 'Chỉ định thầu rút gọn', 'Không áp dụng', 'Khác'];
  const pdfs = pkg ? (pkg.pdfs || []) : tempUploadedPDFs;
  const pdfListHTML = pdfs.length ? pdfs.map(pdf => `
    <div class="pdf-item">
      <span class="material-symbols-rounded">attach_file</span>
      <span class="pdf-name" onclick="viewPDF('${pdf.id}')" title="Nhấn để xem">${esc(pdf.name)}</span>
      <span class="pdf-size">${formatFileSize(pdf.size)}</span>
      ${pdf.category ? `<span class="badge badge-neutral" style="font-size:0.65rem">${esc(pdf.category)}</span>` : ''}
      <button type="button" class="btn-icon btn-sm" title="Xóa file" onclick="${pkg ? `removePDFFromForm('${catId}','${pkg.id}','${pdf.id}')` : `removeTempPDF('${pdf.id}')`}">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `).join('') : '<p class="pdf-empty">Chưa có file đính kèm</p>';
  return `
    <div class="form-grid">
      <div class="form-group full-width">
        <label>Tên gói thầu *</label>
        <input type="text" id="f-name" value="${esc(pkg?.name || '')}" required>
      </div>
      <div class="form-group">
        <label>Loại gói thầu</label>
        <select id="f-pkgType" onchange="togglePkgTypeFields()">
          <option value="construction" ${pkg?.pkgType === 'construction' ? 'selected' : ''}>Xây lắp</option>
          <option value="consulting" ${pkg?.pkgType === 'consulting' ? 'selected' : ''}>Tư vấn</option>
          <option value="goods" ${pkg?.pkgType === 'goods' ? 'selected' : ''}>Hàng hóa</option>
          <option value="mixed" ${pkg?.pkgType === 'mixed' ? 'selected' : ''}>Hỗn hợp</option>
          <option value="nonConsulting" ${pkg?.pkgType === 'nonConsulting' ? 'selected' : ''}>Phi tư vấn</option>
        </select>
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">payments</span> Thông tin tài chính</div>
      <div class="form-group">
        <label>Giá trị dự toán (VNĐ)</label>
        <input type="number" id="f-estimateValue" value="${pkg?.estimateValue || ''}">
      </div>
      <div class="form-group">
        <label>Giá trị trúng thầu (VNĐ)</label>
        <input type="number" id="f-bidValue" value="${pkg?.bidValue || ''}">
      </div>
      <div class="form-group">
        <label>Nguồn vốn</label>
        <input type="text" id="f-fundSource" value="${esc(pkg?.fundSource || '')}">
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">description</span> Thông tin hợp đồng</div>
      <div class="form-group">
        <label>QĐ trúng thầu</label>
        <input type="text" id="f-bidDecision" value="${esc(pkg?.bidDecision || '')}">
      </div>
      <div class="form-group">
        <label>Hợp đồng</label>
        <input type="text" id="f-contract" value="${esc(pkg?.contract || '')}">
      </div>
      <div class="form-group">
        <label>Loại hợp đồng</label>
        <select id="f-contractType">
          <option value="">— Chọn —</option>
          ${CONTRACT_TYPES.map(t => `<option value="${t}" ${pkg?.contractType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Ngày ký hợp đồng</label>
        <input type="date" id="f-contractSignDate" value="${pkg?.contractSignDate || ''}">
      </div>
      <div class="form-group">
        <label>Ngày bắt đầu thực hiện</label>
        <input type="date" id="f-contractStartDate" value="${pkg?.contractStartDate || ''}">
      </div>
      <div class="form-group">
        <label>Ngày hết hạn hợp đồng</label>
        <input type="date" id="f-contractEndDate" value="${pkg?.contractEndDate || ''}">
      </div>
      <div class="form-group">
        <label>Số PL gia hạn (nếu có)</label>
        <input type="text" id="f-contractExtension" value="${esc(pkg?.contractExtension || '')}" placeholder="VD: PL01/HĐ ngày ...">
      </div>
      <div class="form-group">
        <label>Hình thức lựa chọn nhà thầu</label>
        <select id="f-selectionMethod">
          <option value="">— Chọn —</option>
          ${methods.map(m => `<option value="${m}" ${pkg?.selectionMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Đơn vị trúng thầu</label>
        <input type="text" id="f-contractor" value="${esc(pkg?.contractor || '')}">
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">schedule</span> Tiến độ & Thời gian</div>
      <div data-show="construction" class="pkg-show">
        <div class="form-group">
          <label>Thời gian KC-HT</label>
          <input type="text" id="f-duration" value="${esc(pkg?.duration || '')}">
        </div>
      </div>
      <div data-show="consulting nonConsulting" data-hide="construction mixed goods" class="pkg-show">
        <div class="form-group">
          <label>Thời gian thực hiện</label>
          <input type="text" id="f-duration" value="${esc(pkg?.duration || '')}" placeholder="VD: 6 tháng">
        </div>
      </div>
      <div data-show="construction" class="pkg-show">
        <div class="form-group">
          <label>Tiến độ (%)</label>
          <input type="number" id="f-progress" min="0" max="100" value="${pkg?.progress ?? ''}">
        </div>
      </div>
      <div data-show="construction" class="pkg-show">
        <div class="form-section-title"><span class="material-symbols-rounded">flag</span> Tiến độ từng mốc (Milestones)</div>
        <div style="background:rgba(148,163,184,.06);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px">
          <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">Nhập mốc tiến độ chi tiết. Nếu bỏ trống, hệ thống sẽ dùng tiến độ chung bên trên.</p>
        ${['KhoiCong','Mong','Than','HoanThien','BanGiao'].map((key, idx) => {
          const names = {KhoiCong:'Khởi công',Mong:'Móng',Than:'Thân',HoanThien:'Hoàn thiện',BanGiao:'Bàn giao'};
          const defWeights = {KhoiCong:10,Mong:20,Than:30,HoanThien:25,BanGiao:15};
          const existing = (pkg?.milestones || []).find(m => m.id === key) || {};
          return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.8rem">
            <span style="flex:0 0 100px;font-weight:600;color:var(--text-secondary)">${names[key]}</span>
            <input type="date" id="f-ms-${key}-planned" value="${existing.plannedDate || ''}" style="flex:1;min-width:0" placeholder="Dự kiến" title="Dự kiến">
            <input type="date" id="f-ms-${key}-actual" value="${existing.actualDate || ''}" style="flex:1;min-width:0" placeholder="Thực tế" title="Thực tế">
            <input type="number" id="f-ms-${key}-weight" value="${existing.weight ?? defWeights[key]}" min="0" max="100" step="1" style="width:55px;text-align:right" title="Trọng số %">
            <span style="font-size:0.7rem;color:var(--text-muted)">%</span>
          </div>`;
        }).join('')}
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px" id="ms-weight-sum">Tổng trọng số: <span id="ms-weight-total">100</span>%</div>
      </div>
      <script>
        (function(){
          const ids = ['KhoiCong','Mong','Than','HoanThien','BanGiao'];
          function recalc(){
            let s=0;
            ids.forEach(k=>{
              const el=document.getElementById('f-ms-'+k+'-weight');
              s += el ? (Number(el.value)||0) : 0;
            });
            const totalEl=document.getElementById('ms-weight-total');
            if(totalEl){
              totalEl.textContent = s;
              totalEl.style.color = s===100 ? 'var(--accent-green)' : 'var(--accent-red)';
            }
          }
          ids.forEach(k=>{
            const el=document.getElementById('f-ms-'+k+'-weight');
            if(el) el.addEventListener('input', recalc);
          });
        })();
      </script>
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">assessment</span> Giá trị thực hiện</div>
      <div class="form-group">
        <label>Trong kỳ - Giá trị thực hiện (VNĐ)</label>
        <input type="number" id="f-periodValue" value="${pkg?.periodValue || ''}">
      </div>
      <div class="form-group">
        <label>Trong kỳ - Giải ngân (VNĐ)</label>
        <input type="number" id="f-periodDisbursed" value="${pkg?.periodDisbursed || ''}">
      </div>
      <div class="form-group">
        <label>Lũy kế giá trị thực hiện (VNĐ)</label>
        <input type="number" id="f-cumulativeValue" value="${pkg?.cumulativeValue || ''}">
      </div>
      <div class="form-group">
        <label>Lũy kế giải ngân (VNĐ)</label>
        <input type="number" id="f-cumulativeDisbursed" value="${pkg?.cumulativeDisbursed || ''}">
      </div>
      <div data-show="consulting nonConsulting" data-hide="construction mixed goods" class="pkg-show">
        <div class="form-section-title"><span class="material-symbols-rounded">verified_user</span> Nghiệm thu hồ sơ</div>
        <div class="form-group">
          <label>Ngày nghiệm thu</label>
          <input type="date" id="f-docAcceptDate" value="${pkg?.docAcceptDate || ''}">
        </div>
        <div class="form-group">
          <label>Trạng thái</label>
          <select id="f-docAcceptStatus">
            ${ACCEPTANCE_STATUSES.map(s => `<option value="${s}" ${(pkg?.docAcceptStatus || ACCEPTANCE_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-section-title"><span class="material-symbols-rounded">tenancy</span> Nghiệm thu khối lượng</div>
      <div class="form-group">
        <label>Giá trị KL công việc hoàn thành</label>
        <input type="number" id="f-acceptanceValue" value="${pkg?.acceptanceValue || ''}">
      </div>
      <div class="form-group">
        <label>Trạng thái</label>
        <select id="f-acceptanceStatus">
          ${ACCEPTANCE_STATUSES.map(s => `<option value="${s}" ${(pkg?.acceptanceStatus || ACCEPTANCE_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Ngày nghiệm thu hoàn thành</label>
        <input type="date" id="f-acceptanceDate" value="${pkg?.acceptanceDate || ''}">
      </div>

      <div data-show="construction mixed goods" class="pkg-show">
      <div class="form-group">
        <label>Thất thoát, lãng phí</label>
        <input type="number" id="f-loss" value="${pkg?.loss || ''}">
      </div>
      </div>

      <div class="form-section-title"><span class="material-symbols-rounded">receipt</span> Hóa đơn GTGT (NĐ 123/2020)</div>
      <div class="form-group">
        <label>Số hóa đơn GTGT</label>
        <input type="text" id="f-invoiceNumber" value="${esc(pkg?.invoiceNumber || '')}" placeholder="Ký hiệu & số HĐ">
      </div>
      <div class="form-group">
        <label>Ngày xuất hóa đơn</label>
        <input type="date" id="f-invoiceDate" value="${pkg?.invoiceDate || ''}">
      </div>
      <div class="form-group">
        <label>Giá trị HĐ GTGT (VNĐ)</label>
        <input type="number" id="f-invoiceValue" value="${pkg?.invoiceValue || ''}">
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end;gap:6px">
        <label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:0.85rem">
          <input type="checkbox" id="f-invoiceXml" ${pkg?.invoiceXml ? 'checked' : ''} style="width:auto"> HĐ điện tử XML (đồng bộ KBĐT)
        </label>
      </div>

      <div data-show="construction mixed goods" class="pkg-show">
        <div class="form-section-title"><span class="material-symbols-rounded">verified</span> Bàn giao & Bảo hành</div>
        <div class="form-group">
          <label>Ngày bàn giao</label>
          <input type="date" id="f-handoverDate" value="${pkg?.handoverDate || ''}">
        </div>
        <div class="form-group">
          <label>Thời hạn bảo hành (tháng)</label>
          <input type="number" id="f-warrantyMonths" min="1" value="${pkg?.warrantyMonths ?? ''}" placeholder="Tự động theo cấp công trình">
        </div>
      </div>
      <div data-show="consulting nonConsulting" data-hide="construction mixed goods" class="pkg-show">
        <div class="form-section-title"><span class="material-symbols-rounded">verified</span> Bàn giao sản phẩm tư vấn</div>
        <div class="form-group">
          <label>Ngày bàn giao sản phẩm</label>
          <input type="date" id="f-handoverDate" value="${pkg?.handoverDate || ''}">
        </div>
      </div>

      <div class="form-section-title"><span class="material-symbols-rounded">receipt_long</span> Quyết toán (A-B)</div>
      <div class="form-group">
        <label>Trạng thái quyết toán</label>
        <select id="f-settlementStatus">
          ${SETTLEMENT_STATUSES.map(s => `<option value="${s}" ${(pkg?.settlementStatus || SETTLEMENT_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Giá trị quyết toán (VNĐ)</label>
        <input type="number" id="f-settlementValue" value="${pkg?.settlementValue ?? ''}">
      </div>
      <div class="form-group">
        <label>Khối lượng phát sinh (VNĐ)</label>
        <input type="number" id="f-arisingValue" value="${pkg?.arisingValue ?? ''}">
      </div>
      <div class="form-group">
        <label>Ngày quyết toán</label>
        <input type="date" id="f-settlementDate" value="${pkg?.settlementDate || ''}">
      </div>
      <div class="form-group full-width">
        <label>Ghi chú</label>
        <textarea id="f-notes">${pkg?.notes || ''}</textarea>
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">attach_file</span> Hồ sơ đính kèm</div>
      <div class="form-group full-width">
        <div class="pdf-list" id="pdf-list-form">${pdfListHTML}</div>
        <div class="pdf-upload-area" style="margin-top:8px">
          <select id="pdf-category-form" style="font-size:0.75rem;width:auto;margin-right:4px">
            <option value="">-- Loại hồ sơ --</option>
            <option value="Thỏa thuận hợp đồng">Thỏa thuận hợp đồng</option>
            <option value="Quyết định phê duyệt trúng thầu">QĐ phê duyệt trúng thầu</option>
            <option value="Đơn dự thầu">Đơn dự thầu</option>
            <option value="Điều kiện hợp đồng">Điều kiện hợp đồng</option>
            <option value="HSMT/HSDT">HSMT / HSDT</option>
            <option value="Bản vẽ thiết kế">Bản vẽ thiết kế</option>
            <option value="Chỉ dẫn kỹ thuật">Chỉ dẫn kỹ thuật</option>
            <option value="Biên bản nghiệm thu">Biên bản nghiệm thu</option>
            <option value="Bảng tính quyết toán A-B">Bảng tính quyết toán A-B</option>
            <option value="Khác">Khác</option>
          </select>
          <input type="file" id="pdf-file-input-form" accept="${ALLOWED_UPLOAD_ACCEPT}" onchange="handlePDFUploadFromForm('${catId}','${pkg?.id || ''}')">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('pdf-file-input-form').click()">
            <span class="material-symbols-rounded">upload_file</span> Tải lên file
          </button>
        </div>
      </div>
    </div>
  `;
}

function getPackageFormData() {
  return {
    name: document.getElementById('f-name').value.trim(),
    pkgType: document.getElementById('f-pkgType').value || 'construction',
    estimateValue: Number(document.getElementById('f-estimateValue').value) || 0,
    bidValue: Number(document.getElementById('f-bidValue').value) || 0,
    fundSource: document.getElementById('f-fundSource').value.trim(),
    bidDecision: document.getElementById('f-bidDecision').value.trim(),
    contract: document.getElementById('f-contract').value.trim(),
    selectionMethod: document.getElementById('f-selectionMethod').value,
    contractor: document.getElementById('f-contractor').value.trim(),
    duration: document.getElementById('f-duration').value.trim(),
    progress: Number(document.getElementById('f-progress').value) || 0,
    periodValue: Number(document.getElementById('f-periodValue').value) || 0,
    periodDisbursed: Number(document.getElementById('f-periodDisbursed').value) || 0,
    cumulativeValue: Number(document.getElementById('f-cumulativeValue').value) || 0,
    cumulativeDisbursed: Number(document.getElementById('f-cumulativeDisbursed').value) || 0,

    docAcceptDate: document.getElementById('f-docAcceptDate').value,
    docAcceptStatus: document.getElementById('f-docAcceptStatus').value,

    acceptanceValue: Number(document.getElementById('f-acceptanceValue').value) || 0,
    acceptanceStatus: document.getElementById('f-acceptanceStatus').value,
    acceptanceDate: document.getElementById('f-acceptanceDate').value,
    loss: Number(document.getElementById('f-loss').value) || 0,
    contractType: document.getElementById('f-contractType').value,
    contractSignDate: document.getElementById('f-contractSignDate').value,
    contractStartDate: document.getElementById('f-contractStartDate').value,
    contractEndDate: document.getElementById('f-contractEndDate').value,
    contractExtension: document.getElementById('f-contractExtension').value.trim(),
    invoiceNumber: document.getElementById('f-invoiceNumber').value.trim(),
    invoiceDate: document.getElementById('f-invoiceDate').value,
    invoiceValue: Number(document.getElementById('f-invoiceValue').value) || 0,
    invoiceXml: document.getElementById('f-invoiceXml').checked,
    handoverDate: document.getElementById('f-handoverDate').value,
    warrantyMonths: document.getElementById('f-warrantyMonths').value ? Number(document.getElementById('f-warrantyMonths').value) : null,
    settlementStatus: document.getElementById('f-settlementStatus').value,
    settlementValue: Number(document.getElementById('f-settlementValue').value) || 0,
    arisingValue: Number(document.getElementById('f-arisingValue').value) || 0,
    settlementDate: document.getElementById('f-settlementDate').value,
    notes: document.getElementById('f-notes').value.trim(),
    milestones: (() => {
      const keys = ['KhoiCong','Mong','Than','HoanThien','BanGiao'];
      const names = {KhoiCong:'Khởi công',Mong:'Móng',Than:'Thân',HoanThien:'Hoàn thiện',BanGiao:'Bàn giao'};
      const ms = keys.map(k => ({
        id: k,
        name: names[k],
        plannedDate: document.getElementById('f-ms-'+k+'-planned')?.value || '',
        actualDate: document.getElementById('f-ms-'+k+'-actual')?.value || '',
        weight: Number(document.getElementById('f-ms-'+k+'-weight')?.value) || 0
      }));
      const hasData = ms.some(m => m.plannedDate || m.actualDate || m.weight);
      return hasData ? ms : [];
    })()
  };
}

function generateDocChecklist() {
  return [
    {
      stage: '01_Pháp lý đầu vào — NĐ 217, 206, 212/2026',
      items: [
        { id: generateId(), name: 'Kế hoạch vốn / Quyết định giao dự toán', required: true, done: false },
        { id: generateId(), name: 'Quyết định phê duyệt dự án / BCKTKT và tổng mức đầu tư', required: true, done: false },
        { id: generateId(), name: 'Mã định danh dự án/công trình và hồ sơ năng lực liên quan', required: true, done: false },
        { id: generateId(), name: 'Hợp đồng kinh tế & Phụ lục', required: true, done: false },
        { id: generateId(), name: 'Mẫu 02.a/TT - Bảng tổng hợp thông tin HĐ', required: false, done: false },
        { id: generateId(), name: 'Mẫu 02.b/TT - Bảng tổng hợp dự toán chi phí', required: false, done: false },
        { id: generateId(), name: 'Mẫu 02.c/TT - Bồi thường, hỗ trợ, tái định cư', required: false, done: false }
      ]
    },
    {
      stage: '02_Tạm ứng — NĐ 210/2026 và quy định thanh toán vốn',
      items: [
        { id: generateId(), name: 'Mẫu 04.a/TT - Giấy đề nghị thanh toán (tạm ứng)', required: true, done: false },
        { id: generateId(), name: 'Mẫu 05.a/TT - Giấy rút vốn / rút dự toán', required: true, done: false },
        { id: generateId(), name: 'Bảo lãnh tạm ứng hợp đồng', required: '> 1 tỷ', done: false }
      ]
    },
    {
      stage: '03_Thanh toán KLHT — NĐ 206, 210/2026',
      items: [
        { id: generateId(), name: 'Mẫu 03.a/TT - Bảng xác định giá trị KLHT', required: true, done: false },
        { id: generateId(), name: 'Mẫu 04.a/TT - Giấy đề nghị thanh toán (thực chi)', required: true, done: false },
        { id: generateId(), name: 'Mẫu 05.a/TT - Giấy rút vốn / rút dự toán', required: true, done: false },
        { id: generateId(), name: 'Mẫu 04.b/TT - Giấy đề nghị thu hồi tạm ứng', required: false, done: false }
      ]
    },
    {
      stage: '04_Nghiệm thu hoàn thành — NĐ 207, 209/2026',
      items: [
        { id: generateId(), name: 'Biên bản nghiệm thu hoàn thành toàn bộ HĐ', required: true, done: false },
        { id: generateId(), name: 'Biên bản nghiệm thu hoàn thành công trình', required: true, done: false },
        { id: generateId(), name: 'Hồ sơ chất lượng vật liệu, cấu kiện, thiết bị', required: true, done: false },
        { id: generateId(), name: 'Biên bản bàn giao đưa vào sử dụng', required: true, done: false }
      ]
    },
    {
      stage: '05_Quyết toán A-B & Thanh lý — NĐ 210/2026',
      items: [
        { id: generateId(), name: 'Bảng tính quyết toán A-B (Mẫu 01/QTDA)', required: true, done: false },
        { id: generateId(), name: 'Biên bản thanh lý hợp đồng', required: true, done: false },
        { id: generateId(), name: 'Báo cáo kiểm toán độc lập (nếu có)', required: false, done: false }
      ]
    },
    {
      stage: '06_Hồ sơ trình duyệt — NĐ 193/2026',
      items: [
        { id: generateId(), name: 'Tờ trình đề nghị phê duyệt quyết toán', required: true, done: false },
        { id: generateId(), name: 'Mẫu 01-07/QTDA - Hệ thống mẫu biểu quyết toán', required: true, done: false },
        { id: generateId(), name: 'Văn bản pháp lý dự án (tổng hợp)', required: true, done: false },
        { id: generateId(), name: 'Kết luận thanh tra / kiểm toán (nếu có)', required: false, done: false }
      ]
    }
  ];
}

function addPackage(catId) {
  if (!requireEditPermission()) return;
  tempUploadedPDFs = [];
  openModal('Thêm gói thầu mới', getPackageFormHTML(null, catId), `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveNewPackage('${catId}')">
      <span class="material-symbols-rounded">save</span> Lưu
    </button>
  `);
  setTimeout(togglePkgTypeFields, 50);
}

function saveNewPackage(catId) {
  const data = getPackageFormData();
  if (!data.name) { showToast('Vui lòng nhập tên gói thầu', 'error'); return; }
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  if (!cat) return;
  data.id = generateId();
  data.pdfs = [...tempUploadedPDFs];
  data.documentChecklist = generateDocChecklist();
  data.constructionLog = [];
  cat.packages.push(data);
  addAudit(project, 'create', 'gói thầu', data.name, `Danh mục: ${esc(cat.name || '')}`);
  saveState();
  tempUploadedPDFs = [];
  closeModal();
  renderPackages();
  showToast('Đã thêm gói thầu: ' + data.name);
}

function editPackage(catId, pkgId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  openModal('Sửa gói thầu', getPackageFormHTML(pkg, catId), `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveEditPackage('${catId}','${pkgId}')">
      <span class="material-symbols-rounded">save</span> Cập nhật
    </button>
  `);
  setTimeout(togglePkgTypeFields, 50);
}

function saveEditPackage(catId, pkgId) {
  const data = getPackageFormData();
  if (!data.name) { showToast('Vui lòng nhập tên gói thầu', 'error'); return; }
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  Object.assign(pkg, data);
  addAudit(project, 'update', 'gói thầu', data.name, `Danh mục: ${esc(cat?.name || '')}`);
  saveState();
  closeModal();
  renderAll();
  showToast('Đã cập nhật gói thầu: ' + data.name);
}

function deletePackage(catId, pkgId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  openModal('Xác nhận xóa', `
    <div class="confirm-content">
      <span class="material-symbols-rounded">warning</span>
      <p>Bạn có chắc chắn muốn xóa gói thầu:</p>
      <p class="confirm-name">"${esc(pkg.name)}"?</p>
      <p style="color:var(--accent-red);font-size:0.8rem;margin-top:8px">Hành động này không thể hoàn tác.</p>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-danger" onclick="confirmDeletePackage('${catId}','${pkgId}')">
      <span class="material-symbols-rounded">delete</span> Xóa
    </button>
  `);
}

function confirmDeletePackage(catId, pkgId) {
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  if (!cat) return;
  const pkg = cat.packages.find(p => p.id === pkgId);
  const pkgName = pkg?.name || '';
  // Delete associated PDFs
  if (pkg?.pdfs?.length) {
    pkg.pdfs.forEach(pdf => apiDeletePDF(pdf.id).catch(() => { }));
  }
  cat.packages = cat.packages.filter(p => p.id !== pkgId);
  addAudit(project, 'delete', 'gói thầu', pkgName, `Danh mục: ${esc(cat.name || '')}`);
  saveState();
  closeModal();
  renderAll();
  showToast('Đã xóa gói thầu', 'info');
}

// ---- View Package Detail ----
function viewPackageDetail(catId, pkgId) {
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;

  const pdfListHTML = (pkg.pdfs?.length)
    ? pkg.pdfs.map(pdf => `
        <div class="pdf-item">
          <span class="material-symbols-rounded">attach_file</span>
<span class="pdf-name" onclick="viewPDF('${pdf.id}')" title="Nhấn để xem">${esc(pdf.name)}</span>
          <span class="pdf-size">${formatFileSize(pdf.size)}</span>
          ${pdf.category ? `<span class="badge badge-neutral" style="font-size:0.65rem">${esc(pdf.category)}</span>` : ''}
          <button class="btn-icon btn-sm edit-only" title="Xóa file" onclick="removePDF('${catId}','${pkgId}','${pdf.id}')">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
      `).join('')
    : '<p class="pdf-empty">Chưa có file đính kèm</p>';

  openModal(pkg.name, `
    <div class="detail-grid">
      <div class="detail-item full-width">
        <span class="detail-label">Tên gói thầu</span>
        <span class="detail-value">${esc(pkg.name)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Giá trị Tổng mức đầu tư</span>
        <span class="detail-value money">${formatCurrency(pkg.investValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Giá trị dự toán</span>
        <span class="detail-value money">${formatCurrency(pkg.estimateValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Giá trị trúng thầu</span>
        <span class="detail-value money">${formatCurrency(pkg.bidValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Nguồn vốn</span>
        <span class="detail-value">${esc(pkg.fundSource || '—')}</span>
      </div>
      <div class="detail-section-title">Thông tin hợp đồng</div>
      <div class="detail-item">
        <span class="detail-label">QĐ trúng thầu</span>
        <span class="detail-value">${esc(pkg.bidDecision || '—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Hợp đồng</span>
        <span class="detail-value">${esc(pkg.contract || '—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Loại hợp đồng</span>
        <span class="detail-value">${esc(pkg.contractType || '—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày ký hợp đồng</span>
        <span class="detail-value">${formatDateVN(pkg.contractSignDate)}</span>
      </div>
      ${pkg.contractType === 'Thi công xây dựng' ? `
      <div class="detail-item">
        <span class="detail-label">Ngày khởi công</span>
        <span class="detail-value">${formatDateVN(pkg.contractStartDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày hoàn thành</span>
        <span class="detail-value"><span class="${pkg.contractEndDate && pkg.progress < 100 && daysUntil(pkg.contractEndDate) < 0 ? 'badge badge-danger' : ''}">${formatDateVN(pkg.contractEndDate)}</span></span>
      </div>` : ''}
      <div class="detail-item">
        <span class="detail-label">Phân nhánh hồ sơ</span>
        <span class="detail-value"><span class="badge badge-warning">${getContractRoute(pkg).name}</span> <small class="detail-sub">${getContractRoute(pkg).hint}</small></span>
      </div>
      <div class="detail-item ${pkg.contractExtension ? '' : 'full-width'}">
        <span class="detail-label">PL gia hạn</span>
        <span class="detail-value">${esc(pkg.contractExtension || 'Không có')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Hình thức lựa chọn</span>
        <span class="detail-value">${esc(pkg.selectionMethod || '—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Đơn vị trúng thầu</span>
        <span class="detail-value">${esc(pkg.contractor || '—')}</span>
      </div>
      ${pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' ? `
      <div class="detail-item">
        <span class="detail-label">Thời gian KC-HT</span>
        <span class="detail-value">${esc(pkg.duration || '—')}</span>
      </div>
      ` : ''}
      ${pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' ? `
      <div class="detail-item">
        <span class="detail-label">Tiến độ</span>
        <span class="detail-value">${pkg.progress}%</span>
      </div>
      <div class="detail-section-title">Tiến độ từng mốc</div>
      ${(() => {
        const ms = pkg.milestones || [];
        if (ms.length) {
          const weightedProgress = ms.reduce((s, m) => {
            const done = m.actualDate ? 100 : 0;
            return s + (m.weight || 0) * done / 100;
          }, 0);
          const totalWeight = ms.reduce((s, m) => s + (m.weight || 0), 0);
          const agg = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
          const msHTML = ms.map(m => {
            const done = !!m.actualDate;
            return `
            <div class="detail-item">
              <span class="detail-label">${done ? '<span style="color:var(--accent-green)">&#10003;</span> ' : ''}${esc(m.name)}</span>
              <span class="detail-value">Dự kiến: ${formatDateVN(m.plannedDate)} | Thực tế: ${formatDateVN(m.actualDate)} | Trọng số: ${m.weight || 0}%</span>
            </div>`;
          }).join('');
          return `
          <div style="margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${agg}%;background:var(--accent-green);border-radius:4px;transition:width .3s"></div>
              </div>
              <span style="font-weight:700;font-size:0.9rem">${agg}%</span>
            </div>
            ${msHTML}
          </div>`;
        }
        return '<p style="color:var(--text-muted);font-size:0.78rem;padding:4px 0">Chưa có mốc tiến độ. Sử dụng tiến độ chung.</p>';
      })()}
` : ''}
      <div class="detail-section-title">Giá trị thực hiện</div>
      <div class="detail-item">
        <span class="detail-label">Trong kỳ - Giá trị thực hiện</span>
        <span class="detail-value money">${formatCurrency(pkg.periodValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Trong kỳ - Giải ngân</span>
        <span class="detail-value money">${formatCurrency(pkg.periodDisbursed)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Lũy kế giá trị thực hiện</span>
        <span class="detail-value money">${formatCurrency(pkg.cumulativeValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Lũy kế giải ngân</span>
        <span class="detail-value money">${formatCurrency(pkg.cumulativeDisbursed)}</span>
      </div>
      ${pkg.pkgType === 'consulting' || pkg.pkgType === 'nonConsulting' ? `
      <div class="detail-section-title">Nghiệm thu hồ sơ</div>
      <div class="detail-item">
        <span class="detail-label">Ngày nghiệm thu</span>
        <span class="detail-value">${formatDateVN(pkg.docAcceptDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Trạng thái</span>
        <span class="detail-value"><span class="badge ${pkg.docAcceptStatus === 'Đã nghiệm thu' ? 'badge-success' : 'badge-warning'}">${pkg.docAcceptStatus || 'Chưa nghiệm thu'}</span></span>
      </div>
      ` : ''}
      <div class="detail-section-title">Nghiệm thu khối lượng</div>
      <div class="detail-item">
        <span class="detail-label">Giá trị KL CV hoàn thành</span>
        <span class="detail-value money">${formatCurrency(pkg.acceptanceValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Trạng thái</span>
        <span class="detail-value"><span class="badge ${pkg.acceptanceStatus === 'Đã nghiệm thu' ? 'badge-success' : 'badge-warning'}">${pkg.acceptanceStatus || 'Chưa nghiệm thu'}</span></span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày</span>
        <span class="detail-value">${formatDateVN(pkg.acceptanceDate)}</span>
      </div>
      ${pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' ? `
      <div class="detail-item">
        <span class="detail-label">Thất thoát, lãng phí</span>
        <span class="detail-value" style="color:${pkg.loss ? 'var(--accent-red)' : 'var(--text-secondary)'}">${pkg.loss ? formatCurrency(pkg.loss) : '0'}</span>
      </div>
      ` : ''}

      <div class="detail-section-title">Hóa đơn GTGT (NĐ 123/2020)</div>
      <div class="detail-item">
        <span class="detail-label">Số hóa đơn GTGT</span>
        <span class="detail-value">${esc(pkg.invoiceNumber || '—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày xuất hóa đơn</span>
        <span class="detail-value">${formatDateVN(pkg.invoiceDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Giá trị HĐ GTGT</span>
        <span class="detail-value money">${formatCurrency(pkg.invoiceValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">HĐ điện tử XML</span>
        <span class="detail-value">${pkg.invoiceXml ? '<span class="badge badge-success">Đồng bộ KB điện tử</span>' : '<span class="badge badge-neutral">Chưa</span>'}</span>
      </div>
      ${(() => { const ca = computeContractAlerts(pkg); return ca.length ? `<div class="detail-item full-width"><span class="detail-label">Cảnh báo hợp đồng</span><span class="detail-value">${ca.map(a => `<div class="log-item" style="margin-top:2px"><span class="material-symbols-rounded" style="font-size:16px;color:var(--accent-${a.level === 'danger' ? 'red' : 'amber'})">${a.icon}</span> ${esc(a.message)}</div>`).join('')}</span></div>` : ''; })()}

      ${pkg.pkgType === 'consulting' || pkg.pkgType === 'nonConsulting' ? `
      <div class="detail-item">
        <span class="detail-label">Ngày bàn giao</span>
        <span class="detail-value">${formatDateVN(pkg.handoverDate)}</span>
      </div>
      ` : `
      <div class="detail-section-title">Bàn giao & Bảo hành</div>
      <div class="detail-item">
        <span class="detail-label">Ngày bàn giao</span>
        <span class="detail-value">${formatDateVN(pkg.handoverDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Thời hạn bảo hành</span>
        <span class="detail-value">${pkg.warrantyMonths || computeWarrantyMonths(project.buildingGrade)} tháng</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày hết hạn bảo hành</span>
        <span class="detail-value">${(() => {
      if (!pkg.handoverDate) return '—';
      const end = addMonths(pkg.handoverDate, pkg.warrantyMonths || computeWarrantyMonths(project.buildingGrade));
      const d = daysUntil(end);
      const cls = d < 0 ? 'badge-danger' : (d <= 60 ? 'badge-warning' : 'badge-success');
      return `${formatDateVN(end)} <span class="badge ${cls}">${d < 0 ? 'Hết hạn' : d + ' ngày còn lại'}</span>`;
    })()}</span>
      </div>
      `}

      <div class="detail-section-title">Quyết toán (A-B)</div>
      <div class="detail-item">
        <span class="detail-label">Trạng thái quyết toán</span>
        <span class="detail-value"><span class="badge ${pkg.settlementStatus === 'Đã quyết toán' ? 'badge-success' : 'badge-info'}">${pkg.settlementStatus || 'Chưa quyết toán'}</span></span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Giá trị quyết toán</span>
        <span class="detail-value money">${formatCurrency(pkg.settlementValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Khối lượng phát sinh</span>
        <span class="detail-value money">${formatCurrency(pkg.arisingValue)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày quyết toán</span>
        <span class="detail-value">${formatDateVN(pkg.settlementDate)}</span>
      </div>
      ${pkg.notes ? `<div class="detail-item full-width"><span class="detail-label">Ghi chú</span><span class="detail-value">${esc(pkg.notes)}</span></div>` : ''}

      <div class="detail-section-title">Lịch sử thanh toán / nghiệm thu</div>
      ${(pkg.payments || []).length ? `
      <table style="width:100%;font-size:0.78rem;margin:8px 0"><thead><tr style="color:var(--text-muted)"><th>Ngày</th><th>Nghiệm thu</th><th>Hóa đơn</th><th>Số HĐ</th><th>Ghi chú</th><th style="width:60px"></th></tr></thead>
      <tbody>${pkg.payments.map(pm => `
        <tr style="border-top:1px solid var(--border)">
          <td>${formatDateVN(pm.date)}</td>
          <td class="text-right">${formatCurrency(pm.acceptanceValue, true)}</td>
          <td class="text-right">${formatCurrency(pm.invoiceValue, true)}</td>
          <td>${esc(pm.invoiceNumber || '—')}${pm.invoiceXml ? ' <span class="badge badge-success">XML</span>' : ''}</td>
          <td style="font-size:0.7rem;color:var(--text-muted)">${esc(pm.note || '—')}</td>
          <td><button class="btn-icon edit-only" title="Xóa" onclick="deletePayment('${catId}','${pkgId}','${pm.id}')"><span class="material-symbols-rounded" style="font-size:16px">close</span></button></td>
        </tr>`).join('')}</tbody></table>
        <div style="font-size:0.75rem;color:var(--text-muted);text-align:right;margin:4px 0">
          Tổng nghiệm thu: <strong>${formatCurrency(pkg.payments.reduce((s,p)=>s+(p.acceptanceValue||0),0), true)}</strong> &nbsp;|&nbsp;
          Tổng hóa đơn: <strong>${formatCurrency(pkg.payments.reduce((s,p)=>s+(p.invoiceValue||0),0), true)}</strong>
        </div>
      ` : '<p style="color:var(--text-muted);font-size:0.78rem;padding:4px 0">Chưa có đợt thanh toán nào.</p>'}
      <button class="btn btn-secondary btn-sm edit-only" onclick="addPayment('${catId}','${pkgId}')" style="margin-top:4px">+ Thêm đợt thanh toán</button>

      ${(pkg.pkgType === 'consulting' || pkg.pkgType === 'nonConsulting') ? `
      <div class="detail-section-title">Sản phẩm giao nộp (Tư vấn)</div>
      ${(pkg.deliverables || []).length ? `
      <table style="width:100%;font-size:0.78rem;margin:8px 0"><thead><tr style="color:var(--text-muted)"><th>Đợt</th><th>Sản phẩm</th><th>Trạng thái</th><th>Người duyệt</th><th style="width:60px"></th></tr></thead>
      <tbody>${pkg.deliverables.map(d => `
        <tr style="border-top:1px solid var(--border)">
          <td>${esc(d.phase)}</td>
          <td>${esc(d.name)}${d.isSignedDigital ? ' <span class="badge badge-success">Ký số</span>' : ''}</td>
          <td><span class="badge ${d.approvalStatus === 'APPROVED' ? 'badge-success' : (d.approvalStatus === 'REJECTED' ? 'badge-danger' : (d.approvalStatus === 'SUBMITTED' ? 'badge-info' : 'badge-neutral'))}">${d.approvalStatus === 'APPROVED' ? 'Đã duyệt' : (d.approvalStatus === 'REJECTED' ? 'Từ chối' : (d.approvalStatus === 'SUBMITTED' ? 'Đã nộp' : 'Bản nháp'))}</span></td>
          <td>${esc(d.approvedBy || '—')}${d.approvedAt ? `<br><small>${formatDateVN(d.approvedAt)}</small>` : ''}</td>
          <td><button class="btn-icon edit-only" title="Xóa" onclick="deleteDeliverable('${catId}','${pkgId}','${d.id}')"><span class="material-symbols-rounded" style="font-size:16px">close</span></button></td>
        </tr>`).join('')}</tbody></table>
      ` : '<p style="color:var(--text-muted);font-size:0.78rem;padding:4px 0">Chưa có sản phẩm giao nộp.</p>'}
      <button class="btn btn-secondary btn-sm edit-only" onclick="addDeliverable('${catId}','${pkgId}')" style="margin-top:4px">+ Giao nộp sản phẩm</button>
      ` : ''}

      <div class="detail-section-title">Phát sinh khối lượng</div>
      ${(() => {
        const vars = pkg.variations || [];
        if (vars.length) {
          const totalVar = vars.reduce((s, v) => s + (v.amount || 0), 0);
          const pendingCount = vars.filter(v => v.status === 'pending').length;
          return `
          <table style="width:100%;font-size:0.78rem;margin:8px 0"><thead><tr style="color:var(--text-muted)"><th>Ngày</th><th>Lý do</th><th>Giá trị</th><th>Trạng thái</th><th>Người duyệt</th><th style="width:60px"></th></tr></thead>
          <tbody>${vars.map(v => `
            <tr style="border-top:1px solid var(--border)">
              <td>${formatDateVN(v.date)}</td>
              <td style="font-size:0.75rem">${esc(v.reason || '—')}</td>
              <td class="text-right">${formatCurrency(v.amount, true)}</td>
              <td><span class="badge ${v.status === 'approved' ? 'badge-success' : (v.status === 'rejected' ? 'badge-danger' : 'badge-warning')}">${v.status === 'approved' ? 'Đã duyệt' : (v.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt')}</span></td>
              <td>${esc(v.approvedBy || '—')}</td>
              <td><button class="btn-icon edit-only" title="Xóa" onclick="deleteVariation('${catId}','${pkgId}','${v.id}')"><span class="material-symbols-rounded" style="font-size:16px">close</span></button></td>
            </tr>`).join('')}</tbody></table>
            <div style="font-size:0.75rem;color:var(--text-muted);text-align:right;margin:4px 0">
              Tổng phát sinh: <strong>${formatCurrency(totalVar, true)}</strong> &nbsp;|&nbsp;
              Chờ duyệt: <strong>${pendingCount}</strong>
            </div>`;
        }
        return '<p style="color:var(--text-muted);font-size:0.78rem;padding:4px 0">Chưa có phát sinh khối lượng.</p>';
      })()}
      <button class="btn btn-secondary btn-sm edit-only" onclick="addVariation('${catId}','${pkgId}')" style="margin-top:4px">+ Thêm phát sinh</button>

      <div class="detail-section-title">Danh mục hồ sơ</div>
${(pkg.documentChecklist || []).map(stage => `
  <div style="margin-bottom:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
    <div style="padding:8px 12px;background:rgba(148,163,184,.06);font-weight:600;font-size:0.8rem;display:flex;justify-content:space-between;align-items:center">
      <span>${esc(stage.stage.replace(/_/g, ' - '))}</span>
      <span style="font-size:0.7rem;color:var(--text-muted)">${stage.items.filter(i => i.done).length}/${stage.items.length}</span>
    </div>
    <div style="padding:4px 12px">
      ${stage.items.map(item => `
        <label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.78rem;cursor:pointer">
          <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleDocChecklistItem('${catId}','${pkgId}','${stage.stage}','${item.id}',this.checked)" style="width:14px;height:14px">
          <span style="${item.required === true ? 'font-weight:500' : 'color:var(--text-muted)'}">${esc(item.name)}</span>
          ${item.required === true ? '<span style="color:var(--accent-red);font-size:0.65rem">*bắt buộc</span>' : (typeof item.required === 'string' ? `<span style="color:var(--accent-amber);font-size:0.65rem">${esc(item.required)}</span>` : '')}
        </label>
      `).join('')}
    </div>
  </div>
`).join('')}
${!(pkg.documentChecklist || []).length ? '<p style="color:var(--text-muted);font-size:0.78rem;padding:4px 0">Danh mục hồ sơ sẽ tự động tạo khi thêm gói thầu mới.</p>' : ''}

      <div class="pdf-section">
        <h4><span class="material-symbols-rounded">attach_file</span> Hồ sơ đính kèm</h4>
        <div class="pdf-list" id="pdf-list-detail">${pdfListHTML}</div>
        <div class="pdf-upload-area edit-only">
<input type="file" id="pdf-file-input" accept="${ALLOWED_UPLOAD_ACCEPT}" onchange="handlePDFUpload('${catId}','${pkgId}')">
          <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('pdf-file-input').click()">
            <span class="material-symbols-rounded">upload_file</span> Tải lên file
          </button>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
    <button class="btn btn-primary edit-only" onclick="editPackage('${catId}','${pkgId}')">
      <span class="material-symbols-rounded">edit</span> Sửa
    </button>
  `);
}

function addPayment(catId, pkgId) {
  if (!requireEditPermission()) return;
  openModal('Thêm đợt thanh toán', `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Ngày</label><input type="date" id="pm-date"></div>
      <div class="form-group"><label>Giá trị nghiệm thu (VNĐ)</label><input type="number" id="pm-acceptanceValue"></div>
      <div class="form-group"><label>Giá trị hóa đơn (VNĐ)</label><input type="number" id="pm-invoiceValue"></div>
      <div class="form-group"><label>Số hóa đơn</label><input type="text" id="pm-invoiceNumber"></div>
      <div class="form-group" style="display:flex;align-items:flex-end;gap:6px"><label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:0.85rem"><input type="checkbox" id="pm-invoiceXml" style="width:auto"> HĐ điện tử XML</label></div>
      <div class="form-group full-width"><label>Ghi chú</label><input type="text" id="pm-note"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="savePayment('${catId}','${pkgId}')">Lưu</button>
  `);
}

function savePayment(catId, pkgId) {
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  pkg.payments = pkg.payments || [];
  pkg.payments.push({
    id: generateId(),
    date: document.getElementById('pm-date').value,
    acceptanceValue: Number(document.getElementById('pm-acceptanceValue').value) || 0,
    invoiceValue: Number(document.getElementById('pm-invoiceValue').value) || 0,
    invoiceNumber: document.getElementById('pm-invoiceNumber').value.trim(),
    invoiceXml: document.getElementById('pm-invoiceXml').checked,
    note: document.getElementById('pm-note').value.trim()
  });
  addAudit(project, 'create', 'thanh toán', pkg.name, `Đợt ${pkg.payments.length}`);
  saveState();
  closeModal();
  viewPackageDetail(catId, pkgId);
  showToast('Đã thêm đợt thanh toán');
}

function deletePayment(catId, pkgId, paymentId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg?.payments) return;
  pkg.payments = pkg.payments.filter(pm => pm.id !== paymentId);
  addAudit(project, 'delete', 'thanh toán', pkg.name);
  saveState();
  viewPackageDetail(catId, pkgId);
  showToast('Đã xóa đợt thanh toán', 'info');
}

function toggleDocChecklistItem(catId, pkgId, stageName, itemId, checked) {
  const proj = getCurrentProject();
  const pkg = proj?.categories?.find(c => c.id === catId)?.packages?.find(p => p.id === pkgId);
  if (!pkg?.documentChecklist) return;
  const stage = pkg.documentChecklist.find(s => s.stage === stageName);
  if (!stage) return;
  const item = stage.items.find(i => i.id === itemId);
  if (item) item.done = checked;
  saveState();
  viewPackageDetail(catId, pkgId);
}

// Deliverable Submissions (gói tư vấn — nộp sản phẩm theo đợt)
function addDeliverable(catId, pkgId) {
  if (!requireEditPermission()) return;
  openModal('Giao nộp sản phẩm tư vấn', `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Giai đoạn / Đợt</label><input type="text" id="del-phase" placeholder="VD: Đợt 1 - Thiết kế cơ sở"></div>
      <div class="form-group"><label>Tên sản phẩm</label><input type="text" id="del-name" placeholder="VD: Hồ sơ thiết kế kỹ thuật"></div>
      <div class="form-group"><label>Trạng thái phê duyệt</label>
        <select id="del-status"><option value="DRAFT">Bản nháp</option><option value="SUBMITTED">Đã nộp</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option></select>
      </div>
      <div class="form-group"><label>Người phê duyệt</label><input type="text" id="del-approvedBy"></div>
      <div class="form-group"><label>Ngày phê duyệt</label><input type="date" id="del-approvedAt"></div>
      <div class="form-group" style="display:flex;align-items:flex-end;gap:6px"><label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:0.85rem"><input type="checkbox" id="del-signed" style="width:auto"> Đã ký số</label></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveDeliverable('${catId}','${pkgId}')">Lưu</button>
  `);
}

function saveDeliverable(catId, pkgId) {
  const proj = getCurrentProject();
  const pkg = proj?.categories?.find(c => c.id === catId)?.packages?.find(p => p.id === pkgId);
  if (!pkg) return;
  pkg.deliverables = pkg.deliverables || [];
  pkg.deliverables.push({
    id: generateId(),
    phase: document.getElementById('del-phase').value.trim(),
    name: document.getElementById('del-name').value.trim(),
    isSignedDigital: document.getElementById('del-signed').checked,
    approvalStatus: document.getElementById('del-status').value,
    approvedBy: document.getElementById('del-approvedBy').value.trim(),
    approvedAt: document.getElementById('del-approvedAt').value
  });
  addAudit(proj, 'create', 'sản phẩm tư vấn', pkg.name, `Đợt ${pkg.deliverables.length}`);
  saveState(); closeModal();
  viewPackageDetail(catId, pkgId);
  showToast('Đã thêm sản phẩm giao nộp');
}

function deleteDeliverable(catId, pkgId, delId) {
  if (!requireEditPermission()) return;
  const proj = getCurrentProject();
  const pkg = proj?.categories?.find(c => c.id === catId)?.packages?.find(p => p.id === pkgId);
  if (!pkg?.deliverables) return;
  pkg.deliverables = pkg.deliverables.filter(d => d.id !== delId);
  addAudit(proj, 'delete', 'sản phẩm tư vấn', pkg.name);
  saveState();
  viewPackageDetail(catId, pkgId);
  showToast('Đã xóa sản phẩm giao nộp', 'info');
}

function addVariation(catId, pkgId) {
  if (!requireEditPermission()) return;
  openModal('Thêm phát sinh khối lượng', `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Ngày</label><input type="date" id="var-date"></div>
      <div class="form-group"><label>Giá trị (VNĐ)</label><input type="number" id="var-amount"></div>
      <div class="form-group"><label>Trạng thái</label>
        <select id="var-status">
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
        </select>
      </div>
      <div class="form-group"><label>Người duyệt</label><input type="text" id="var-approvedBy"></div>
      <div class="form-group full-width"><label>Lý do</label><textarea id="var-reason"></textarea></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveVariation('${catId}','${pkgId}')">Lưu</button>
  `);
}

function saveVariation(catId, pkgId) {
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  pkg.variations = pkg.variations || [];
  pkg.variations.push({
    id: generateId(),
    date: document.getElementById('var-date').value,
    amount: Number(document.getElementById('var-amount').value) || 0,
    status: document.getElementById('var-status').value,
    approvedBy: document.getElementById('var-approvedBy').value.trim(),
    reason: document.getElementById('var-reason').value.trim()
  });
  addAudit(project, 'create', 'phát sinh', pkg.name, `Phát sinh #${pkg.variations.length}`);
  saveState();
  closeModal();
  viewPackageDetail(catId, pkgId);
  showToast('Đã thêm phát sinh khối lượng');
}

function deleteVariation(catId, pkgId, varId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg?.variations) return;
  pkg.variations = pkg.variations.filter(v => v.id !== varId);
  addAudit(project, 'delete', 'phát sinh', pkg.name);
  saveState();
  viewPackageDetail(catId, pkgId);
  showToast('Đã xóa phát sinh khối lượng', 'info');
}

function renderConstructionLogHTML(pkg, catId, pkgId) {
  const logs = pkg.constructionLog || [];
  if (logs.length === 0) return '<p class="log-empty">Chưa có nhật ký thi công</p>';
  return [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(entry => `
    <div class="log-item">
      <div class="log-item-header">
        ${entry.logType ? `<span class="badge badge-neutral" style="font-size:0.65rem;margin-right:4px">${esc(entry.logType)}</span>` : ''}
        <span class="log-date">${formatDateVN(entry.date)}</span>
        <span class="log-author">${esc(entry.author || 'Không rõ')}</span>
        <button class="btn-icon btn-sm edit-only" title="Xóa mục nhật ký" onclick="deleteConstructionLogEntry('${catId}','${pkgId}','${entry.id}')">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="log-content">${esc(entry.content)}</div>
    </div>
  `).join('');
}

function addConstructionLogEntry(catId, pkgId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg) return;
  const date = document.getElementById('log-date-input').value;
  const author = document.getElementById('log-author-input').value.trim();
  const content = document.getElementById('log-content-input').value.trim();
  const logType = document.getElementById('log-type-input')?.value || '';
  if (!content) { showToast('Vui lòng nhập nội dung nhật ký', 'error'); return; }
  if (!pkg.constructionLog) pkg.constructionLog = [];
  pkg.constructionLog.push({ id: generateId(), date, author, content, logType });
  addAudit(project, 'create', 'nhật ký', pkg.name || '');
  saveState();
  document.getElementById('log-list-detail').innerHTML = renderConstructionLogHTML(pkg, catId, pkgId);
  document.getElementById('log-content-input').value = '';
  showToast('Đã ghi nhật ký thi công');
}

function deleteConstructionLogEntry(catId, pkgId, entryId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const pkg = cat?.packages.find(p => p.id === pkgId);
  if (!pkg?.constructionLog) return;
  pkg.constructionLog = pkg.constructionLog.filter(e => e.id !== entryId);
  saveState();
  document.getElementById('log-list-detail').innerHTML = renderConstructionLogHTML(pkg, catId, pkgId);
  showToast('Đã xóa mục nhật ký', 'info');
}

// ---- Category CRUD ----
function editCategory(catId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  if (!cat) return;
  openModal('Sửa danh mục', `
    <div class="form-grid">
      <div class="form-group"><label>Mã danh mục</label><input type="text" id="f-cat-code" value="${esc(cat.code)}"></div>
      <div class="form-group"><label>Màu sắc</label><input type="color" id="f-cat-color" value="${cat.color || '#3b82f6'}"></div>
      <div class="form-group"><label>Tổng mức đầu tư (VNĐ)</label><input type="number" id="f-cat-investTotal" value="${cat.investTotal || ''}"></div>
      <div class="form-group full-width"><label>Tên danh mục</label><input type="text" id="f-cat-name" value="${esc(cat.name)}"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveEditCategory('${catId}')">
      <span class="material-symbols-rounded">save</span> Cập nhật
    </button>
  `);
}

function saveEditCategory(catId) {
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  if (!cat) return;
  cat.code = document.getElementById('f-cat-code').value.trim();
  cat.name = document.getElementById('f-cat-name').value.trim();
  cat.color = document.getElementById('f-cat-color').value;
  cat.investTotal = Number(document.getElementById('f-cat-investTotal').value) || 0;
  addAudit(project, 'update', 'category', cat.name);
  saveState();
  closeModal();
  renderAll();
  showToast('Đã cập nhật danh mục');
}

function deleteCategory(catId) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  if (!cat) return;
  openModal('Xác nhận xóa danh mục', `
    <div class="confirm-content">
      <span class="material-symbols-rounded">warning</span>
      <p>Bạn có chắc chắn muốn xóa danh mục:</p>
      <p class="confirm-name">"${esc(cat.code)}. ${esc(cat.name)}"?</p>
      <p style="color:var(--accent-red);font-size:0.8rem;margin-top:8px">Toàn bộ ${cat.packages.length} gói thầu trong danh mục sẽ bị xóa.</p>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-danger" onclick="confirmDeleteCategory('${catId}')">
      <span class="material-symbols-rounded">delete</span> Xóa
    </button>
  `);
}

function confirmDeleteCategory(catId) {
  const project = getCurrentProject();
  const cat = project.categories.find(c => c.id === catId);
  const catName = cat ? cat.name : '';
  project.categories = project.categories.filter(c => c.id !== catId);
  addAudit(project, 'delete', 'category', catName);
  saveState();
  closeModal();
  renderAll();
  showToast('Đã xóa danh mục', 'info');
}

// ---- Add Category ----
document.getElementById('btn-add-category').addEventListener('click', () => {
  if (!requireEditPermission()) return;
  openModal('Thêm danh mục mới', `
    <div class="form-grid">
      <div class="form-group"><label>Mã danh mục</label><input type="text" id="f-cat-code" placeholder="VII"></div>
      <div class="form-group"><label>Màu sắc</label><input type="color" id="f-cat-color" value="#3b82f6"></div>
      <div class="form-group"><label>Tổng mức đầu tư (VNĐ)</label><input type="number" id="f-cat-investTotal" placeholder="Nhập tổng mức đầu tư của danh mục"></div>
      <div class="form-group full-width"><label>Tên danh mục</label><input type="text" id="f-cat-name" placeholder="Tên danh mục chi phí"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveNewCategory()">
      <span class="material-symbols-rounded">save</span> Thêm
    </button>
  `);
});

function saveNewCategory() {
  const code = document.getElementById('f-cat-code').value.trim();
  const name = document.getElementById('f-cat-name').value.trim();
  const color = document.getElementById('f-cat-color').value;
  const investTotal = Number(document.getElementById('f-cat-investTotal').value) || 0;
  if (!name) { showToast('Vui lòng nhập tên danh mục', 'error'); return; }
  const project = getCurrentProject();
  project.categories.push({ id: generateId(), code: code || '?', name, color, investTotal, packages: [] });
  addAudit(project, 'create', 'category', name);
  saveState();
  closeModal();
  renderAll();
  showToast('Đã thêm danh mục: ' + name);
}

// ---- Add / Edit Project ----
function getProjectFormHTML(proj = null) {
  const isSmall = !!(proj?.smallProject);
  return `
    <div class="form-grid">
<div class="form-group full-width"><label>Tên dự án *</label><input type="text" id="f-proj-name" value="${esc(proj?.name || '')}"></div>
    <div class="form-group full-width"><label>Tên đầy đủ</label><input type="text" id="f-proj-fullName" value="${esc(proj?.fullName || '')}"></div>
    <div class="form-group"><label>Chủ đầu tư</label><input type="text" id="f-proj-owner" value="${esc(proj?.owner || '')}"></div>
    <div class="form-group"><label>Mã số thuế CĐT</label><input type="text" id="f-proj-taxCode" value="${esc(proj?.investorTaxCode || '')}"></div>
    <div class="form-group"><label>Địa điểm</label><input type="text" id="f-proj-location" value="${esc(proj?.location || '')}"></div>
    <div class="form-group"><label>Năm bắt đầu thực hiện</label><input type="number" id="f-proj-startYear" min="1900" max="2200" value="${proj?.startYear ?? ''}" placeholder="Ví dụ: 2025"></div>
    <div class="form-group"><label>Năm kết thúc dự kiến</label><input type="number" id="f-proj-endYear" min="1900" max="2200" value="${proj?.endYear ?? ''}" placeholder="Ví dụ: 2027"></div>
    <div class="form-group">
      <label>Nhóm dự án</label>
      <select id="f-proj-group">
        <option value="">— Chọn —</option>
        ${['Quan trọng quốc gia','Nhóm A','Nhóm B','Nhóm C'].map(g => `<option value="${g}" ${proj?.projectGroup === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Nguồn vốn đầu tư</label>
      <select id="f-proj-investmentSource">
        <option value="">— Chọn —</option>
        ${['Đầu tư công','PPP','Chi thường xuyên ngân sách','Vốn khác'].map(s => `<option value="${s}" ${proj?.investmentSource === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
      <div class="form-group"><label>Tổng mức đầu tư (VNĐ)</label><input type="number" id="f-proj-totalInvestment" value="${proj?.totalInvestment ?? ''}"></div>
      <div class="form-group"><label>Năm kế hoạch vốn</label><input type="number" id="f-proj-planYear" min="1900" max="2200" value="${proj?.planYear ?? new Date().getFullYear()}"></div>
      <div class="form-group"><label>Kế hoạch vốn của năm (VNĐ)</label><input type="number" id="f-proj-annualPlan" value="${proj?.annualPlan ?? ''}"><p class="field-hint">Số vốn được giao riêng trong năm kế hoạch.</p></div>
      <div class="form-group"><label>Lũy kế vốn đã phân bổ (VNĐ)</label><input type="number" id="f-proj-cumulativePlan" value="${proj?.cumulativePlan ?? ''}"><p class="field-hint">Tổng vốn đã giao từ đầu dự án đến hết năm kế hoạch.</p></div>

      <div class="form-group full-width" style="grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px">
        <input type="checkbox" id="f-proj-small" ${isSmall ? 'checked' : ''} style="width:auto;height:16px;width:16px" onchange="toggleSmallProjectForm(this.checked)">
        <label for="f-proj-small" style="text-transform:none;font-size:0.9rem;font-weight:600;color:var(--accent-blue);cursor:pointer;margin:0">
          Đánh dấu là dự án nhỏ lẻ / giá trị thấp
        </label>
        <span class="material-symbols-rounded" style="color:var(--accent-blue)">lightbulb</span>
      </div>
      <div class="form-group full-width" id="f-proj-small-note" style="grid-column:1/-1;${isSmall ? '' : 'display:none'}">
        <p style="font-size:0.8rem;color:var(--text-secondary);background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;line-height:1.5">
          Dự án nhỏ lẻ thường chỉ có 1-2 gói thầu, giá trị thấp: hệ thống sẽ ẩn bớt các mục phức tạp (phân loại pháp lý, BCNCKT/thẩm định, giấy phép xây dựng) và cho phép quyết toán trọn gói một lần.
        </p>
      </div>

      <div id="proj-heavy-sections" ${isSmall ? 'style="display:none"' : ''}>
      <div class="form-section-title"><span class="material-symbols-rounded">category</span> Phân loại & Pháp lý dự án</div>
      <div class="form-group">
        <label>Loại dự án</label>
        <select id="f-proj-type">
          <option value="">— Chọn —</option>
          ${PROJECT_TYPES.map(t => `<option value="${t}" ${proj?.projectType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cấp công trình</label>
        <select id="f-proj-grade">
          <option value="">— Chọn —</option>
          ${BUILDING_GRADES.map(g => `<option value="${g}" ${proj?.buildingGrade === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Mã định danh dự án</label>
        <input type="text" id="f-proj-code" value="${esc(proj?.identifierCode || '')}" placeholder="Mã trên HTTT quốc gia">
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end;gap:6px">
        <label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:0.85rem">
          <input type="checkbox" id="f-proj-bim" ${proj?.bimRequired ? 'checked' : ''} style="width:auto"> Thuộc diện bắt buộc áp dụng BIM
        </label>
      </div>

      <div class="form-section-title"><span class="material-symbols-rounded">fact_check</span> Báo cáo nghiên cứu khả thi (BCNCKT) & Thẩm định</div>
      <div class="form-group">
        <label>Trạng thái thẩm định</label>
        <select id="f-proj-feas-status">
          ${FEASIBILITY_STATUSES.map(s => `<option value="${s}" ${(proj?.feasibility?.status || FEASIBILITY_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Ngày nộp thẩm định</label><input type="date" id="f-proj-feas-submitted" value="${proj?.feasibility?.submittedDate || ''}"></div>
      <div class="form-group"><label>Ngày có kết quả thẩm định</label><input type="date" id="f-proj-feas-appraised" value="${proj?.feasibility?.appraisedDate || ''}"></div>

      <div class="form-section-title"><span class="material-symbols-rounded">apartment</span> Công trình thuộc dự án</div>
      <div id="constructions-list">
        ${(proj?.constructions || []).length === 0 && !proj?.permit ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.78rem">
          <input placeholder="Tên công trình" style="flex:1;min-width:150px" class="cons-name">
          <input placeholder="Loại công trình" style="width:120px" class="cons-type">
          <input placeholder="Cấp" style="width:80px" class="cons-grade">
          <input placeholder="Số GPXD" style="width:100px" class="cons-permit">
          <input type="date" style="width:130px" class="cons-permit-date" title="Ngày cấp GPXD">
          <input placeholder="Quy mô (VD: 5 tầng, 2000m²)" style="flex:1;min-width:150px" class="cons-specs">
          <button type="button" class="btn-icon" onclick="this.closest('div').remove()" title="Xóa"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>
        </div>` : (proj?.constructions || []).map(cons => `
        <div style="display:flex;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.78rem;margin-bottom:6px">
          <input value="${esc(cons.name)}" placeholder="Tên công trình" style="flex:1;min-width:150px" class="cons-name">
          <input value="${esc(cons.type)}" placeholder="Loại công trình" style="width:120px" class="cons-type">
          <input value="${esc(cons.grade)}" placeholder="Cấp" style="width:80px" class="cons-grade">
          <input value="${esc(cons.permitNumber)}" placeholder="Số GPXD" style="width:100px" class="cons-permit">
          <input type="date" value="${cons.permitIssueDate || ''}" style="width:130px" class="cons-permit-date" title="Ngày cấp GPXD">
          <input value="${esc(cons.mainSpecs)}" placeholder="Quy mô (VD: 5 tầng, 2000m²)" style="flex:1;min-width:150px" class="cons-specs">
          <button type="button" class="btn-icon" onclick="this.closest('div').remove()" title="Xóa"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>
        </div>`).join('')}
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addConstructionRow()" style="margin-top:4px">+ Thêm công trình</button>

      <div class="form-section-title"><span class="material-symbols-rounded">engineering</span> Nhân sự chủ chốt (Năng lực cá nhân)</div>
      <div id="indi-list">
        ${(proj?.individuals || []).map((ind, i) => `
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.78rem">
          <input value="${esc(ind.fullName)}" placeholder="Họ tên" style="flex:1;min-width:100px" class="indi-name">
          <input value="${esc(ind.nationalId)}" placeholder="CCCD" style="width:100px" class="indi-id">
          <input value="${esc(ind.practiceField)}" placeholder="Lĩnh vực" style="width:100px" class="indi-field">
          <input value="${esc(ind.certificateLevel)}" placeholder="Hạng" style="width:80px" class="indi-level">
          <input value="${esc(ind.certificateNumber)}" placeholder="Số CCHN" style="width:100px" class="indi-cert">
          <input type="date" value="${ind.expiryDate || ''}" style="width:130px" class="indi-expiry">
          <button type="button" class="btn-icon" onclick="this.closest('div').remove()" title="Xóa"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>
        </div>`).join('')}
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addIndividualRow()" style="margin-top:4px">+ Thêm nhân sự</button>

      <div class="form-section-title"><span class="material-symbols-rounded">receipt_long</span> Quyết toán dự án hoàn thành</div>
      <div class="form-group">
        <label>Trạng thái quyết toán</label>
        <select id="f-proj-settlement-status">
          ${SETTLEMENT_STATUSES.map(s => `<option value="${s}" ${(proj?.settlement?.status || SETTLEMENT_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Giá trị quyết toán (VNĐ)</label><input type="number" id="f-proj-settlement-value" value="${proj?.settlement?.totalValue ?? ''}"></div>
      <div class="form-group"><label>Ngày phê duyệt quyết toán</label><input type="date" id="f-proj-settlement-date" value="${proj?.settlement?.approvedDate || ''}"></div>
      <div class="form-group">
        <label>Loại quyết toán</label>
        <select id="f-proj-settlement-type">
          <option value="completion" ${(proj?.settlementType || 'completion') === 'completion' ? 'selected' : ''}>Dự án hoàn thành</option>
          <option value="annual" ${proj?.settlementType === 'annual' ? 'selected' : ''}>Niên độ ngân sách</option>
        </select>
      </div>
      <div class="form-group"><label>Ngày nộp hồ sơ quyết toán</label><input type="date" id="f-proj-settlement-submissionDate" value="${proj?.settlementSubmissionDate || ''}"><p style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Dùng để xác định phiên bản mẫu biểu áp dụng</p></div>
    </div>
  `;
}

function toggleSmallProjectForm(isSmall) {
  const heavy = document.getElementById('proj-heavy-sections');
  const note = document.getElementById('f-proj-small-note');
  if (heavy) heavy.style.display = isSmall ? 'none' : '';
  if (note) note.style.display = isSmall ? '' : 'none';
}

function addConstructionRow() {
  const list = document.getElementById('constructions-list');
  if (!list) return;
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.78rem;margin-bottom:6px';
  d.innerHTML = `
    <input placeholder="Tên công trình" style="flex:1;min-width:150px" class="cons-name">
    <input placeholder="Loại công trình" style="width:120px" class="cons-type">
    <input placeholder="Cấp" style="width:80px" class="cons-grade">
    <input placeholder="Số GPXD" style="width:100px" class="cons-permit">
    <input type="date" style="width:130px" class="cons-permit-date" title="Ngày cấp GPXD">
    <input placeholder="Quy mô (VD: 5 tầng, 2000m²)" style="flex:1;min-width:150px" class="cons-specs">
    <button type="button" class="btn-icon" onclick="this.closest('div').remove()" title="Xóa"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>`;
  list.appendChild(d);
}

function collectConstructions() {
  const rows = document.querySelectorAll('#constructions-list > div');
  return Array.from(rows).map(r => ({
    id: generateId(),
    name: r.querySelector('.cons-name')?.value?.trim() || '',
    type: r.querySelector('.cons-type')?.value?.trim() || '',
    grade: r.querySelector('.cons-grade')?.value?.trim() || '',
    permitNumber: r.querySelector('.cons-permit')?.value?.trim() || '',
    permitIssueDate: r.querySelector('.cons-permit-date')?.value || '',
    mainSpecs: r.querySelector('.cons-specs')?.value?.trim() || ''
  })).filter(c => c.name);
}

function addIndividualRow() {
  const container = document.getElementById('indi-list');
  if (!container) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.78rem';
  div.innerHTML = `
    <input placeholder="Họ tên" style="flex:1;min-width:100px" class="indi-name">
    <input placeholder="CCCD" style="width:100px" class="indi-id">
    <input placeholder="Lĩnh vực" style="width:100px" class="indi-field">
    <input placeholder="Hạng" style="width:80px" class="indi-level">
    <input placeholder="Số CCHN" style="width:100px" class="indi-cert">
    <input type="date" style="width:130px" class="indi-expiry">
    <button type="button" class="btn-icon" onclick="this.closest('div').remove()" title="Xóa"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>`;
  container.appendChild(div);
}

function getProjectFormData() {
  return {
    name: document.getElementById('f-proj-name').value.trim(),
    fullName: document.getElementById('f-proj-fullName').value.trim(),
    owner: document.getElementById('f-proj-owner').value.trim(),
    investorTaxCode: document.getElementById('f-proj-taxCode').value.trim(),
    location: document.getElementById('f-proj-location').value.trim(),
    startYear: Number(document.getElementById('f-proj-startYear').value) || null,
    endYear: Number(document.getElementById('f-proj-endYear').value) || null,
    projectGroup: document.getElementById('f-proj-group').value,
    investmentSource: document.getElementById('f-proj-investmentSource').value,
    totalInvestment: Number(document.getElementById('f-proj-totalInvestment').value) || 0,
    planYear: Number(document.getElementById('f-proj-planYear').value) || new Date().getFullYear(),
    annualPlan: Number(document.getElementById('f-proj-annualPlan').value) || 0,
    cumulativePlan: Number(document.getElementById('f-proj-cumulativePlan').value) || 0,
    smallProject: document.getElementById('f-proj-small').checked,
    projectType: document.getElementById('f-proj-type').value,
    buildingGrade: document.getElementById('f-proj-grade').value,
    identifierCode: document.getElementById('f-proj-code').value.trim(),
    bimRequired: document.getElementById('f-proj-bim').checked,
    feasibility: {
      status: document.getElementById('f-proj-feas-status').value,
      submittedDate: document.getElementById('f-proj-feas-submitted').value,
      appraisedDate: document.getElementById('f-proj-feas-appraised').value
    },
    constructions: collectConstructions(),
    individuals: (function(){
      const rows = document.querySelectorAll('#indi-list > div');
      return Array.from(rows).map(r => ({
        id: generateId(),
        fullName: r.querySelector('.indi-name')?.value?.trim() || '',
        nationalId: r.querySelector('.indi-id')?.value?.trim() || '',
        practiceField: r.querySelector('.indi-field')?.value?.trim() || '',
        certificateLevel: r.querySelector('.indi-level')?.value?.trim() || '',
        certificateNumber: r.querySelector('.indi-cert')?.value?.trim() || '',
        expiryDate: r.querySelector('.indi-expiry')?.value || ''
      })).filter(i => i.fullName);
    })(),
    settlement: {
      status: document.getElementById('f-proj-settlement-status').value,
      totalValue: Number(document.getElementById('f-proj-settlement-value').value) || 0,
      approvedDate: document.getElementById('f-proj-settlement-date').value
    },
    settlementType: document.getElementById('f-proj-settlement-type').value,
    settlementSubmissionDate: document.getElementById('f-proj-settlement-submissionDate').value
  };
}

function validateProjectYears(data) {
  if (data.startYear && data.endYear && data.endYear < data.startYear) {
    showToast('Năm kết thúc dự kiến không được nhỏ hơn năm bắt đầu', 'error');
    return false;
  }
  if (data.planYear && data.startYear && data.planYear < data.startYear) {
    showToast('Năm kế hoạch vốn không được trước năm bắt đầu dự án', 'error');
    return false;
  }
  if (data.planYear && data.endYear && data.planYear > data.endYear) {
    showToast('Năm kế hoạch vốn không được sau năm kết thúc dự kiến', 'error');
    return false;
  }
  if (data.cumulativePlan < data.annualPlan) {
    showToast('Lũy kế vốn đã phân bổ không được nhỏ hơn kế hoạch vốn của năm', 'error');
    return false;
  }
  return true;
}

document.getElementById('btn-add-project').addEventListener('click', () => {
  if (!requireEditPermission()) return;
  openModal('Thêm dự án mới', getProjectFormHTML(), `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveNewProject()">
      <span class="material-symbols-rounded">save</span> Tạo dự án
    </button>
  `);
});

function saveNewProject() {
  const data = getProjectFormData();
  if (!data.name) { showToast('Vui lòng nhập tên dự án', 'error'); return; }
  if (!validateProjectYears(data)) return;
  const proj = { id: generateId(), ...data, categories: [] };
  state.projects.push(proj);
  state.currentProjectId = proj.id;
  addAudit(proj, 'create', 'project', data.name);
  saveState();
  closeModal();
  renderAll();
  renderProjectSelector();
  showToast('Đã tạo dự án: ' + data.name);
}

document.getElementById('btn-edit-project').addEventListener('click', () => {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  if (!project) { showToast('Chưa có dự án nào để sửa', 'error'); return; }
  openModal('Sửa thông tin dự án', getProjectFormHTML(project), `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveEditProject()">
      <span class="material-symbols-rounded">save</span> Cập nhật
    </button>
  `);
});

function saveEditProject() {
  const data = getProjectFormData();
  if (!data.name) { showToast('Vui lòng nhập tên dự án', 'error'); return; }
  if (!validateProjectYears(data)) return;
  const project = getCurrentProject();
  if (!project) return;
  Object.assign(project, data);
  addAudit(project, 'update', 'project', data.name);
  saveState();
  closeModal();
  renderAll();
  renderProjectSelector();
  showToast('Đã cập nhật dự án: ' + data.name);
}

// ============================================================
// SECTION 8: PDF MANAGEMENT
// ============================================================
async function handlePDFUpload(catId, pkgId) {
  if (!requireEditPermission()) return;
  const input = document.getElementById('pdf-file-input');
  const file = input.files?.[0];
  if (!file) return;
  if (!isAllowedUpload(file)) {
    showToast('Định dạng file không được hỗ trợ', 'error');
    input.value = '';
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('File quá lớn (tối đa 50MB)', 'error');
    input.value = '';
    return;
  }

  try {
    const meta = await apiUploadPDF(file);

    const project = getCurrentProject();
    const cat = project.categories.find(c => c.id === catId);
    const pkg = cat?.packages.find(p => p.id === pkgId);
    if (pkg) {
      if (!pkg.pdfs) pkg.pdfs = [];
      pkg.pdfs.push(meta);
      saveState();
      viewPackageDetail(catId, pkgId); // Re-render detail
      showToast('Đã tải lên: ' + meta.name);
    }
  } catch (err) {
    showToast('Lỗi khi tải file: ' + err.message, 'error');
  }
  input.value = '';
}

async function handlePDFUploadFromForm(catId, pkgId) {
  if (!requireEditPermission()) return;
  const input = document.getElementById('pdf-file-input-form');
  const file = input.files?.[0];
  if (!file) return;
  if (!isAllowedUpload(file)) {
    showToast('Định dạng file không được hỗ trợ', 'error');
    input.value = '';
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('File quá lớn (tối đa 50MB)', 'error');
    input.value = '';
    return;
  }

  try {
    const meta = await apiUploadPDF(file);
    const category = document.getElementById('pdf-category-form')?.value || '';
    const pdfWithCategory = { ...meta, category };
    if (pkgId) {
      const project = getCurrentProject();
      const cat = project.categories.find(c => c.id === catId);
      const pkg = cat?.packages.find(p => p.id === pkgId);
      if (pkg) {
        if (!pkg.pdfs) pkg.pdfs = [];
        pkg.pdfs.push(pdfWithCategory);
        saveState();
        renderFormPDFList(catId, pkgId, pkg.pdfs);
      }
    } else {
      tempUploadedPDFs.push(pdfWithCategory);
      renderFormPDFList(catId, null, tempUploadedPDFs);
    }
    showToast('Đã tải lên: ' + meta.name);
  } catch (err) {
    showToast('Lỗi khi tải file: ' + err.message, 'error');
  }
  input.value = '';
}

function renderFormPDFList(catId, pkgId, pdfs) {
  const container = document.getElementById('pdf-list-form');
  if (!container) return;
  if (!pdfs || pdfs.length === 0) {
    container.innerHTML = '<p class="pdf-empty">Chưa có file đính kèm</p>';
    return;
  }
  container.innerHTML = pdfs.map(pdf => `
    <div class="pdf-item">
      <span class="material-symbols-rounded">attach_file</span>
      <span class="pdf-name" onclick="viewPDF('${pdf.id}')" title="Nhấn để xem">${esc(pdf.name)}</span>
      <span class="pdf-size">${formatFileSize(pdf.size)}</span>
      ${pdf.category ? `<span class="badge badge-neutral" style="font-size:0.65rem">${esc(pdf.category)}</span>` : ''}
      <button type="button" class="btn-icon btn-sm" title="Xóa file" onclick="${pkgId ? `removePDFFromForm('${catId}','${pkgId}','${pdf.id}')` : `removeTempPDF('${pdf.id}')`}">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `).join('');
}

async function removePDFFromForm(catId, pkgId, pdfId) {
  if (!requireEditPermission()) return;
  try {
    await apiDeletePDF(pdfId);
    const project = getCurrentProject();
    const cat = project.categories.find(c => c.id === catId);
    const pkg = cat?.packages.find(p => p.id === pkgId);
    if (pkg) {
      pkg.pdfs = (pkg.pdfs || []).filter(f => f.id !== pdfId);
      saveState();
      renderFormPDFList(catId, pkgId, pkg.pdfs);
      showToast('Đã xóa file đính kèm', 'info');
    }
  } catch (err) {
    showToast('Lỗi xóa file: ' + err.message, 'error');
  }
}

async function removeTempPDF(pdfId) {
  try {
    await apiDeletePDF(pdfId);
    tempUploadedPDFs = tempUploadedPDFs.filter(f => f.id !== pdfId);
    renderFormPDFList('', null, tempUploadedPDFs);
    showToast('Đã xóa file đính kèm', 'info');
  } catch (err) {
    showToast('Lỗi xóa file: ' + err.message, 'error');
  }
}

function viewPDF(pdfId) {
  window.open(`${API_BASE}/pdfs/${pdfId}`, '_blank');
}

async function removePDF(catId, pkgId, pdfId) {
  if (!requireEditPermission()) return;
  try {
    await apiDeletePDF(pdfId);
    const project = getCurrentProject();
    const cat = project.categories.find(c => c.id === catId);
    const pkg = cat?.packages.find(p => p.id === pkgId);
    if (pkg) {
      pkg.pdfs = (pkg.pdfs || []).filter(f => f.id !== pdfId);
      saveState();
      viewPackageDetail(catId, pkgId); // Re-render
      showToast('Đã xóa file đính kèm', 'info');
    }
  } catch (err) {
    showToast('Lỗi xóa file: ' + err.message, 'error');
  }
}

// ============================================================
// SECTION 9: EVENT HANDLERS & INIT
// ============================================================
function toggleCategory(headerEl) {
  const group = headerEl.closest('.category-group');
  group.classList.toggle('expanded');
}

function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const view = document.getElementById('view-' + viewName);
  if (view) view.classList.add('active');
  document.querySelector(`.nav-tab[data-view="${viewName}"]`)?.classList.add('active');

  if (viewName === 'dashboard') renderDashboard();
  else if (viewName === 'packages') renderPackages();
  else if (viewName === 'initiation') renderInitiationView();
  else if (viewName === 'settlement') renderSettlementView();
  else if (viewName === 'reports') renderReports();
}

function renderAll() {
  renderProjectInfoBar();
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'packages') renderPackages();
  else if (state.currentView === 'initiation') renderInitiationView();
  else if (state.currentView === 'settlement') renderSettlementView();
  else if (state.currentView === 'reports') renderReports();
}

// Nav tabs
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

// Project selector
document.getElementById('project-selector').addEventListener('change', (e) => {
  state.currentProjectId = e.target.value;
  saveState();
  renderAll();
});

// Search
document.getElementById('search-packages')?.addEventListener('input', (e) => {
  renderPackages(e.target.value);
});

// ============================================================
// SECTION 9: ACCOUNT & USER MANAGEMENT
// ============================================================
function renderAccountUI() {
  document.getElementById('current-username').textContent = currentUser.username;
  document.getElementById('btn-manage-users').classList.toggle('hidden', currentUser.role !== 'admin');
  document.getElementById('btn-backup-restore')?.classList.toggle('hidden', currentUser.role !== 'admin');
  document.getElementById('btn-sys-config')?.classList.toggle('hidden', currentUser.role !== 'admin');
  isReadOnly = currentUser.role !== 'admin';
  document.body.classList.toggle('read-only', isReadOnly);
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await apiLogout();
  window.location.href = '/login.html';
});

document.getElementById('btn-manage-users').addEventListener('click', openUserManagement);
document.getElementById('btn-backup-restore')?.addEventListener('click', openBackupRestoreModal);
document.getElementById('btn-sys-config')?.addEventListener('click', openSysConfigModal);
document.getElementById('btn-audit-log')?.addEventListener('click', renderAuditModal);

function openBackupRestoreModal() {
  openModal('Sao lưu & Phục hồi dữ liệu', `
    <div class="backup-restore-container" style="display:flex;flex-direction:column;gap:20px">
      <div class="backup-section glass-card" style="padding:16px;border-radius:8px">
        <h4 style="margin-bottom:8px;color:var(--accent-cyan);display:flex;align-items:center;gap:6px">
          <span class="material-symbols-rounded">download</span> 1. Sao lưu dữ liệu toàn hệ thống
        </h4>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Xuất toàn bộ dữ liệu dự án, danh mục, gói thầu và các file đính kèm ra file dự phòng (.json).
        </p>
        <button class="btn btn-primary" onclick="downloadBackupFile()">
          <span class="material-symbols-rounded">download</span> Tải bản sao lưu (.json)
        </button>
      </div>

      <div class="restore-section glass-card" style="padding:16px;border-radius:8px">
        <h4 style="margin-bottom:8px;color:var(--accent-amber);display:flex;align-items:center;gap:6px">
          <span class="material-symbols-rounded">upload</span> 2. Phục hồi dữ liệu
        </h4>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Chọn file sao lưu (.json) để khôi phục toàn bộ dữ liệu dự án và file đính kèm. 
          <span style="color:var(--accent-red);font-weight:600">Lưu ý: Dữ liệu hiện tại sẽ bị ghi đè.</span>
        </p>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="file" id="restore-file-input" accept=".json" style="font-size:0.85rem">
          <button class="btn btn-secondary" onclick="processRestoreFile()">
            <span class="material-symbols-rounded">restore</span> Phục hồi ngay
          </button>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
  `);
}

function downloadBackupFile() {
  window.open('/api/backup', '_blank');
  showToast('Đang tải bản sao lưu dữ liệu...', 'info');
}

async function processRestoreFile() {
  const input = document.getElementById('restore-file-input');
  const file = input?.files?.[0];
  if (!file) {
    showToast('Vui lòng chọn file sao lưu (.json)', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backupData = JSON.parse(e.target.result);
      if (!backupData || !backupData.state) {
        showToast('File sao lưu không hợp lệ', 'error');
        return;
      }
      if (!confirm('Bạn có chắc chắn muốn phục hồi dữ liệu từ file này? Dữ liệu hiện tại sẽ bị ghi đè.')) {
        return;
      }
      showToast('Đang phục hồi dữ liệu...', 'info');
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Lỗi phục hồi dữ liệu');
      showToast('Phục hồi dữ liệu thành công!');
      closeModal();
      await loadState();
      renderAll();
      renderProjectSelector();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ---- Cấu hình nghiệp vụ (admin) ----
function openSysConfigModal() {
  const cfg = state.config || {};
  const lim = cfg.limits || {};
  const da = lim.directAppointment || {};
  const tpl = cfg.templates || {};
  const ag = (cfg.agencies || []).join('\n');
  const lst = cfg.lists || {};
  const legalDocs = cfg.legalDocuments || [];

  function arrToText(a) { return (Array.isArray(a) ? a : []).join('\n'); }

  openModal('Cấu hình nghiệp vụ', `
    <style>
      .cfg-tabs { display:flex; gap:4px; margin-bottom:14px; border-bottom:2px solid var(--border); padding-bottom:0 }
      .cfg-tab { padding:8px 16px; cursor:pointer; border:none; background:none; color:var(--text-secondary); font-size:0.85rem; font-weight:600; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .15s }
      .cfg-tab.active { color:var(--accent-cyan); border-bottom-color:var(--accent-cyan) }
      .cfg-panel { display:none; max-height:55vh; overflow-y:auto; padding-right:4px }
      .cfg-panel.show { display:block }
      .cfg-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px }
      .cfg-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px }
      .cfg-row { display:flex; align-items:center; gap:8px }
      .cfg-row label { flex:0 0 180px; font-size:0.82rem; color:var(--text-secondary); white-space:nowrap }
      .cfg-row input { flex:1 }
      .cfg-row input[type="number"] { text-align:right }
      .cfg-section-title { font-size:0.8rem; font-weight:700; color:var(--accent-cyan); padding:10px 0 4px; border-bottom:1px solid var(--border); margin-bottom:8px; grid-column:1/-1; letter-spacing:.03em }
      .cfg-legal-doc { padding:8px 12px; border-left:3px solid var(--accent-cyan); background:rgba(6,182,212,.04); border-radius:0 6px 6px 0; margin-bottom:6px; font-size:0.8rem }
      .cfg-legal-doc .doc-type { color:var(--accent-cyan); font-weight:700; font-size:0.7rem; text-transform:uppercase; letter-spacing:.05em }
      .cfg-legal-doc .doc-title { font-weight:600; color:var(--text-primary) }
      .cfg-legal-doc .doc-meta { color:var(--text-muted); font-size:0.75rem; margin-top:2px }
    </style>
    <div class="cfg-tabs">
      <button class="cfg-tab active" onclick="document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('show'));document.getElementById('cfg-panel-limits').classList.add('show');document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">Hạn mức</button>
      <button class="cfg-tab" onclick="document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('show'));document.getElementById('cfg-panel-templates').classList.add('show');document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">Mẫu biểu</button>
      <button class="cfg-tab" onclick="document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('show'));document.getElementById('cfg-panel-lists').classList.add('show');document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">Danh mục</button>
      <button class="cfg-tab" onclick="document.querySelectorAll('.cfg-panel').forEach(p=>p.classList.remove('show'));document.getElementById('cfg-panel-legal').classList.add('show');document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')">Văn bản PL</button>
    </div>

    <div id="cfg-panel-limits" class="cfg-panel show">
      <div class="cfg-section-title">HẠN MỨC CHỈ ĐỊNH THẦU (K4 Đ78 NĐ 214/2025)</div>
      <div class="cfg-grid">
        <div class="cfg-row"><label>Gói tư vấn</label><input id="cfg-limit-consulting" type="number" step="1" value="${da.consulting ?? 800000000}"></div>
        <div class="cfg-row"><label>Gói xây lắp</label><input id="cfg-limit-construction" type="number" step="1" value="${da.construction ?? 2000000000}"></div>
        <div class="cfg-row"><label>Gói hàng hóa</label><input id="cfg-limit-goods" type="number" step="1" value="${da.goods ?? 2000000000}"></div>
        <div class="cfg-row"><label>Gói hỗn hợp</label><input id="cfg-limit-mixed" type="number" step="1" value="${da.mixed ?? 2000000000}"></div>
        <div class="cfg-row"><label>Gói phi tư vấn</label><input id="cfg-limit-nonConsulting" type="number" step="1" value="${da.nonConsulting ?? 2000000000}"></div>
        <div class="cfg-row"><label>Mua sắm (không dự án)</label><input id="cfg-limit-nonProject" type="number" step="1" value="${da.nonProject ?? 500000000}"></div>
      </div>
      <div class="cfg-section-title" style="margin-top:12px">NGƯỠNG KHÁC</div>
      <div class="cfg-grid">
        <div class="cfg-row"><label>Bắt buộc BCNCKT</label><input id="cfg-limit-ktkt" type="number" step="1" value="${lim.ktkt ?? 20000000000}"></div>
        <div class="cfg-row"><label>Cảnh báo trước hạn HĐ (ngày)</label><input id="cfg-deadline-days" type="number" step="1" value="${cfg.contractDeadlineWarnDays ?? 30}"></div>
      </div>
    </div>

    <div id="cfg-panel-templates" class="cfg-panel">
      <div class="cfg-section-title">MẪU QUYẾT TOÁN NIÊN ĐỘ (TT 91/2025 — hiệu lực 26/09/2025)</div>
      <div class="cfg-grid">
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Mẫu QTNĐ</label><textarea id="cfg-tpl-qtnd" rows="5" style="width:100%">${esc(arrToText(tpl.qtnd))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Mẫu QTDA</label><textarea id="cfg-tpl-qtda" rows="5" style="width:100%">${esc(arrToText(tpl.qtda))}</textarea></div>
      </div>
      <p style="font-size:0.72rem;color:var(--text-muted);margin:8px 0 0;padding:6px 10px;background:#fffbeb;border-radius:6px;line-height:1.5">
        <strong>Lưu ý:</strong> Mẫu hiện hành (TT 73/2026) cho quyết toán dự án hoàn thành được chọn tự động theo ngày nộp hồ sơ của từng dự án, không chỉnh tay ở đây. Xem bảng phiên bản đầy đủ trong tab "Văn bản PL".
      </p>
    </div>

    <div id="cfg-panel-lists" class="cfg-panel">
      <div class="cfg-section-title">CƠ QUAN PHÊ DUYỆT CHỦ TRƯƠNG</div>
      <textarea id="cfg-agencies" rows="3" style="width:100%">${esc(ag)}</textarea>
      <div class="cfg-section-title" style="margin-top:12px">DANH MỤC PHÂN LOẠI</div>
      <div class="cfg-grid">
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Loại dự án</label><textarea id="cfg-list-projectTypes" rows="3" style="width:100%">${esc(arrToText(lst.projectTypes))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Cấp công trình</label><textarea id="cfg-list-buildingGrades" rows="3" style="width:100%">${esc(arrToText(lst.buildingGrades))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Loại hợp đồng</label><textarea id="cfg-list-contractTypes" rows="3" style="width:100%">${esc(arrToText(lst.contractTypes))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">BCNCKT</label><textarea id="cfg-list-feasibility" rows="2" style="width:100%">${esc(arrToText(lst.feasibilityStatuses))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Nghiệm thu</label><textarea id="cfg-list-acceptance" rows="2" style="width:100%">${esc(arrToText(lst.acceptanceStatuses))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Quyết toán</label><textarea id="cfg-list-settlement" rows="2" style="width:100%">${esc(arrToText(lst.settlementStatuses))}</textarea></div>
      </div>
    </div>

    <div id="cfg-panel-legal" class="cfg-panel">
      <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px">Danh mục tham khảo — dùng để tra cứu và giải thích mốc hiệu lực của từng văn bản. Không chỉnh sửa trực tiếp (cập nhật qua config file).</p>
      ${legalDocs.map(d => `
        <div class="cfg-legal-doc">
          <span class="doc-type">${esc(d.type)}</span>
          <span class="doc-title">${esc(d.number)} — ${esc(d.title)}</span>
          <div class="doc-meta">
            Ban hành: ${formatDateVN(d.date)} &bull; Hiệu lực: <strong>${formatDateVN(d.effectiveDate)}</strong>
            ${d.replaces ? `&bull; Thay thế: <em>${esc(d.replaces.join(', '))}</em>` : ''}
            ${d.provisions ? d.provisions.map(p => `<br>&nbsp;&nbsp;&#8226; ${esc(p.provision)}: hiệu lực <strong>${formatDateVN(p.effectiveDate)}</strong>`).join('') : ''}
            ${d.note ? `<br><span style="color:var(--accent-amber)">&#9888; ${esc(d.note)}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
    <button class="btn btn-primary" onclick="saveSysConfig()">
      <span class="material-symbols-rounded">save</span> Lưu cấu hình
    </button>
  `);
}

function textToArr(id) {
  const el = document.getElementById(id);
  return el ? el.value.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

async function saveSysConfig() {
  const cfg = {
    limits: {
      directAppointment: {
        consulting: Number(document.getElementById('cfg-limit-consulting')?.value) || 800000000,
        construction: Number(document.getElementById('cfg-limit-construction')?.value) || 2000000000,
        goods: Number(document.getElementById('cfg-limit-goods')?.value) || 2000000000,
        mixed: Number(document.getElementById('cfg-limit-mixed')?.value) || 2000000000,
        nonConsulting: Number(document.getElementById('cfg-limit-nonConsulting')?.value) || 2000000000,
        nonProject: Number(document.getElementById('cfg-limit-nonProject')?.value) || 500000000
      },
      ktkt: Number(document.getElementById('cfg-limit-ktkt')?.value) || 20000000000
    },
    contractDeadlineWarnDays: Number(document.getElementById('cfg-deadline-days')?.value) || 30,
    templates: {
      qtnd: textToArr('cfg-tpl-qtnd'),
      qtda: textToArr('cfg-tpl-qtda')
    },
    agencies: textToArr('cfg-agencies'),
    lists: {
      projectTypes: textToArr('cfg-list-projectTypes'),
      buildingGrades: textToArr('cfg-list-buildingGrades'),
      contractTypes: textToArr('cfg-list-contractTypes'),
      feasibilityStatuses: textToArr('cfg-list-feasibility'),
      acceptanceStatuses: textToArr('cfg-list-acceptance'),
      settlementStatuses: textToArr('cfg-list-settlement')
    }
  };
  try {
    const result = await apiSaveConfig(cfg);
    state.config = result.config;
    applyConfig();
    closeModal();
    showToast('Đã lưu cấu hình nghiệp vụ');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openUserManagement() {
  let users;
  try {
    users = await apiListUsers();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  renderUserManagementModal(users);
}

function renderUserManagementModal(users) {
  const rows = users.map(u => `
    <div class="user-row">
      <span class="user-name">${esc(u.username)}${u.role === 'admin' ? ' <span class="badge badge-info">Admin</span>' : ''}</span>
      <div class="user-actions">
        <button class="btn-icon btn-sm" title="Đổi mật khẩu" onclick="promptChangePassword('${esc(u.id)}','${esc(u.username)}')">
          <span class="material-symbols-rounded">key</span>
        </button>
        ${u.id !== currentUser.id ? `
        <button class="btn-icon btn-sm" title="Xóa" onclick="confirmDeleteUser('${esc(u.id)}','${esc(u.username)}')">
          <span class="material-symbols-rounded">delete</span>
        </button>` : ''}
      </div>
    </div>
  `).join('');

  openModal('Quản lý người dùng', `
    <div class="user-list">${rows || '<p class="pdf-empty">Chưa có người dùng nào.</p>'}</div>
    <div class="form-section-title"><span class="material-symbols-rounded">person_add</span> Thêm người dùng mới</div>
    <div class="form-grid" style="margin-top:12px">
      <div class="form-group full-width">
        <label>Tên đăng nhập *</label>
        <input type="text" id="f-new-username">
      </div>
      <div class="form-group full-width">
        <label>Mật khẩu * (tối thiểu 6 ký tự)</label>
        <input type="password" id="f-new-password">
      </div>
      <div class="form-group full-width">
        <label>Vai trò</label>
        <select id="f-new-role">
          <option value="user">Người dùng</option>
          <option value="admin">Quản trị viên</option>
        </select>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
    <button class="btn btn-primary" onclick="createUserFromModal()">
      <span class="material-symbols-rounded">save</span> Tạo tài khoản
    </button>
  `);
}

async function createUserFromModal() {
  const username = document.getElementById('f-new-username').value.trim();
  const password = document.getElementById('f-new-password').value;
  const role = document.getElementById('f-new-role').value;
  if (!username || !password) { showToast('Vui lòng nhập đầy đủ thông tin', 'error'); return; }
  try {
    await apiCreateUser(username, password, role);
    showToast('Đã tạo tài khoản: ' + username);
    openUserManagement();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function promptChangePassword(id, username) {
  openModal('Đổi mật khẩu - ' + username, `
    <div class="form-grid">
      <div class="form-group full-width">
        <label>Mật khẩu mới * (tối thiểu 6 ký tự)</label>
        <input type="password" id="f-change-password">
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="openUserManagement()">Hủy</button>
    <button class="btn btn-primary" onclick="submitChangePassword('${id}')">
      <span class="material-symbols-rounded">save</span> Cập nhật
    </button>
  `);
}

async function submitChangePassword(id) {
  const password = document.getElementById('f-change-password').value;
  try {
    await apiChangePassword(id, password);
    showToast('Đã đổi mật khẩu');
    closeModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Buộc đổi mật khẩu mặc định (admin/admin123) sau khi đăng nhập
function requireForcePasswordChange() {
  let raw;
  try { raw = sessionStorage.getItem('qlda_force_pw'); } catch (e) { return; }
  if (!raw) return;
  const info = JSON.parse(raw);
  const id = (info && info.id) || (currentUser && currentUser.id);
  if (!id) return;
  openModal('Yêu cầu đổi mật khẩu mặc định', `
    <p style="margin-bottom:14px">Bạn đang đăng nhập bằng mật khẩu mặc định <code>admin123</code>. Vì lý do bảo mật, vui lòng đổi mật khẩu trước khi tiếp tục.</p>
    <div class="form-grid">
      <div class="form-group full-width">
        <label>Mật khẩu mới * (tối thiểu 6 ký tự)</label>
        <input type="password" id="f-force-password">
      </div>
    </div>
  `, `
    <button class="btn btn-primary" onclick="submitForcePasswordChange()">
      <span class="material-symbols-rounded">save</span> Đổi mật khẩu
    </button>
  `);
}

async function submitForcePasswordChange() {
  const pw = document.getElementById('f-force-password').value;
  if (!pw || pw.length < 6) { showToast('Mật khẩu phải có ít nhất 6 ký tự', 'error'); return; }
  const id = (currentUser && currentUser.id);
  try {
    await apiChangePassword(id, pw);
    try { sessionStorage.removeItem('qlda_force_pw'); } catch (e) {}
    closeModal();
    showToast('Đã đổi mật khẩu thành công');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmDeleteUser(id, username) {
  openModal('Xác nhận xóa', `
    <div class="confirm-content">
      <span class="material-symbols-rounded">warning</span>
      <p>Bạn có chắc chắn muốn xóa người dùng:</p>
      <p class="confirm-name">"${username}"?</p>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="openUserManagement()">Hủy</button>
    <button class="btn btn-danger" onclick="deleteUserConfirmed('${id}')">
      <span class="material-symbols-rounded">delete</span> Xóa
    </button>
  `);
}

async function deleteUserConfirmed(id) {
  try {
    await apiDeleteUser(id);
    showToast('Đã xóa người dùng');
    openUserManagement();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Init
async function init() {
  currentUser = await apiGetMe();
  if (!currentUser) {
    window.location.href = '/login.html';
    return;
  }
  renderAccountUI();
  requireForcePasswordChange();
  try {
    await loadState();
  } catch (err) {
    showToast('Không thể kết nối máy chủ: ' + err.message, 'error');
  }
  try {
    await loadConfig();
    applyConfig();
  } catch (_) { /* giữ nguyên cấu hình mặc định nếu không tải được */ }
  renderProjectSelector();
  renderProjectInfoBar();
  renderDashboard();

}

document.addEventListener('DOMContentLoaded', init);

// Service Worker — PWA offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Handle window resize for charts
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentView === 'dashboard') {
      renderDonutChart();
      renderBarChart();
      renderGanttChart();
    }
  }, 250);
});

// ============================================================
// AI CHAT (Gemini)
// ============================================================
document.getElementById('btn-ai-chat')?.addEventListener('click', function() {
  document.getElementById('ai-chat-panel').classList.toggle('hidden');
});
document.getElementById('btn-ai-close')?.addEventListener('click', function() {
  document.getElementById('ai-chat-panel').classList.add('hidden');
});

async function aiSend(msg) {
  var input = document.getElementById('ai-chat-input');
  var text = msg || input.value.trim();
  if (!text) return;
  var messages = document.getElementById('ai-chat-messages');

  // Add user message
  var userDiv = document.createElement('div');
  userDiv.className = 'ai-msg ai-msg-user';
  userDiv.textContent = text;
  messages.appendChild(userDiv);
  messages.scrollTop = messages.scrollHeight;
  if (!msg) input.value = '';

  // Add loading
  var loadDiv = document.createElement('div');
  loadDiv.className = 'ai-msg ai-msg-bot';
  loadDiv.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-color:rgba(37,99,235,0.3);border-top-color:#2563eb;display:inline-block"></span> Đang xử lý...';
  messages.appendChild(loadDiv);
  messages.scrollTop = messages.scrollHeight;

  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  try {
    var res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    var data = await res.json();
    loadDiv.remove();
    var botDiv = document.createElement('div');
    botDiv.className = 'ai-msg ai-msg-bot';
    if (res.ok) {
      botDiv.innerHTML = renderMarkdown(data.reply);
    } else {
      botDiv.textContent = data.error || 'Lỗi kết nối';
    }
    messages.appendChild(botDiv);
  } catch (e) {
    loadDiv.remove();
    var errDiv = document.createElement('div');
    errDiv.className = 'ai-msg ai-msg-bot';
    errDiv.textContent = 'Không thể kết nối AI. Kiểm tra API key.';
    messages.appendChild(errDiv);
  }
  messages.scrollTop = messages.scrollHeight;
}
