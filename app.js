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
  projectScope: 'project',
  config: null,
  loaded: false
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
  state.loaded = true;
  // Migrate old packages: ensure pkgType matches contractType
  (state.projects || []).forEach(proj => {
    (proj.categories || []).forEach(cat => {
      (cat.packages || []).forEach(pkg => {
        const isConsultingLike = (pkg.contractType || '').includes('Tư vấn');
        if (!pkg.pkgType || (isConsultingLike && pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting')) {
          pkg.pkgType = isConsultingLike ? 'consulting' : (pkg.pkgType || 'construction');
        }
        pkg.pkgScope = pkg.pkgScope || 'project';
        pkg.milestones = pkg.milestones || [];
        pkg.deliverables = pkg.deliverables || [];
        pkg.payments = pkg.payments || [];
        pkg.variations = pkg.variations || [];
        pkg.acceptances = pkg.acceptances || [];
        // Số nghiệm thu cũ (1 giá trị) -> đợt nghiệm thu đầu tiên
        if (!pkg.acceptances.length && (pkg.acceptanceValue || 0) > 0) {
          pkg.acceptances.push({
            id: generateId(), date: pkg.acceptanceDate || '', value: pkg.acceptanceValue,
            doc: pkg.acceptanceRecord || '', note: 'Chuyển từ số liệu nghiệm thu cũ',
            final: pkg.acceptanceStatus === 'Đã nghiệm thu'
          });
        }
        pkg.documentChecklist = pkg.documentChecklist || [];
        pkg.pdfs = pkg.pdfs || [];
        // Hóa đơn cũ (1 giá trị) -> đợt hóa đơn đầu tiên
        pkg.invoices = pkg.invoices || [];
        if (!pkg.invoices.length && (pkg.invoiceNumber || pkg.invoiceValue || pkg.invoiceDate)) {
          pkg.invoices.push({
            id: generateId(), number: pkg.invoiceNumber || '', date: pkg.invoiceDate || '',
            value: Number(pkg.invoiceValue) || 0, xml: !!pkg.invoiceXml, note: 'Chuyển từ hóa đơn cũ'
          });
        }
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
    if (typeof c.limits.directPurchase === 'number') CONTRACT_ROUTE_DIRECT_PURCHASE_LIMIT = c.limits.directPurchase;
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
  if (Array.isArray(c.lists?.fundSources)) FUND_SOURCES = c.lists.fundSources;
  if (Array.isArray(c.lists?.purchaseTypes)) PURCHASE_TYPES = c.lists.purchaseTypes;
  if (Array.isArray(c.lists?.buildingGrades)) BUILDING_GRADES = c.lists.buildingGrades;
  if (Array.isArray(c.lists?.contractTypes)) CONTRACT_TYPES = c.lists.contractTypes;
  if (Array.isArray(c.lists?.feasibilityStatuses)) FEASIBILITY_STATUSES = c.lists.feasibilityStatuses;
  if (Array.isArray(c.lists?.acceptanceStatuses)) ACCEPTANCE_STATUSES = c.lists.acceptanceStatuses;
  if (Array.isArray(c.lists?.settlementStatuses)) SETTLEMENT_STATUSES = c.lists.settlementStatuses;
  if (Array.isArray(c.lists?.selectionMethods)) SELECTION_METHODS = c.lists.selectionMethods;
  if (Array.isArray(c.lists?.legalDocTypes)) LEGAL_DOC_TYPES = c.lists.legalDocTypes;
  if (Array.isArray(c.agencies)) CHU_TRUONG_AGENCIES = c.agencies;
  if (Array.isArray(c.templates?.qtnd)) QTNĐ_TITLES = c.templates.qtnd;
  if (Array.isArray(c.templates?.qtda)) QTDA_TITLES = c.templates.qtda;
}

function saveState() {
  if (!state.loaded) return;
  apiSaveState({
    projects: state.projects,
    currentProjectId: state.currentProjectId
  }).catch(err => showToast('Lỗi lưu dữ liệu: ' + err.message, 'error'));
}

function getCurrentProject() {
  const p = state.projects.find(p => p.id === state.currentProjectId);
  if (p && (p.projectScope || 'project') === state.projectScope) return p;
  return getScopeProjects()[0] || null;
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

// Rút gọn số tiền cho biểu đồ (tránh tràn chữ trên màn hình hẹp như iPad)
function formatCompactCurrency(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' nghìn tỷ ₫';
  if (abs >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ ₫';
  if (abs >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' triệu ₫';
  return n.toLocaleString('vi-VN') + ' ₫';
}

function formatPercent(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}

function isPackageComplete(pkg) {
  if (!pkg) return false;
  return pkg.acceptanceStatus === 'Đã nghiệm thu' && (pkg.acceptanceValue || 0) > 0;
}

// ---- Giá trị hợp đồng & nghiệm thu ----
// Giá trị hợp đồng hiện hành = trúng thầu + phát sinh đã duyệt
function getApprovedVariationTotal(pkg) {
  return (pkg?.variations || []).filter(v => v.status === 'approved').reduce((s, v) => s + (Number(v.amount) || 0), 0);
}

function getCurrentContractValue(pkg) {
  return (Number(pkg?.bidValue) || 0) + getApprovedVariationTotal(pkg);
}

// Đồng bộ các trường nghiệm thu tổng (dùng bởi báo cáo cũ) từ danh sách các đợt
function syncPackageAcceptance(pkg) {
  const list = pkg.acceptances || [];
  pkg.acceptanceValue = list.reduce((s, a) => s + (Number(a.value) || 0), 0);
  const dates = list.map(a => a.date).filter(Boolean).sort();
  pkg.acceptanceDate = dates.length ? dates[dates.length - 1] : '';
  if (list.some(a => a.final)) pkg.acceptanceStatus = 'Đã nghiệm thu';
  else if (pkg.acceptanceStatus === 'Đã nghiệm thu') pkg.acceptanceStatus = ACCEPTANCE_STATUSES[0];
}

function getAcceptanceStats(pkg) {
  const contract = getCurrentContractValue(pkg);
  const accepted = Number(pkg?.acceptanceValue) || 0;
  return {
    contract,
    accepted,
    percent: contract > 0 ? accepted / contract * 100 : null,
    remaining: contract > 0 ? contract - accepted : null,
    saving: (pkg?.estimateValue > 0 && pkg?.bidValue > 0) ? pkg.estimateValue - pkg.bidValue : null
  };
}

// ---- Trạng thái vòng đời gói thầu ----
const PKG_STATUSES = {
  notStarted: { label: 'Chưa triển khai', badge: 'badge-neutral' },
  selecting: { label: 'Đang lựa chọn nhà thầu', badge: 'badge-info' },
  signed: { label: 'Đã ký hợp đồng', badge: 'badge-info' },
  executing: { label: 'Đang thực hiện', badge: 'badge-warning' },
  accepted: { label: 'Đã nghiệm thu', badge: 'badge-success' },
  handedOver: { label: 'Đã bàn giao', badge: 'badge-success' }
};

function hasValue(v) {
  const s = String(v ?? '').trim();
  return s !== '' && s !== '-';
}

function getPackageStatus(pkg) {
  if (pkg.handoverDate) return 'handedOver';
  if (isPackageComplete(pkg)) return 'accepted';
  if (hasValue(pkg.contract) || pkg.contractSignDate) {
    return ((pkg.acceptances || []).length || (pkg.progress || 0) > 0 || (pkg.acceptanceValue || 0) > 0) ? 'executing' : 'signed';
  }
  if (hasValue(pkg.khlcntNumber) || hasValue(pkg.hsmtNumber) || pkg.hsmtDate || pkg.bidOpenDate || pkg.bidCloseDate || hasValue(pkg.contractor)) return 'selecting';
  return 'notStarted';
}

function getPackageStatusBadge(pkg) {
  const s = PKG_STATUSES[getPackageStatus(pkg)];
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

// Tiến độ hồ sơ theo checklist (chỉ tính mục bắt buộc)
function getDocChecklistProgress(pkg) {
  const items = (pkg.documentChecklist || []).flatMap(s => s.items || []).filter(i => i.required);
  return { done: items.filter(i => i.done).length, total: items.length };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ---- Project classification & legal lookup tables (per readme.md quy trình) ----
let PROJECT_TYPES = ['Đầu tư công', 'PPP', 'Vốn đầu tư chi thường xuyên', 'Đầu tư kinh doanh'];
let FUND_SOURCES = ['Kinh phí quỹ phát triển sự nghiệp', 'Ngân sách thành phố', 'Đầu tư công'];
let PURCHASE_TYPES = ['Mua sắm tài sản', 'Sửa chữa, bảo trì thường xuyên', 'Mua sắm vật tư, hàng hóa tiêu hao', 'Dịch vụ khác'];
let BUILDING_GRADES = ['Đặc biệt', 'I', 'II', 'III', 'IV'];
let CONTRACT_TYPES = ['Tư vấn (khảo sát, thiết kế, giám sát)', 'Thi công xây dựng', 'Hỗn hợp EPC', 'Hỗn hợp EC', 'Hỗn hợp PC', 'Hợp đồng trọn gói'];
let FEASIBILITY_STATUSES = ['Chưa lập', 'Đã lập, chờ thẩm định', 'Đã thẩm định'];
let ACCEPTANCE_STATUSES = ['Chưa nghiệm thu', 'Đã nghiệm thu', 'Đang kiểm tra CQCM'];
let SETTLEMENT_STATUSES = ['Chưa quyết toán', 'Đang thẩm tra', 'Đã quyết toán'];
let SELECTION_METHODS = [
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
];

// ---- Module 2: Hợp đồng & Pháp lý (NĐ 210/2026, NĐ 254/2025, NĐ 123/2020) ----
// Hạn mức chỉ định thầu theo loại gói (khoản 4 Điều 78 NĐ 214/2025/NĐ-CP, sửa đổi bởi NĐ 349/2026/NĐ-CP)
let CONTRACT_ROUTE_DIRECT_LIMITS = { consulting: 3000000000, construction: 5000000000, goods: 5000000000, mixed: 5000000000, nonConsulting: 5000000000, nonProject: 1000000000 };
let CONTRACT_ROUTE_DIRECT_PURCHASE_LIMIT = 100000000; // gói thầu/nội dung mua sắm không quá 100 triệu: Thủ trưởng quyết định (khoản 4 Điều 80 NĐ 214/2025/NĐ-CP, sửa đổi bởi NĐ 349/2026/NĐ-CP)

let CONTRACT_ROUTE_KTKT_LIMIT = 20000000000;      // ngưỡng bắt buộc lập BCNCKT
// Độ dài ngày báo sớm cho cảnh báo đỏ tiến độ hợp đồng
let CONTRACT_DEADLINE_WARN_DAYS = 30;

// Lấy hạn mức chỉ định thầu theo loại gói + phạm vi (thuộc dự án / không hình thành dự án)
function getDirectLimit(pkgType, scope) {
  if (scope === 'nonProject') return CONTRACT_ROUTE_DIRECT_LIMITS.nonProject;
  return CONTRACT_ROUTE_DIRECT_LIMITS[pkgType] || CONTRACT_ROUTE_DIRECT_LIMITS.construction;
}

// Đường phân nhánh hồ sơ hợp đồng theo giá trị gói + phạm vi (thuộc dự án / không hình thành dự án)
function getContractRoute(pkg) {
  const v = Number(pkg?.bidValue) || 0;
  if (v > 0 && v <= CONTRACT_ROUTE_DIRECT_PURCHASE_LIMIT) return { code: 'directPurchase', name: 'Thủ trưởng quyết định (≤100 triệu)', hint: `Không quá ${Math.round(CONTRACT_ROUTE_DIRECT_PURCHASE_LIMIT/1e6)} triệu: Thủ trưởng đơn vị quyết định và tự chịu trách nhiệm, không cần quy trình chỉ định thầu nhưng phải đủ hóa đơn, chứng từ (khoản 4 Điều 80 NĐ 214/2025)` };
  // Mua sắm không hình thành dự án: hạn mức chỉ định thầu 1 tỷ, trên 1 tỷ phải đấu thầu rộng rãi
  if (pkg?.pkgScope === 'nonProject') {
    const d = CONTRACT_ROUTE_DIRECT_LIMITS.nonProject;
    if (v > d) return { code: 'competitive', name: 'Đấu thầu rộng rãi', hint: `Trên ${Math.round(d/1e6)} triệu (mua sắm không dự án): phải tổ chức đấu thầu rộng rãi` };
    return { code: 'direct', name: 'Chỉ định thầu', hint: `Dưới ${Math.round(d/1e6)} triệu (mua sắm không dự án)` };
  }
  const k = CONTRACT_ROUTE_KTKT_LIMIT;
  if (v >= k) return { code: 'bcnckt', name: 'Lập BCNCKT / thiết kế kỹ thuật', hint: `Từ ${Math.round(k/1e9)} tỷ: lập BCNCKT` };
  const d = getDirectLimit(pkg?.pkgType, pkg?.pkgScope);
  if (v >= d) return { code: 'ktkt', name: 'Bắt buộc lập Báo cáo kinh tế - kỹ thuật', hint: `${Math.round(d/1e6)} triệu → ${Math.round(k/1e9)} tỷ` };
  return { code: 'direct', name: 'Triển khai trực tiếp', hint: `Dưới ${Math.round(d/1e6)} triệu` };
}

// Cảnh báo đỏ (red flag) tiến độ hợp đồng + ràng buộc hóa đơn/nghiệm thu (NĐ 123/2020)
function computeContractAlerts(pkg) {
  const alerts = [];
  if (!pkg) return alerts;

  const st = getAcceptanceStats(pkg);
  if (st.contract > 0 && st.accepted > st.contract) {
    alerts.push({ level: 'danger', icon: 'error', message: `Gói "${pkg.name}": giá trị nghiệm thu (${formatCurrency(st.accepted, true)}) vượt giá trị hợp đồng hiện hành (${formatCurrency(st.contract, true)}).` });
  }
  if (isPackageComplete(pkg)) return alerts;

  if (st.percent != null && pkg.pkgType === 'construction' && (pkg.progress || 0) > 0 && Math.abs((pkg.progress || 0) - st.percent) > 30) {
    alerts.push({ level: 'warning', icon: 'compare_arrows', message: `Gói "${pkg.name}": tiến độ ${pkg.progress}% lệch nhiều so với nghiệm thu ${st.percent.toFixed(0)}% giá trị hợp đồng.` });
  }

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
  const invs = [...(pkg.invoices || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const invoiceDate = invs.length ? invs[invs.length - 1].date : null;
  if (invoiceDate && pkg.acceptanceDate && invoiceDate < pkg.acceptanceDate) {
    alerts.push({ level: 'danger', icon: 'receipt_long', message: `Gói "${pkg.name}": ngày HĐ GTGT (${formatDateVN(invoiceDate)}) trước ngày nghiệm thu (${formatDateVN(pkg.acceptanceDate)}). Không hợp lệ theo NĐ 123/2020.` });
  }
  if (invoiceDate && !pkg.acceptanceDate) {
    alerts.push({ level: 'warning', icon: 'receipt_long', message: `Gói "${pkg.name}": đã xuất HĐ GTGT ${formatDateVN(invoiceDate)} nhưng chưa có biên bản nghiệm thu KL hoàn thành.` });
  }
  if (!invoiceDate && pkg.acceptanceDate) {
    alerts.push({ level: 'warning', icon: 'receipt_long', message: `Gói "${pkg.name}": đã nghiệm thu (${formatDateVN(pkg.acceptanceDate)}) nhưng chưa xuất HĐ GTGT đồng bộ.` });
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
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return '—';
  const [year, month, day] = parts;
  if (!day || !month || !year) return '—';
  return `${day}/${month}/${year}`;
}

// ISO (yyyy-mm-dd) -> dd/mm/yyyy để hiển thị trong ô nhập ngày
function toDmy(iso) {
  if (!iso) return '';
  const parts = String(iso).slice(0, 10).split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// dd/mm/yyyy -> ISO (yyyy-mm-dd) để lưu dữ liệu
function toIso(dmy) {
  if (!dmy) return '';
  const m = String(dmy).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return dmy;
  const d = String(m[1]).padStart(2, '0');
  const mo = String(m[2]).padStart(2, '0');
  return `${m[3]}-${mo}-${d}`;
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
  const legendEl = document.getElementById('donut-legend');

  const cats = project ? getSortedCategories(project) : [];
  const invTotal = cats.reduce((s, c) => s + getCatInvestTotal(c), 0);
  const bidTotal = cats.reduce((s, c) => s + getCatBidTotal(c), 0);
  const estTotal = cats.reduce((s, c) => s + getCatEstimateTotal(c), 0);

  let valueFn, centerLabel;
  if (invTotal > 0) { valueFn = getCatInvestTotal; centerLabel = 'TỔNG MỨC ĐẦU TƯ'; }
  else if (bidTotal > 0) { valueFn = getCatBidTotal; centerLabel = 'GIÁ TRỊ TRÚNG THẦU'; }
  else { valueFn = getCatEstimateTotal; centerLabel = 'GIÁ TRỊ DỰ TOÁN'; }

  const data = cats.map((cat, i) => ({
    label: cat.code + '. ' + cat.name,
    value: valueFn(cat),
    color: cat.color || CAT_COLORS[i % CAT_COLORS.length]
  }));

  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2;

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
  fitFontSize(ctx, centerLabel, centerMaxWidth, 700, 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(centerLabel, cx, cy - 14);
  const totalLabel = formatCompactCurrency(total);
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
        <span class="legend-value" title="${esc(formatCurrency(d.value))}">${formatCompactCurrency(d.value)}</span>
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
          <span class="cmp-val" title="${esc(formatCurrency(v))}">${formatCompactCurrency(v)}</span>
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
// ============================================================
// SECTION 6: UI RENDERING
// ============================================================
function getScopeProjects() {
  return state.projects.filter(p => (p.projectScope || 'project') === state.projectScope);
}

function renderProjectSelector() {
  const select = document.getElementById('project-selector');
  const list = getScopeProjects();
  if (!list.length) {
    select.innerHTML = '<option value="">— Chưa có —</option>';
    select.value = '';
    return;
  }
  if (!list.some(p => p.id === state.currentProjectId)) {
    state.currentProjectId = list[0].id;
  }
  select.innerHTML = list.map(p =>
    `<option value="${esc(p.id)}" ${p.id === state.currentProjectId ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');
}

function switchScope(scope) {
  if (scope !== 'project' && scope !== 'nonProject') return;
  state.projectScope = scope;
  document.querySelectorAll('.scope-btn').forEach(b => b.classList.toggle('active', b.dataset.scope === scope));
  const list = getScopeProjects();
  if (list.length) state.currentProjectId = list[0].id;
  else state.currentProjectId = null;
  saveState();
  renderProjectSelector();
  renderAll();
}

function renderProjectInfoBar() {
  const project = getCurrentProject();
  const bar = document.getElementById('project-info-bar');
  if (!project) { bar.innerHTML = ''; return; }
  const scopeLabel = project.projectScope === 'nonProject'
    ? '<div class="info-item"><span class="badge badge-warning">Mua sắm / sửa chữa thường xuyên</span></div>'
    : '<div class="info-item"><span class="badge badge-info">Dự án</span></div>';
  bar.innerHTML = `
    <div class="info-item"><span class="info-label">${project.projectScope === 'nonProject' ? 'Mua sắm:' : 'Dự án:'}</span><span class="info-value">${esc(project.fullName || project.name)}</span></div>
    ${scopeLabel}
    <div class="info-item"><span class="info-label">Chủ đầu tư / Đơn vị:</span><span class="info-value">${esc(project.owner || '—')}</span></div>
    <div class="info-item"><span class="info-label">Địa điểm:</span><span class="info-value">${esc(project.location || '—')}</span></div>
    <div class="info-item"><span class="info-label">Thời gian:</span><span class="info-value">${project.startYear || project.endYear ? `${project.startYear || '...'}–${project.endYear || '...'}` : 'Chưa cập nhật'}</span></div>
    <div class="info-item"><span class="info-label">Nguồn vốn:</span><span class="info-value">${esc(project.investmentSource || '—')}</span></div>
    ${project.totalInvestment ? `<div class="info-item"><span class="info-label">Tổng mức đầu tư:</span><span class="info-value" style="color:var(--accent-cyan);font-weight:700">${formatCurrency(project.totalInvestment, true)}</span></div>` : ''}
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
  if (!project) {
    document.getElementById('kpi-cards').innerHTML = '';
    document.getElementById('capital-summary').innerHTML = '';
    document.getElementById('alerts-panel').innerHTML = '';
    renderDonutChart();
    renderBarChart();
    return;
  }

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

function renderPackages(searchTerm = document.getElementById('search-packages')?.value || '') {
  const project = getCurrentProject();
  const container = document.getElementById('categories-container');
  if (!project) { container.innerHTML = '<p style="color:var(--text-muted)">Chưa có dự án nào.</p>'; return; }

  const term = searchTerm.toLowerCase().trim();
  const fStatus = document.getElementById('filter-pkg-status')?.value || '';
  const fType = document.getElementById('filter-pkg-type')?.value || '';
  const hasFilter = !!(term || fStatus || fType);
  const matches = p => (!term || p.name.toLowerCase().includes(term) || p.contractor?.toLowerCase().includes(term))
    && (!fStatus || getPackageStatus(p) === fStatus)
    && (!fType || p.pkgType === fType);

  const summaryEl = document.getElementById('pkg-status-summary');
  if (summaryEl) {
    const all = project.categories.flatMap(c => c.packages);
    summaryEl.innerHTML = Object.entries(PKG_STATUSES).map(([k, s]) => {
      const n = all.filter(p => getPackageStatus(p) === k).length;
      return `<span class="badge ${s.badge}" style="cursor:pointer" onclick="setPkgStatusFilter('${k}')">${s.label}: ${n}</span>`;
    }).join(' ');
  }

  container.innerHTML = getSortedCategories(project).map((cat, ci) => {
    const filteredPkgs = hasFilter ? cat.packages.filter(matches) : cat.packages;

    if (hasFilter && filteredPkgs.length === 0) return '';

    const investTotal = getCatInvestTotal(cat);
    const estimateTotal = getCatEstimateTotal(cat);
    const acceptTotal = cat.packages.reduce((s, p) => s + (p.acceptanceValue || 0), 0);

    return `
    <div class="category-group" data-cat-id="${cat.id}">
      <div class="category-header" onclick="toggleCategory(this)">
        <div class="category-code" style="background:${cat.color || CAT_COLORS[ci]}">${esc(cat.code)}</div>
        <div class="category-name">${esc(cat.name)}</div>
        <div class="category-stats">
          <span>Tổng mức đầu tư: <span class="stat-value">${formatCurrency(investTotal, true)}</span></span>
          <span>Dự toán: <span class="stat-value">${formatCurrency(estimateTotal, true)}</span></span>
          <span>Nghiệm thu: <span class="stat-value">${formatCurrency(acceptTotal, true)}</span></span>
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
                  <th>Giá trị HĐ</th>
                  <th>Hình thức</th>
                  <th>Nhà thầu</th>
                  <th>Tiến độ</th>
                  <th>Nghiệm thu</th>
                  <th>Trạng thái</th>
                  <th>Hồ sơ</th>
                  <th style="width:120px">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${filteredPkgs.map((pkg, pi) => {
      const progressClass = pkg.progress >= 100 ? 'complete' : pkg.progress >= 60 ? 'high' : pkg.progress >= 30 ? 'medium' : 'low';
      const ast = getAcceptanceStats(pkg);
      const docp = getDocChecklistProgress(pkg);
      return `
                  <tr>
                    <td>${pi + 1}</td>
                    <td class="pkg-name">${esc(pkg.name)}${pkg.pdfs?.length ? ' <span class="material-symbols-rounded" style="font-size:14px;color:var(--accent-amber)" title="Có file đính kèm">attach_file</span>' : ''}</td>
                    <td class="text-right">${pkg.estimateValue ? formatCurrency(pkg.estimateValue, true) : '—'}</td>
                    <td class="text-right">${ast.contract ? formatCurrency(ast.contract, true) : '—'}${getApprovedVariationTotal(pkg) ? '<div style="font-size:0.7rem;color:var(--text-muted)">gồm phát sinh</div>' : ''}</td>
                    <td class="pkg-wrap">${esc(pkg.selectionMethod || '—')}</td>
                    <td class="pkg-wrap">${esc(pkg.contractor || '—')}</td>
                    <td>
                      <span class="badge ${(() => { const r = getContractRoute(pkg); return r.code === 'ktkt' ? 'badge-warning' : (r.code === 'bcnckt' ? 'badge-info' : (r.code === 'competitive' ? 'badge-info' : (r.code === 'directPurchase' ? 'badge-success' : 'badge-neutral'))); })()}">${getContractRoute(pkg).name}</span>
                      ${pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' ? `
                      <div class="progress-bar" style="margin-top:4px"><div class="progress-fill ${progressClass}" style="width:${pkg.progress}%"></div></div>
                      <span>${pkg.progress}%</span>
                      ` : '<span style="color:var(--text-muted);font-size:0.85rem">—</span>'}
                    </td>
                    <td class="text-right">${ast.accepted ? formatCurrency(ast.accepted, true) : '—'}${ast.percent != null && ast.accepted ? `<div style="font-size:0.7rem;color:${ast.percent > 100 ? 'var(--accent-red)' : 'var(--text-muted)'}">${ast.percent.toFixed(0)}% HĐ</div>` : ''}</td>
                    <td>${getPackageStatusBadge(pkg)}</td>
                    <td>${docp.total ? `<span class="badge ${docp.done === docp.total ? 'badge-success' : 'badge-neutral'}" title="Mục bắt buộc đã có hồ sơ">${docp.done}/${docp.total}</span>` : '—'}</td>
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
        <h4>Đã thanh toán</h4>
        <div class="big-number" style="color:var(--accent-green)">${formatCurrency(totalDisbursed, true)}</div>
        <div class="big-sub">Tỷ lệ: ${formatPercent(disbursedRate)}</div>
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
              <th class="text-right">Đã thanh toán</th>
              <th class="text-right">Còn lại</th>
              <th class="text-right">Tỷ lệ đã thanh toán</th>
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
            <tr><th>TT</th><th>Tên gói thầu</th><th>Nhà thầu</th><th class="text-right">Giá trị trúng thầu</th><th class="text-right">Đã thanh toán</th><th class="text-right">Nghiệm thu</th></tr>
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
      <h3><span class="material-symbols-rounded">verified</span> Bảo hành (xây dựng & mua sắm)</h3>
      ${(() => {
      const withHandover = allPkgs.filter(p => p.handoverDate && (p.pkgType === 'construction' || p.pkgType === 'goods' || p.pkgType === 'mixed'));
      if (withHandover.length === 0) return '<p style="color:var(--text-secondary);padding:12px">Chưa có gói xây dựng / mua sắm nào được bàn giao.</p>';
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
    const invs = [...(p.invoices || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const invLabel = invs.length ? formatDateVN(invs[invs.length - 1].date) + (invs.length > 1 ? ` <span class="badge badge-neutral">${invs.length} HĐ</span>` : '') : '—';
    return `
              <tr>
                <td>${i + 1}</td>
                <td class="pkg-wrap">${esc(p.name)}</td>
                <td>${routeBadge}</td>
                <td>${formatDateVN(p.contractEndDate)}</td>
                <td class="text-center">${(p.pkgType === 'consulting' || p.pkgType === 'nonConsulting') ? '<strong>—</strong>' : `<strong>${p.progress || 0}%</strong>`}</td>
                <td>${formatDateVN(p.acceptanceDate)}</td>
                <td>${invLabel}</td>
                <td>${status}</td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Package contract & acceptance summary -->
    <div class="report-section">
      <h3><span class="material-symbols-rounded">fact_check</span> Tổng hợp gói thầu: giá trị hợp đồng & nghiệm thu</h3>
      <div class="report-table-wrapper">
        <table class="report-table">
          <thead>
            <tr>
              <th>TT</th><th>Tên gói thầu</th><th>Nhà thầu</th>
              <th class="text-right">Giá trị HĐ hiện hành</th><th class="text-right">Nghiệm thu</th>
              <th class="text-right">% NT</th><th class="text-right">Còn lại</th>
              <th>Hạn hoàn thành</th><th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${allPkgs.map((p, i) => {
    const st = getAcceptanceStats(p);
    return `<tr>
              <td>${i + 1}</td>
              <td class="pkg-wrap">${esc(p.name)}</td>
              <td>${esc(p.contractor || '—')}</td>
              <td class="text-right">${st.contract ? formatCurrency(st.contract, true) : '—'}</td>
              <td class="text-right">${st.accepted ? formatCurrency(st.accepted, true) : '—'}</td>
              <td class="text-right">${st.percent != null ? formatPercent(st.percent) : '—'}</td>
              <td class="text-right">${st.remaining != null ? formatCurrency(st.remaining, true) : '—'}</td>
              <td>${formatDateVN(p.contractEndDate)}</td>
              <td>${getPackageStatusBadge(p)}</td>
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
        <button class="btn btn-primary" onclick="exportPackageAcceptanceReport()">
          <span class="material-symbols-rounded">fact_check</span> In bảng tổng hợp gói thầu & nghiệm thu
        </button>
        <button class="btn btn-primary" onclick="exportFullProjectReport()">
          <span class="material-symbols-rounded">print</span> Báo cáo tổng hợp dự án & Giải ngân
        </button>
        <button class="btn btn-secondary" onclick="exportPackagesReport()">
          <span class="material-symbols-rounded">inventory_2</span> Báo cáo chi tiết gói thầu
        </button>
        <button class="btn btn-secondary" onclick="exportSettlementWarrantyReport()">
          <span class="material-symbols-rounded">verified</span> Báo cáo Bảo hành
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

// ---- Mẫu số 02/QTDA (TT 73/2026/TT-BTC): Danh mục văn bản hồ sơ quyết toán ----
function qtdaNumberDate(number, date) {
  const d = date ? `ngày ${toDmy(date)}` : '';
  return [number, d].filter(Boolean).join(' ');
}

function buildQtda02Rows(project, inspectionText) {
  const legal = (project.initiations || []).map(d => ({
    name: d.title || d.name || '', numDate: qtdaNumberDate(d.number, d.date), agency: d.agency || '', note: d.note || ''
  }));

  const contracts = [];
  project.categories.flatMap(c => c.packages).forEach(p => {
    if (!hasValue(p.contract) && !p.contractSignDate) return;
    const contractText = hasValue(p.contract) ? p.contract : '';
    const numDate = /ngày/i.test(contractText) || !p.contractSignDate ? contractText : qtdaNumberDate(contractText, p.contractSignDate);
    contracts.push({ name: `Hợp đồng ${p.name}`, numDate, agency: p.contractor || '', note: p.bidValue > 0 ? `Giá trị HĐ: ${formatCurrency(p.bidValue)}` : '' });
    if (hasValue(p.contractExtension)) {
      contracts.push({ name: `Phụ lục gia hạn hợp đồng ${p.name}`, numDate: p.contractExtension, agency: p.contractor || '', note: '' });
    }
    (p.variations || []).filter(v => v.status === 'approved').forEach(v => {
      contracts.push({
        name: `Phụ lục / hợp đồng bổ sung (phát sinh khối lượng) ${p.name}`,
        numDate: qtdaNumberDate('', v.date), agency: p.contractor || '',
        note: [formatCurrency(v.amount), v.reason].filter(Boolean).join(' — ')
      });
    });
  });

  const inspections = String(inspectionText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const [name, numDate, agency, note] = l.split('|').map(s => s.trim());
    return { name: name || '', numDate: numDate || '', agency: agency || '', note: note || '' };
  });
  return { legal, contracts, inspections };
}

// Thân bảng Mẫu 02/QTDA (dùng cho xem trước và xuất)
function qtda02BodyRows({ legal, contracts, inspections }) {
  const rows = (list, emptyText) => list.length
    ? list.map((r, i) => `<tr><td class="text-center">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.numDate)}</td><td>${esc(r.agency)}</td><td>${esc(r.note)}</td></tr>`).join('')
    : `<tr><td class="text-center">1</td><td colspan="4">${emptyText}</td></tr>`;
  const section = (no, title, body) => `<tr><td class="text-center"><strong>${no}</strong></td><td colspan="4"><strong>${title}</strong></td></tr>${body}`;
  return section('I', 'Các văn bản pháp lý', rows(legal, ''))
    + section('II', 'Hợp đồng, phụ lục hợp đồng (nếu có), hợp đồng bổ sung (nếu có)', rows(contracts, ''))
    + section('III', 'Kết luận của các cơ quan Thanh tra, Kiểm toán nhà nước, kiểm tra, kết quả điều tra của các cơ quan pháp luật<br><em>(Trường hợp không có thì phải ghi cụ thể là “không có”)</em>', rows(inspections, 'Không có'));
}

// Tải tài liệu dạng Word (HTML .doc) để chỉnh sửa tiếp
function downloadWordDoc(project, code, title, bodyHTML) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><title>${title}</title>
    <style>
      body { font-family: 'Times New Roman', serif; font-size: 13pt; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
      th { background: #f2f2f2; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .print-title { text-align: center; font-weight: bold; font-size: 15pt; margin: 14px 0 4px 0; }
      .print-subtitle { text-align: center; font-style: italic; margin-bottom: 12px; }
    </style></head><body>${bodyHTML}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}-${(project.name || 'du-an').replace(/[\\/:*?"<>|\s]+/g, '-')}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildQtda02HTML(project, inspectionText) {
  const data = buildQtda02Rows(project, inspectionText);
  const noBorder = 'border:none;';

  return `
    <table style="${noBorder}margin:0 0 14px 0">
      <tr>
        <td style="${noBorder}"></td>
        <td style="${noBorder}text-align:right;font-style:italic;width:55%"><strong>Mẫu số 02/QTDA</strong><br>(kèm theo Thông tư số 73/2026/TT-BTC ngày 25 tháng 6 năm 2026 của Bộ trưởng Bộ Tài chính)</td>
      </tr>
      <tr>
        <td style="${noBorder}text-align:center"><strong>${esc((project.owner || 'CHỦ ĐẦU TƯ').toUpperCase())}</strong><br>-------</td>
        <td style="${noBorder}text-align:center"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br><strong>Độc lập - Tự do - Hạnh phúc</strong><br>---------------</td>
      </tr>
    </table>
    <div class="print-title">DANH MỤC VĂN BẢN</div>
    <div class="print-subtitle">Dự án: ${esc(project.fullName || project.name)}</div>
    <table>
      <thead>
        <tr><th style="width:40px">Số TT</th><th>Tên văn bản</th><th>Số, ngày, tháng, năm ban hành</th><th>Cơ quan ban hành</th><th>Ghi chú</th></tr>
      </thead>
      <tbody>
        ${qtda02BodyRows(data)}
      </tbody>
    </table>
    <table style="${noBorder}margin-top:30px">
      <tr>
        <td style="${noBorder}text-align:center;width:50%"><strong>NGƯỜI LẬP BIỂU</strong><br><em>(Ký, ghi rõ họ tên)</em><br><br><br><br></td>
        <td style="${noBorder}text-align:center"><em>…, ngày... tháng ... năm ...</em><br><strong>CHỦ ĐẦU TƯ</strong><br><em>(Ký, đóng dấu, ghi rõ họ tên)</em><br><br><br><br></td>
      </tr>
    </table>
    <p style="font-size:11px"><em>Ghi chú: Trường hợp dự án được cơ quan nhà nước có thẩm quyền cho thực hiện theo cơ chế đặc thù (như: Chương trình mục tiêu quốc gia, dự án khẩn cấp, dự án đặc biệt....) thì văn bản pháp lý và hồ sơ tài liệu liên quan được ghi theo các quy định cơ chế đặc thù được cấp có thẩm quyền ban hành.</em></p>
  `;
}

// ---- Mục III của Mẫu 02: kết luận thanh tra, kiểm toán ----
function openQtdaInspectionsModal() {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  if (!project) return;
  openModal('Mẫu 02/QTDA — Mục III: Kết luận thanh tra, kiểm toán, kiểm tra', `
    <div class="form-group full-width">
      <label>Mỗi dòng một văn bản</label>
      <textarea id="qtda-inspections" rows="6" placeholder="Tên văn bản | Số, ngày | Cơ quan ban hành | Ghi chú&#10;Để trống nếu không có (sẽ in &quot;Không có&quot;)">${esc(project.qtdaInspections || '')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveQtdaInspections()"><span class="material-symbols-rounded">save</span> Lưu</button>
  `);
}

function saveQtdaInspections() {
  const project = getCurrentProject();
  if (!project) return;
  project.qtdaInspections = document.getElementById('qtda-inspections').value;
  saveState();
  closeModal();
  renderQtdaView();
  showToast('Đã lưu mục III');
}

function exportQtda02(mode) {
  const project = getCurrentProject();
  if (!project) return;
  const body = buildQtda02HTML(project, project.qtdaInspections);
  if (mode === 'print') openPrintWindow(`Mẫu số 02/QTDA - ${esc(project.name)}`, body);
  else downloadWordDoc(project, 'Mau-so-02-QTDA', 'Mẫu số 02/QTDA', body);
}

// ============================================================
// HỒ SƠ QUYẾT TOÁN DỰ ÁN HOÀN THÀNH: Mẫu 02 & 04/QTDA (TT 73/2026/TT-BTC)
// ============================================================
const QTDA04_GROUPS = [
  { no: 'I', name: 'Bồi thường, hỗ trợ, tái định cư' },
  { no: 'II', name: 'Xây dựng' },
  { no: 'III', name: 'Thiết bị' },
  { no: 'IV', name: 'Quản lý dự án' },
  { no: 'V', name: 'Tư vấn' },
  { no: 'VI', name: 'Chi phí khác' },
  { no: 'VII', name: 'Dự phòng' }
];

function formatNumberVN(n, zero = '') {
  return n ? Number(n).toLocaleString('vi-VN') : zero;
}

// Nhóm Mẫu 04 của danh mục: đã gắn sẵn, hoặc suy ra từ tên danh mục cũ
function inferQtdaGroup(name) {
  const n = String(name || '').toLowerCase();
  if (/bồi thường|tái định cư|giải phóng mặt bằng/.test(n)) return 'I';
  if (/quản lý dự án/.test(n)) return 'IV';
  if (/dự phòng/.test(n)) return 'VII';
  if (/tư vấn/.test(n)) return 'V';
  if (/thiết bị/.test(n)) return 'III';
  if (/xây dựng|xây lắp/.test(n)) return 'II';
  if (/chi phí khác/.test(n)) return 'VI';
  return '';
}

function getCatQtdaGroup(cat) {
  return QTDA04_GROUPS.some(g => g.no === cat.qtdaGroup) ? cat.qtdaGroup : inferQtdaGroup(cat.name);
}

// Danh mục mặc định của dự án mới: 7 nhóm chi phí theo Mẫu 04/QTDA
function qtdaGroupSelectHTML(selected) {
  return `<select id="f-cat-qtdaGroup"><option value="">— Không thuộc nhóm nào —</option>${QTDA04_GROUPS.map(g => `<option value="${g.no}" ${selected === g.no ? 'selected' : ''}>${g.no}. ${g.name}</option>`).join('')}</select>`;
}

function createDefaultCategories() {
  return QTDA04_GROUPS.map((g, i) => ({
    id: generateId(), code: g.no, name: g.name, qtdaGroup: g.no,
    color: CAT_COLORS[i % CAT_COLORS.length], investTotal: 0, packages: []
  }));
}

// Nhóm chi phí của gói thầu trong Mẫu 04: chọn tay > nhóm của danh mục > suy ra từ tên/loại gói
function getQtda04Group(pkg, cat = null) {
  if (pkg.costGroup) return pkg.costGroup;
  const fromCat = cat && getCatQtdaGroup(cat);
  if (fromCat) return fromCat;
  if (/quản lý dự án/i.test(pkg.name || '')) return 'IV';
  return { construction: 'II', mixed: 'II', goods: 'III', consulting: 'V', nonConsulting: 'VI' }[pkg.pkgType] || 'VI';
}

// Giá trị đề nghị quyết toán: số nhập tay nếu có, nếu không lấy giá trị nghiệm thu
function buildQtda04Data(project) {
  const num = v => Number(v) || 0;
  const items = [];
  const catInvest = {}; // tổng mức đầu tư nhập ở cấp danh mục, cộng vào nhóm tương ứng
  project.categories.forEach(cat => {
    const catTotal = num(cat.investTotal);
    cat.packages.forEach(p => {
      const manual = num(p.settlementValue) > 0;
      const group = getQtda04Group(p, cat);
      const item = {
        kind: 'pkg', id: p.id, catId: cat.id, group, name: p.name,
        invest: num(p.investValue), estimate: num(p.estimateValue),
        propose: manual ? num(p.settlementValue) : num(p.acceptanceValue),
        auto: !manual, reason: p.settlementReason || '', investInGroup: catTotal ? 0 : num(p.investValue)
      };
      if (item.invest || item.estimate || item.propose) items.push(item);
    });
    if (catTotal) {
      const g = getCatQtdaGroup(cat) || (cat.packages[0] ? getQtda04Group(cat.packages[0], cat) : 'VI');
      catInvest[g] = (catInvest[g] || 0) + catTotal;
    }
  });
  (project.qtdaLines || []).forEach(l => items.push({
    kind: 'line', id: l.id, group: l.group, name: l.name,
    invest: num(l.invest), estimate: num(l.estimate), propose: num(l.propose), auto: false, reason: l.reason || '',
    investInGroup: num(l.invest)
  }));
  const sum = (list, k) => list.reduce((s, i) => s + i[k], 0);
  const groups = QTDA04_GROUPS.map(g => {
    const list = items.filter(i => i.group === g.no);
    return { ...g, items: list, invest: sum(list, 'investInGroup') + (catInvest[g.no] || 0), estimate: sum(list, 'estimate'), propose: sum(list, 'propose') };
  });
  return { groups, total: { invest: sum(groups, 'invest'), estimate: sum(groups, 'estimate'), propose: sum(groups, 'propose') } };
}

// Thân bảng Mẫu 04 (dùng cho xem trước và xuất); actions=true thêm cột thao tác
function qtda04BodyRows(data, actions = false) {
  const cols = actions ? 7 : 6;
  const totalRow = `<tr class="total-row"><td></td><td><strong>Tổng số (I+II+III+IV+V+VI+VII)</strong></td>
    <td class="text-right"><strong>${formatNumberVN(data.total.invest, '0')}</strong></td>
    <td class="text-right"><strong>${formatNumberVN(data.total.estimate, '0')}</strong></td>
    <td class="text-right"><strong>${formatNumberVN(data.total.propose, '0')}</strong></td><td></td>${actions ? '<td></td>' : ''}</tr>`;
  const body = data.groups.map(g => {
    const head = `<tr><td class="text-center"><strong>${g.no}</strong></td><td><strong>${g.name}</strong></td>
      <td class="text-right"><strong>${formatNumberVN(g.invest)}</strong></td>
      <td class="text-right"><strong>${formatNumberVN(g.estimate)}</strong></td>
      <td class="text-right"><strong>${formatNumberVN(g.propose)}</strong></td><td></td>${actions ? '<td></td>' : ''}</tr>`;
    const items = g.items.map((it, i) => `<tr>
      <td class="text-center">${i + 1}</td><td>${esc(it.name)}</td>
      <td class="text-right">${formatNumberVN(it.invest)}</td>
      <td class="text-right">${formatNumberVN(it.estimate)}</td>
      <td class="text-right">${formatNumberVN(it.propose)}${it.auto && it.propose ? (actions ? '<div style="font-size:0.7rem;color:var(--text-muted)">theo nghiệm thu</div>' : '') : ''}</td>
      <td>${esc(it.reason)}</td>
      ${actions ? `<td class="edit-only" style="white-space:nowrap">
        <button class="btn-icon btn-sm" title="Sửa" onclick="openQtda04Item('${it.kind}','${it.id}','${it.catId || ''}')"><span class="material-symbols-rounded">edit</span></button>
        ${it.kind === 'line' ? `<button class="btn-icon btn-sm" title="Xóa" onclick="deleteQtda04Line('${it.id}')"><span class="material-symbols-rounded">delete</span></button>` : ''}
      </td>` : ''}</tr>`).join('');
    return head + items;
  }).join('');
  return totalRow + body;
}

function buildQtda04HTML(project) {
  const data = buildQtda04Data(project);
  const noBorder = 'border:none;';
  return `
    <table style="${noBorder}margin:0 0 14px 0">
      <tr>
        <td style="${noBorder}"></td>
        <td style="${noBorder}text-align:right;font-style:italic;width:55%"><strong>Mẫu số 04/QTDA</strong><br>(kèm theo Thông tư số 73/2026/TT-BTC ngày 25 tháng 6 năm 2026 của Bộ trưởng Bộ Tài chính)</td>
      </tr>
      <tr>
        <td style="${noBorder}text-align:center"><strong>${esc((project.owner || 'CHỦ ĐẦU TƯ').toUpperCase())}</strong><br>-------</td>
        <td style="${noBorder}text-align:center"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br><strong>Độc lập - Tự do - Hạnh phúc</strong><br>---------------</td>
      </tr>
    </table>
    <div class="print-title">CHI TIẾT CHI PHÍ ĐẦU TƯ ĐỀ NGHỊ QUYẾT TOÁN</div>
    <div class="print-subtitle">Dự án: ${esc(project.fullName || project.name)}<br>Đơn vị: đồng</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px">Số TT</th><th>Nội dung chi phí</th>
          <th>Tổng mức đầu tư (của dự án, dự án thành phần, tiểu dự án độc lập) được phê duyệt hoặc điều chỉnh lần cuối</th>
          <th>Tổng dự toán (dự toán công trình, hạng mục công trình độc lập) được phê duyệt hoặc điều chỉnh lần cuối</th>
          <th>Giá trị đề nghị quyết toán</th><th>Nguyên nhân tăng, giảm</th>
        </tr>
        <tr><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>
      </thead>
      <tbody>${qtda04BodyRows(data)}</tbody>
    </table>
    <table style="${noBorder}margin-top:30px">
      <tr>
        <td style="${noBorder}text-align:center;width:50%"><strong>NGƯỜI LẬP BIỂU</strong><br><em>(Ký, ghi rõ họ tên)</em><br><br><br><br></td>
        <td style="${noBorder}text-align:center"><em>..., ngày... tháng... năm ...</em><br><strong>CHỦ ĐẦU TƯ</strong><br><em>(Ký, đóng dấu, ghi rõ họ tên)</em><br><br><br><br></td>
      </tr>
    </table>
    <p style="font-size:11px"><em>Ghi chú: Tại cột 6 chủ đầu tư căn cứ các quy định của pháp luật về ngân sách nhà nước, đầu tư công, xây dựng, đấu thầu, thanh tra, kiểm toán và các quy định khác của pháp luật liên quan đến thực hiện dự án để ghi rõ nguyên nhân tăng, giảm của cột 5 so với cột 3, 4 (chủ đầu tư ghi trực tiếp vào mẫu biểu hoặc lặp thành Phụ lục riêng để ghi nội dung này).</em></p>
  `;
}

function exportQtda04(mode) {
  const project = getCurrentProject();
  if (!project) return;
  const body = buildQtda04HTML(project);
  if (mode === 'print') openPrintWindow(`Mẫu số 04/QTDA - ${esc(project.name)}`, body);
  else downloadWordDoc(project, 'Mau-so-04-QTDA', 'Mẫu số 04/QTDA', body);
}

// Sửa một dòng Mẫu 04: gói thầu (nhóm, giá trị đề nghị, nguyên nhân) hoặc dòng nhập tay
function openQtda04Item(kind, id, catId = '') {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  const pkg = kind === 'pkg' ? findPackage(catId, id).pkg : null;
  const line = kind === 'line' && id ? (project.qtdaLines || []).find(l => l.id === id) : null;
  if (kind === 'pkg' && !pkg) return;
  const group = pkg ? (pkg.costGroup || '') : (line?.group || 'VI');
  const groupOptions = (pkg ? `<option value="">Tự động (${getQtda04Group(pkg, project.categories.find(c => c.id === catId))})</option>` : '')
    + QTDA04_GROUPS.map(g => `<option value="${g.no}" ${group === g.no ? 'selected' : ''}>${g.no}. ${g.name}</option>`).join('');
  const reasonField = `<div class="form-group full-width"><label>Nguyên nhân tăng, giảm (cột 6)</label><textarea id="q4-reason">${esc((pkg ? pkg.settlementReason : line?.reason) || '')}</textarea></div>`;
  const body = pkg ? `
    <div class="form-grid">
      <div class="form-group full-width"><label>Gói thầu</label><input type="text" value="${esc(pkg.name)}" readonly></div>
      <div class="form-group"><label>Nhóm chi phí</label><select id="q4-group">${groupOptions}</select></div>
      <div class="form-group"><label>Giá trị đề nghị quyết toán (VNĐ)</label><input type="number" id="q4-propose" value="${pkg.settlementValue || ''}" placeholder="Để trống = lấy theo nghiệm thu (${formatNumberVN(pkg.acceptanceValue, '0')})"></div>
      ${reasonField}
    </div>` : `
    <div class="form-grid">
      <div class="form-group full-width"><label>Nội dung chi phí *</label><input type="text" id="q4-name" value="${esc(line?.name || '')}"></div>
      <div class="form-group"><label>Nhóm chi phí</label><select id="q4-group">${groupOptions}</select></div>
      <div class="form-group"><label>Tổng mức đầu tư (VNĐ)</label><input type="number" id="q4-invest" value="${line?.invest || ''}"></div>
      <div class="form-group"><label>Tổng dự toán (VNĐ)</label><input type="number" id="q4-estimate" value="${line?.estimate || ''}"></div>
      <div class="form-group"><label>Giá trị đề nghị quyết toán (VNĐ)</label><input type="number" id="q4-propose" value="${line?.propose || ''}"></div>
      ${reasonField}
    </div>`;
  openModal(pkg ? 'Sửa dòng Mẫu 04 — gói thầu' : (line ? 'Sửa dòng chi phí' : 'Thêm dòng chi phí'), body, `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="saveQtda04Item('${kind}','${id || ''}','${catId}')"><span class="material-symbols-rounded">save</span> Lưu</button>
  `);
}

function saveQtda04Item(kind, id, catId) {
  const project = getCurrentProject();
  const val = (fid) => document.getElementById(fid)?.value;
  if (kind === 'pkg') {
    const { pkg } = findPackage(catId, id);
    if (!pkg) return;
    pkg.costGroup = val('q4-group');
    pkg.settlementValue = Number(val('q4-propose')) || 0;
    pkg.settlementReason = val('q4-reason').trim();
    addAudit(project, 'update', 'quyết toán', pkg.name, 'Mẫu 04/QTDA');
  } else {
    const name = val('q4-name').trim();
    if (!name) { showToast('Vui lòng nhập nội dung chi phí', 'error'); return; }
    project.qtdaLines = project.qtdaLines || [];
    let line = id ? project.qtdaLines.find(l => l.id === id) : null;
    if (!line) { line = { id: generateId() }; project.qtdaLines.push(line); }
    Object.assign(line, {
      name, group: val('q4-group'),
      invest: Number(val('q4-invest')) || 0, estimate: Number(val('q4-estimate')) || 0, propose: Number(val('q4-propose')) || 0,
      reason: val('q4-reason').trim()
    });
    addAudit(project, 'update', 'quyết toán', name, 'Mẫu 04/QTDA');
  }
  saveState();
  closeModal();
  renderQtdaView();
  showToast('Đã lưu');
}

function deleteQtda04Line(id) {
  if (!requireEditPermission()) return;
  const project = getCurrentProject();
  project.qtdaLines = (project.qtdaLines || []).filter(l => l.id !== id);
  saveState();
  renderQtdaView();
  showToast('Đã xóa dòng chi phí', 'info');
}

function renderQtdaView() {
  const el = document.getElementById('qtda-container');
  if (!el) return;
  const project = getCurrentProject();
  if (!project) { el.innerHTML = ''; return; }

  const pkgs = project.categories.flatMap(c => c.packages);
  const pending = pkgs.filter(p => !isPackageComplete(p));
  const ready = pkgs.length > 0 && pending.length === 0;
  const d2 = buildQtda02Rows(project, project.qtdaInspections);
  const d4 = buildQtda04Data(project);
  const invest = Number(project.totalInvestment) || 0;

  el.innerHTML = `
    <div class="report-section">
      <div style="padding:12px 16px;border-radius:8px;border:1px solid ${ready ? '#bbf7d0' : '#fde68a'};background:${ready ? '#f0fdf4' : '#fffbeb'};font-size:0.88rem;line-height:1.6">
        <span class="material-symbols-rounded" style="vertical-align:middle;color:var(${ready ? '--accent-green' : '--accent-amber'})">${ready ? 'check_circle' : 'hourglass_top'}</span>
        ${ready
      ? `<strong>Tất cả ${pkgs.length} gói thầu đã nghiệm thu hoàn thành</strong> — có thể lập hồ sơ quyết toán.`
      : `<strong>Đã nghiệm thu ${pkgs.length - pending.length}/${pkgs.length} gói thầu.</strong> Số liệu bên dưới tự cập nhật theo dữ liệu hiện tại; chốt khi dự án hoàn thành.
           ${pending.length ? `<div style="font-size:0.8rem;color:var(--text-secondary)">Chưa hoàn thành: ${pending.slice(0, 6).map(p => esc(p.name)).join('; ')}${pending.length > 6 ? ` … (+${pending.length - 6})` : ''}</div>` : ''}`}
      </div>
    </div>

    <div class="report-section">
      <h3><span class="material-symbols-rounded">gavel</span> Mẫu số 02/QTDA — Danh mục văn bản</h3>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:4px 0 10px">Tự tổng hợp: mục I từ phần Pháp lý (${d2.legal.length} văn bản), mục II từ hợp đồng, phụ lục của các gói thầu (${d2.contracts.length} dòng), mục III nhập tay.</p>
      <div class="header-actions" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px">
        <button class="btn btn-secondary edit-only" onclick="openQtdaInspectionsModal()"><span class="material-symbols-rounded">edit</span> Nhập mục III (thanh tra, kiểm toán)</button>
        <button class="btn btn-secondary" onclick="exportQtda02('word')"><span class="material-symbols-rounded">description</span> Tải Word (.doc)</button>
        <button class="btn btn-primary" onclick="exportQtda02('print')"><span class="material-symbols-rounded">print</span> In / Xuất PDF</button>
      </div>
      <div class="report-table-wrapper">
        <table class="report-table">
          <thead><tr><th style="width:48px">Số TT</th><th>Tên văn bản</th><th>Số, ngày, tháng, năm ban hành</th><th>Cơ quan ban hành</th><th>Ghi chú</th></tr></thead>
          <tbody>${qtda02BodyRows(d2)}</tbody>
        </table>
      </div>
    </div>

    <div class="report-section">
      <h3><span class="material-symbols-rounded">table_chart</span> Mẫu số 04/QTDA — Chi tiết chi phí đầu tư đề nghị quyết toán</h3>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:4px 0 10px">Tự tổng hợp theo gói thầu: tổng mức đầu tư, dự toán và giá trị đề nghị quyết toán (mặc định lấy theo nghiệm thu, sửa được từng dòng). Chi phí không thuộc gói thầu (bồi thường, quản lý dự án, dự phòng...) thêm bằng "Thêm dòng chi phí".
        ${invest ? `<br>Tổng mức đầu tư của dự án: <strong>${formatNumberVN(invest)}</strong> đồng.` : ''}</p>
      <div class="header-actions" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px">
        <button class="btn btn-secondary edit-only" onclick="openQtda04Item('line','')"><span class="material-symbols-rounded">add</span> Thêm dòng chi phí</button>
        <button class="btn btn-secondary" onclick="exportQtda04('word')"><span class="material-symbols-rounded">description</span> Tải Word (.doc)</button>
        <button class="btn btn-primary" onclick="exportQtda04('print')"><span class="material-symbols-rounded">print</span> In / Xuất PDF</button>
      </div>
      <div class="report-table-wrapper">
        <table class="report-table">
          <thead>
            <tr><th style="width:48px">Số TT</th><th>Nội dung chi phí</th><th class="text-right">Tổng mức đầu tư được phê duyệt / điều chỉnh lần cuối</th><th class="text-right">Tổng dự toán được phê duyệt / điều chỉnh lần cuối</th><th class="text-right">Giá trị đề nghị quyết toán</th><th>Nguyên nhân tăng, giảm</th><th class="edit-only"></th></tr>
          </thead>
          <tbody>${qtda04BodyRows(d4, true)}</tbody>
        </table>
      </div>
    </div>`;
}

function exportPackageAcceptanceReport() {
  const project = getCurrentProject();
  if (!project) return;
  const today = new Date();
  const allPkgs = project.categories.flatMap(c => c.packages);
  const sum = (fn) => allPkgs.reduce((s, p) => s + fn(p), 0);
  const totalContract = sum(p => getCurrentContractValue(p));
  const totalAccepted = sum(p => p.acceptanceValue || 0);

  openPrintWindow(`Tổng hợp gói thầu - ${esc(project.name)}`, `
    <div class="print-header">
      <h2>${esc(project.owner || 'CHỦ ĐẦU TƯ')}</h2>
      <h3>DỰ ÁN: ${esc(project.fullName || project.name)}</h3>
      <hr style="width: 30%; margin: 8px auto; border: 0.5px solid #000;">
    </div>
    <div class="print-title">BẢNG TỔNG HỢP GÓI THẦU, GIÁ TRỊ HỢP ĐỒNG VÀ NGHIỆM THU</div>
    <div class="print-subtitle">Tính đến ngày ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">TT</th><th>Tên gói thầu</th><th>Nhà thầu</th>
          <th class="text-right">Dự toán</th><th class="text-right">Trúng thầu</th>
          <th class="text-right">Phát sinh đã duyệt</th><th class="text-right">Giá trị HĐ hiện hành</th>
          <th class="text-right">Nghiệm thu</th><th class="text-center">% NT</th><th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        ${allPkgs.map((p, i) => {
    const st = getAcceptanceStats(p);
    return `<tr>
          <td class="text-center">${i + 1}</td>
          <td>${esc(p.name)}</td>
          <td>${esc(p.contractor || '—')}</td>
          <td class="text-right">${formatCurrency(p.estimateValue)}</td>
          <td class="text-right">${formatCurrency(p.bidValue)}</td>
          <td class="text-right">${formatCurrency(getApprovedVariationTotal(p))}</td>
          <td class="text-right">${formatCurrency(st.contract)}</td>
          <td class="text-right">${formatCurrency(st.accepted)}</td>
          <td class="text-center">${st.percent != null ? st.percent.toFixed(1) + '%' : '—'}</td>
          <td>${PKG_STATUSES[getPackageStatus(p)].label}</td>
        </tr>`;
  }).join('')}
        <tr class="total-row">
          <td colspan="3" class="text-center">TỔNG CỘNG</td>
          <td class="text-right">${formatCurrency(sum(p => p.estimateValue || 0))}</td>
          <td class="text-right">${formatCurrency(sum(p => p.bidValue || 0))}</td>
          <td class="text-right">${formatCurrency(sum(p => getApprovedVariationTotal(p)))}</td>
          <td class="text-right">${formatCurrency(totalContract)}</td>
          <td class="text-right">${formatCurrency(totalAccepted)}</td>
          <td class="text-center">${totalContract > 0 ? (totalAccepted / totalContract * 100).toFixed(1) + '%' : '—'}</td>
          <td></td>
        </tr>
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

  openPrintWindow(`Báo cáo Bảo hành - ${esc(project.name)}`, `
    <div class="print-header">
      <h2>${esc(project.owner || 'CHỦ ĐẦU TƯ')}</h2>
      <h3>${project.projectScope === 'nonProject' ? 'MUA SẮM' : 'DỰ ÁN'}: ${esc(project.fullName || project.name)}</h3>
    </div>
    <div class="print-title">BÁO CÁO THEO DÕI THỜI HẠN BẢO HÀNH (XÂY DỰNG & MUA SẮM)</div>

    <div class="section-heading">THEO DÕI THỜI HẠN BẢO HÀNH</div>
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
        ${allPkgs.filter(p => p.handoverDate && (p.pkgType === 'construction' || p.pkgType === 'goods' || p.pkgType === 'mixed')).map((p, i) => {
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
// Pháp lý là nơi lưu trữ các quyết định / công văn của Sở Tài chính,
// Sở Xây dựng, UBND... liên quan đến dự án (phê duyệt dự án, dự toán, KHLCNT, phê duyệt kết quả...).
// Dữ liệu lưu trong project.initiations: [{ id, type, title, agency, number, date, note, files:[{id,name,size}] }]
let CHU_TRUONG_AGENCIES = ['Ủy ban nhân dân thành phố', 'Sở Tài chính', 'Sở Xây dựng', 'Cơ quan khác'];
let LEGAL_DOC_TYPES = [
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
];

let chuTruongEditId = null;
let chuTruongFiles = []; // PDF đang chờ lưu của hồ sơ đang mở

// ---- Render danh sách ----
function renderInitiationChuTruongList() {
  const project = getCurrentProject();
  const container = document.getElementById('initiations-container');
  if (!project) { if (container) container.innerHTML = ''; return; }
  const list = project.initiations || [];
  if (list.length === 0) {
    container.innerHTML = `<div class="ini-empty glass-card">
      <span class="material-symbols-rounded">folder_open</span>
      <p>Chưa có văn bản pháp lý nào. Bấm "Thêm văn bản pháp lý" để upload quyết định / công văn.</p>
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
            ${ini.type ? `<span class="tpl-chip" style="background:rgba(6,182,212,.1);color:var(--accent-cyan)">${esc(ini.type)}</span>` : ''}
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
  renderInitiationChuTruongList();
  if (typeof renderLegalRoadmap === 'function') renderLegalRoadmap();
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
  openModal(doc ? 'Sửa văn bản pháp lý' : 'Thêm văn bản pháp lý', `
    <div class="form-grid">
      <div class="form-group full-width"><label>Tiêu đề văn bản *</label><input type="text" id="ct-title" value="${esc(doc?.title || '')}"></div>
      <div class="form-group">
        <label>Loại văn bản</label>
        <select id="ct-type">
          <option value="">— Chọn —</option>
          ${LEGAL_DOC_TYPES.map(t => `<option value="${t}" ${doc?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cơ quan ban hành *</label>
        <input type="text" id="ct-agency" list="ct-agency-list" value="${esc(doc?.agency || '')}" placeholder="Chọn hoặc gõ cơ quan mới">
        <datalist id="ct-agency-list">${CHU_TRUONG_AGENCIES.map(a => `<option value="${a}"></option>`).join('')}</datalist>
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
  document.getElementById('ct-date').value = toDmy(doc?.date);
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
  const agency = document.getElementById('ct-agency').value.trim();
  const type = document.getElementById('ct-type').value;
  if (!title || !agency) { showToast('Vui lòng nhập tiêu đề và cơ quan ban hành', 'error'); return; }
  // Cập nhật danh sách cơ quan (nếu gõ cơ quan mới)
  if (agency && !CHU_TRUONG_AGENCIES.includes(agency)) {
    CHU_TRUONG_AGENCIES.push(agency);
  }
  const project = getCurrentProject();
  if (!project.initiations) project.initiations = [];
  if (chuTruongEditId) {
    const ini = project.initiations.find(i => i.id === chuTruongEditId);
    if (ini) {
      ini.title = title;
      ini.type = type;
      ini.agency = agency;
      ini.number = document.getElementById('ct-number').value.trim();
      ini.date = toIso(document.getElementById('ct-date').value);
      ini.note = document.getElementById('ct-note').value.trim();
      ini.files = [...chuTruongFiles];
    }
  } else {
    project.initiations.push({
      id: generateId(),
      title, type, agency,
      number: document.getElementById('ct-number').value.trim(),
      date: toIso(document.getElementById('ct-date').value),
      note: document.getElementById('ct-note').value.trim(),
      files: [...chuTruongFiles]
    });
  }
  addAudit(project, chuTruongEditId ? 'update' : 'create', 'pháp lý', title, `Cơ quan: ${agency}`);
  saveState(); closeModal(); renderInitiationView();
  showToast('Đã lưu văn bản pháp lý');
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
      <p>Xóa văn bản pháp lý:</p><p class="confirm-name">"${esc(ini.title || ini.name || '')}"?</p>
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
  addAudit(project, 'delete', 'pháp lý', ini.title);
  saveState(); closeModal(); renderInitiationView(); showToast('Đã xóa văn bản', 'info');
}

// ---- Chi tiết ----
function openChuTruongDetail(iniId) {
  const project = getCurrentProject();
  const ini = project.initiations?.find(i => i.id === iniId);
  if (!ini) return;
  const files = ini.files || [];
  openModal('Chi tiết văn bản pháp lý', `
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
function openModal(title, bodyHTML, footerHTML = '', size = '') {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  modal.classList.toggle('modal-lg', size === 'lg');
  modal.classList.toggle('modal-xl', size === 'xl');
  document.getElementById('modal-backdrop').classList.remove('hidden');
  modal.classList.remove('hidden');
  convertDateInputs();
}

// Đổi ô nhập ngày sang định dạng dd/mm/yyyy (độc lập với ngôn ngữ trình duyệt)
function convertDateInputs() {
  document.querySelectorAll('#modal input[type="date"]').forEach(inp => {
    const text = document.createElement('input');
    text.type = 'text';
    text.inputMode = 'numeric';
    text.placeholder = 'dd/mm/yyyy';
    text.id = inp.id;
    text.value = toDmy(inp.value);
    text.readOnly = inp.readOnly;
    text.setAttribute('autocomplete', 'off');
    inp.replaceWith(text);
  });
}

function closeModal() {
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
}

let previewObjectUrl = null;

const PKG_TYPE_INFO = {
  construction: { label: 'Gói XÂY LẮP', hint: 'Thời gian thi công, tiến độ %, nghiệm thu khối lượng, bàn giao & bảo hành công trình.' },
  consulting: { label: 'Gói TƯ VẤN', hint: 'Thời gian thực hiện, nghiệm thu hồ sơ tư vấn.' },
  goods: { label: 'Gói HÀNG HÓA (MUA SẮM)', hint: 'Nghiệm thu, bàn giao & bảo hành thiết bị / hàng hóa.' },
  mixed: { label: 'Gói HỖN HỢP', hint: 'Nghiệm thu khối lượng, bàn giao & bảo hành.' },
  nonConsulting: { label: 'Gói PHI TƯ VẤN', hint: 'Thời gian thực hiện, nghiệm thu hồ sơ.' }
};

function togglePkgTypeFields() {
  const sel = document.getElementById('f-pkgType');
  if (!sel) return;
  const type = sel.value;
  document.querySelectorAll('.pkg-show').forEach(el => {
    const show = (el.dataset.show || '').split(' ').includes(type);
    el.style.display = show ? '' : 'none';
  });
  const info = PKG_TYPE_INFO[type];
  const banner = document.getElementById('pkg-type-banner');
  if (banner && info) {
    banner.innerHTML = `<strong style="color:var(--accent-cyan)">${info.label}</strong> — ${info.hint}`;
  }
}

function toggleQuoteFields() {
  const cb = document.getElementById('f-hasQuote');
  const fields = document.getElementById('quote-fields');
  if (fields && cb) fields.style.display = cb.checked ? '' : 'none';
}

function togglePkgScopeFields() {
  const scope = document.getElementById('f-pkgScope');
  const fund = document.getElementById('f-fundSource');
  const purchaseTypeField = document.getElementById('purchase-type-field');
  if (!scope) return;
  const isNonProject = scope.value === 'nonProject';
  if (fund && isNonProject && !fund.value) {
    fund.value = FUND_SOURCES[0] || 'Kinh phí quỹ phát triển sự nghiệp';
  }
  if (purchaseTypeField) purchaseTypeField.style.display = isNonProject ? '' : 'none';
}

let tempUploadedPDFs = [];
let tempPayments = [];

// ---- Package CRUD ----
function getPackageFormHTML(pkg = null, catId = '') {
  const methods = SELECTION_METHODS;
  const pkgId = pkg?.id || '';
  const effectiveScope = pkg ? (pkg.pkgScope || 'project') : (getCurrentProject()?.projectScope || 'project');
  const legalDocs = getCurrentProject()?.initiations || [];
  const khlcntDocs = legalDocs.filter(d => d.type === 'Phê duyệt KHLCNT');
  const resultDocs = legalDocs.filter(d => d.type === 'Quyết định phê duyệt kết quả');
  const docOpts = (docs, sel) => docs.map(d => `<option value="${esc(d.id)}" ${sel === d.id ? 'selected' : ''}>${esc([d.number, d.title].filter(Boolean).join(' — ') || '—')}</option>`).join('');
  const fundOptions = FUND_SOURCES.map(f => `<option value="${f}" ${(pkg?.fundSource || '') === f ? 'selected' : ''}>${f}</option>`).join('');
  const legacyFund = pkg?.fundSource && !FUND_SOURCES.includes(pkg.fundSource) ? `<option value="${esc(pkg.fundSource)}" selected>${esc(pkg.fundSource)}</option>` : '';
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
    <div class="form-grid form-single">
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
      <div class="form-group">
        <label>Phạm vi gói thầu</label>
        <select id="f-pkgScope" onchange="togglePkgScopeFields()">
          <option value="project" ${effectiveScope === 'project' ? 'selected' : ''}>Thuộc dự án</option>
          <option value="nonProject" ${effectiveScope === 'nonProject' ? 'selected' : ''}>Không hình thành dự án (dự toán mua sắm)</option>
        </select>
      </div>
      <div id="purchase-type-field" style="${effectiveScope === 'nonProject' ? '' : 'display:none'}">
      <div class="form-group">
        <label>Loại hình mua sắm</label>
        <select id="f-purchaseType">
          <option value="">— Chọn —</option>
          ${PURCHASE_TYPES.map(t => `<option value="${t}" ${pkg?.purchaseType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      </div>
      <div class="form-group full-width" style="grid-column:1/-1">
        <div id="pkg-type-banner" style="padding:8px 14px;border-radius:8px;background:rgba(6,182,212,.07);border:1px solid rgba(6,182,212,.25);font-size:0.82rem;color:var(--text-secondary)">
          <strong style="color:var(--accent-cyan)">${PKG_TYPE_INFO[pkg?.pkgType || 'construction'].label}</strong> — ${PKG_TYPE_INFO[pkg?.pkgType || 'construction'].hint}
        </div>
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
        <select id="f-fundSource">
          <option value="">— Chọn —</option>
          ${fundOptions}
          ${legacyFund}
        </select>
      </div>
      <div data-show="goods nonConsulting mixed" class="pkg-show">
        <div class="form-group full-width" style="grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
          <input type="checkbox" id="f-hasQuote" ${pkg?.quoteNumber || pkg?.quoteDate || pkg?.quoteCount ? 'checked' : ''} style="width:auto;height:16px;width:16px" onchange="toggleQuoteFields()">
          <label for="f-hasQuote" style="text-transform:none;font-size:0.9rem;font-weight:600;color:var(--accent-amber);cursor:pointer;margin:0">
            Gói thầu có lấy báo giá (khi không có định mức / đơn giá)
          </label>
          <span class="material-symbols-rounded" style="color:var(--accent-amber)">price_check</span>
        </div>
        <div id="quote-fields" style="${pkg?.quoteNumber || pkg?.quoteDate || pkg?.quoteCount ? '' : 'display:none'}">
        <div class="form-group">
          <label>Số yêu cầu báo giá</label>
          <input type="text" id="f-quoteNumber" value="${esc(pkg?.quoteNumber || '')}" placeholder="Số YCBG / báo giá">
        </div>
        <div class="form-group">
          <label>Ngày đăng yêu cầu báo giá</label>
          <input type="date" id="f-quoteDate" value="${pkg?.quoteDate || ''}">
        </div>
        <div class="form-group">
          <label>Số báo giá nhận được</label>
          <input type="number" id="f-quoteCount" min="0" value="${pkg?.quoteCount ?? ''}" placeholder="Tối thiểu 01 báo giá">
        </div>
        </div>
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">description</span> Thông tin hợp đồng</div>
      <div class="form-group">
        <label>Kế hoạch lựa chọn nhà thầu (KHLCNT)</label>
        <select id="f-khlcntDoc">
          <option value="">— Chọn từ Pháp lý —</option>
          ${docOpts(khlcntDocs, pkg?.khlcntDocId)}
        </select>
      </div>
      <div class="form-group">
        <label>Quyết định phê duyệt kết quả</label>
        <select id="f-resultDoc">
          <option value="">— Chọn từ Pháp lý —</option>
          ${docOpts(resultDocs, pkg?.resultDocId)}
        </select>
      </div>
      <div class="form-group full-width">
        <label>Biên bản thương thảo hợp đồng (số + ngày, hoặc chỉ ngày)</label>
        <input type="text" id="f-negotiation" value="${esc(pkg?.negotiation || '')}" placeholder="VD: Số 05/BBTT ngày 12/03/2026 — nếu không có số chỉ điền ngày">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Biên bản thương thảo hợp đồng')}
      <div class="form-group">
        <label>Hợp đồng</label>
        <input type="text" id="f-contract" value="${esc(pkg?.contract || '')}">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Hợp đồng')}
      <div class="form-group">
        <label>Phụ lục 02a — Bảng thông tin hợp đồng</label>
        <input type="date" id="f-pl02aDate" value="${pkg?.pl02aDate || ''}">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Phụ lục 02a - Bảng thông tin hợp đồng')}
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
        <label>Phụ lục hợp đồng (nếu có)</label>
        <input type="text" id="f-contractExtension" value="${esc(pkg?.contractExtension || '')}" placeholder="VD: PL01/HĐ ngày ...">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Phụ lục hợp đồng')}
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
      <div class="form-group">
        <label>Thời gian thực hiện</label>
        <input type="text" id="f-duration" value="${esc(pkg?.duration || '')}" placeholder="VD: 6 tháng">
      </div>
      <div data-show="construction" class="pkg-show">
        <div class="form-group">
          <label>Tiến độ (%)</label>
          <input type="number" id="f-progress" min="0" max="100" value="${pkg?.progress ?? ''}">
        </div>
      </div>
      <div class="form-section-title"><span class="material-symbols-rounded">assessment</span> Giá trị thực hiện & thanh toán</div>
      <div class="form-group">
        <label>Lũy kế giá trị thực hiện (VNĐ)</label>
        <input type="number" id="f-cumulativeValue" value="${pkg?.cumulativeValue || ''}">
      </div>
      <div class="form-group">
        <label>Đã thanh toán (VNĐ)</label>
        <input type="number" id="f-cumulativeDisbursed" value="${pkg?.cumulativeDisbursed || ''}">
      </div>
      <div data-show="consulting nonConsulting" data-hide="construction mixed goods" class="pkg-show">
        <div class="form-section-title"><span class="material-symbols-rounded">verified_user</span> Nghiệm thu hồ sơ</div>
        <div class="form-group">
          <label>Số biên bản nghiệm thu hồ sơ</label>
          <input type="text" id="f-docAcceptRecord" value="${esc(pkg?.docAcceptRecord || '')}" placeholder="Số biên bản nghiệm thu">
        </div>
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
        ${docAttachBlock(catId, pkgId, pkg, 'Biên bản nghiệm thu hồ sơ')}
      </div>

      <div class="form-section-title"><span class="material-symbols-rounded">tenancy</span> Nghiệm thu hoàn thành</div>
      ${pkg?.acceptances?.length ? `<p class="form-hint" style="grid-column:1/-1;margin:0;font-size:0.78rem;color:var(--text-muted)">Giá trị và ngày tự tính từ các đợt nghiệm thu. Thêm/sửa đợt trong mục Chi tiết gói thầu.</p>` : ''}
      <div class="form-group">
        <label>Giá trị nghiệm thu hoàn thành (VNĐ)</label>
        <input type="number" id="f-acceptanceValue" value="${pkg?.acceptanceValue || ''}" ${pkg?.acceptances?.length ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label>Trạng thái</label>
        <select id="f-acceptanceStatus">
          ${ACCEPTANCE_STATUSES.map(s => `<option value="${s}" ${(pkg?.acceptanceStatus || ACCEPTANCE_STATUSES[0]) === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Ngày nghiệm thu hoàn thành</label>
        <input type="date" id="f-acceptanceDate" value="${pkg?.acceptanceDate || ''}" ${pkg?.acceptances?.length ? 'readonly' : ''}>
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Biên bản nghiệm thu hoàn thành')}
      <div class="form-group">
        <label>Phụ lục 03a — Giá trị khối lượng (VNĐ)</label>
        <input type="number" id="f-pl03aValue" value="${pkg?.pl03aValue || ''}">
      </div>
      <div class="form-group">
        <label>Ngày PL 03a</label>
        <input type="date" id="f-pl03aDate" value="${pkg?.pl03aDate || ''}">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Phụ lục 03a - Bảng tính giá trị khối lượng')}

      <div class="form-section-title"><span class="material-symbols-rounded">receipt</span> Hóa đơn GTGT (NĐ 123/2020)</div>
      ${pkg?.invoices?.length ? `<p class="form-hint" style="grid-column:1/-1;margin:0;font-size:0.78rem;color:var(--text-muted)">Đã có ${pkg.invoices.length} hóa đơn (tổng ${formatCurrency(pkg.invoices.reduce((s, i) => s + (Number(i.value) || 0), 0))}). Thêm/sửa trong mục Chi tiết gói thầu.</p>` : `<p class="form-hint" style="grid-column:1/-1;margin:0;font-size:0.78rem;color:var(--text-muted)">Hóa đơn được thêm theo từng đợt trong mục Chi tiết gói thầu.</p>`}
      ${docAttachBlock(catId, pkgId, pkg, 'Hóa đơn GTGT')}

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
        <div class="form-group">
          <label>Chứng thư bảo lãnh bảo hành (nếu có)</label>
          <input type="text" id="f-warrantyGuaranteeNumber" value="${esc(pkg?.warrantyGuaranteeNumber || '')}" placeholder="Số chứng thư bảo lãnh">
        </div>
        <div class="form-group">
          <label>Ngày chứng thư bảo lãnh</label>
          <input type="date" id="f-warrantyGuaranteeDate" value="${pkg?.warrantyGuaranteeDate || ''}">
        </div>
        <div class="form-group">
          <label>Giá trị bảo lãnh (VNĐ)</label>
          <input type="number" id="f-warrantyGuaranteeValue" value="${pkg?.warrantyGuaranteeValue || ''}">
        </div>
        ${docAttachBlock(catId, pkgId, pkg, 'Chứng thư bảo lãnh bảo hành')}
      </div>

      <div class="form-section-title"><span class="material-symbols-rounded">receipt_long</span> Quyết toán A-B / Thanh lý</div>
      <div class="form-group">
        <label>Biên bản thanh lý hợp đồng</label>
        <input type="text" id="f-liquidationRecord" value="${esc(pkg?.liquidationRecord || '')}" placeholder="Số biên bản thanh lý">
      </div>
      <div class="form-group">
        <label>Ngày thanh lý hợp đồng</label>
        <input type="date" id="f-liquidationDate" value="${pkg?.liquidationDate || ''}">
      </div>
      <div class="form-group">
        <label>Giá trị thanh lý (VNĐ)</label>
        <input type="number" id="f-liquidationValue" value="${pkg?.liquidationValue || ''}">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Biên bản thanh lý hợp đồng')}
      <div class="form-group">
        <label>Phụ lục 01.QTDA — Giá trị quyết toán (VNĐ)</label>
        <input type="number" id="f-pl01qdaValue" value="${pkg?.pl01qdaValue || ''}">
      </div>
      <div class="form-group">
        <label>Ngày PL 01.QTDA</label>
        <input type="date" id="f-pl01qdaDate" value="${pkg?.pl01qdaDate || ''}">
      </div>
      ${docAttachBlock(catId, pkgId, pkg, 'Phụ lục 01.QTDA - Quyết toán A-B')}

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
            <option value="Biên bản thương thảo hợp đồng">Biên bản thương thảo hợp đồng</option>
            <option value="Hợp đồng">Hợp đồng</option>
            <option value="Phụ lục 02a - Bảng thông tin hợp đồng">Phụ lục 02a - Bảng thông tin hợp đồng</option>
            <option value="Biên bản nghiệm thu">Biên bản nghiệm thu</option>
            <option value="Phụ lục 03a - Bảng tính giá trị khối lượng">Phụ lục 03a - Bảng tính giá trị khối lượng</option>
            <option value="Hóa đơn GTGT">Hóa đơn GTGT</option>
            <option value="Chứng thư bảo lãnh bảo hành">Chứng thư bảo lãnh bảo hành</option>
            <option value="Phụ lục 01.QTDA - Quyết toán A-B">Phụ lục 01.QTDA - Quyết toán A-B</option>
            <option value="Biên bản thanh lý hợp đồng">Biên bản thanh lý hợp đồng</option>
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
  const pkgType = document.getElementById('f-pkgType').value || 'construction';
  const pkgScope = document.getElementById('f-pkgScope').value || 'project';
  const quoteApplies = ['goods', 'nonConsulting', 'mixed'].includes(pkgType);
  const hasQuote = quoteApplies && document.getElementById('f-hasQuote')?.checked;
  const legalDocs = getCurrentProject()?.initiations || [];
  const resultDocId = document.getElementById('f-resultDoc')?.value || '';
  const khlcntDocId = document.getElementById('f-khlcntDoc')?.value || '';
  const resultDoc = legalDocs.find(d => d.id === resultDocId);
  const khlcntDoc = legalDocs.find(d => d.id === khlcntDocId);
  return {
    name: document.getElementById('f-name').value.trim(),
    pkgType,
    pkgScope,
    purchaseType: pkgScope === 'nonProject' ? document.getElementById('f-purchaseType').value : '',
    estimateValue: Number(document.getElementById('f-estimateValue').value) || 0,
    bidValue: Number(document.getElementById('f-bidValue').value) || 0,
    fundSource: document.getElementById('f-fundSource').value.trim(),
    resultDocId,
    bidDecision: resultDoc ? (resultDoc.number || resultDoc.title) : '',
    resultApprovalDate: resultDoc?.date || '',
    contract: document.getElementById('f-contract').value.trim(),
    negotiation: document.getElementById('f-negotiation').value.trim(),
    pl02aDate: toIso(document.getElementById('f-pl02aDate').value),
    selectionMethod: document.getElementById('f-selectionMethod').value,
    contractor: document.getElementById('f-contractor').value.trim(),
    quoteNumber: hasQuote ? document.getElementById('f-quoteNumber').value.trim() : '',
    quoteDate: hasQuote ? toIso(document.getElementById('f-quoteDate').value) : '',
    quoteCount: hasQuote ? (Number(document.getElementById('f-quoteCount').value) || 0) : 0,
    khlcntDocId,
    khlcntNumber: khlcntDoc ? (khlcntDoc.number || khlcntDoc.title) : '',
    khlcntDate: khlcntDoc?.date || '',
    duration: document.getElementById('f-duration').value.trim(),
    progress: Number(document.getElementById('f-progress').value) || 0,
    cumulativeValue: Number(document.getElementById('f-cumulativeValue').value) || 0,
    cumulativeDisbursed: Number(document.getElementById('f-cumulativeDisbursed').value) || 0,

    docAcceptRecord: document.getElementById('f-docAcceptRecord').value.trim(),
    docAcceptDate: toIso(document.getElementById('f-docAcceptDate').value),
    docAcceptStatus: document.getElementById('f-docAcceptStatus').value,

    acceptanceValue: Number(document.getElementById('f-acceptanceValue').value) || 0,
    acceptanceStatus: document.getElementById('f-acceptanceStatus').value,
    acceptanceDate: toIso(document.getElementById('f-acceptanceDate').value),
    pl03aValue: Number(document.getElementById('f-pl03aValue').value) || 0,
    pl03aDate: toIso(document.getElementById('f-pl03aDate').value),
    contractType: document.getElementById('f-contractType').value,
    contractSignDate: toIso(document.getElementById('f-contractSignDate').value),
    contractStartDate: toIso(document.getElementById('f-contractStartDate').value),
    contractEndDate: toIso(document.getElementById('f-contractEndDate').value),
    contractExtension: document.getElementById('f-contractExtension').value.trim(),
    liquidationRecord: document.getElementById('f-liquidationRecord').value.trim(),
    liquidationDate: toIso(document.getElementById('f-liquidationDate').value),
    liquidationValue: Number(document.getElementById('f-liquidationValue').value) || 0,
    pl01qdaValue: Number(document.getElementById('f-pl01qdaValue').value) || 0,
    pl01qdaDate: toIso(document.getElementById('f-pl01qdaDate').value),
    handoverDate: toIso(document.getElementById('f-handoverDate').value),
    warrantyMonths: document.getElementById('f-warrantyMonths').value ? Number(document.getElementById('f-warrantyMonths').value) : null,
    warrantyGuaranteeNumber: ['construction', 'mixed', 'goods'].includes(pkgType) ? document.getElementById('f-warrantyGuaranteeNumber').value.trim() : '',
    warrantyGuaranteeDate: ['construction', 'mixed', 'goods'].includes(pkgType) ? toIso(document.getElementById('f-warrantyGuaranteeDate').value) : '',
    warrantyGuaranteeValue: ['construction', 'mixed', 'goods'].includes(pkgType) ? (Number(document.getElementById('f-warrantyGuaranteeValue').value) || 0) : 0,
    notes: document.getElementById('f-notes').value.trim()
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
  `, 'lg');
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
  data.acceptances = [];
  data.invoices = [];
  ensureAcceptanceEntry(data);
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
  `, 'lg');
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
  pkg.acceptances = pkg.acceptances || [];
  ensureAcceptanceEntry(pkg);
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

  const pdfGroups = {};
  (pkg.pdfs || []).forEach(pdf => {
    const key = pdf.category || 'Hồ sơ khác';
    (pdfGroups[key] = pdfGroups[key] || []).push(pdf);
  });
  const pdfListHTML = (pkg.pdfs?.length)
    ? Object.keys(pdfGroups).map(cat => `
        <div class="pdf-group">
          <div class="pdf-group-title"><span class="material-symbols-rounded">folder</span>${esc(cat)} <small>(${pdfGroups[cat].length})</small></div>
          ${pdfGroups[cat].map(pdf => `
            <div class="pdf-item">
              <span class="material-symbols-rounded">attach_file</span>
              <span class="pdf-name" onclick="viewPDF('${pdf.id}')" title="Nhấn để xem">${esc(pdf.name)}</span>
              <span class="pdf-size">${formatFileSize(pdf.size)}</span>
              <button class="btn-icon btn-sm edit-only" title="Xóa file" onclick="removePDF('${catId}','${pkgId}','${pdf.id}')">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          `).join('')}
        </div>
      `).join('')
    : '<p class="pdf-empty">Chưa có file đính kèm</p>';

  const invoices = [...(pkg.invoices || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const invoicesHTML = invoices.length
    ? `<table class="report-table"><thead><tr><th>Đợt</th><th>Ngày</th><th>Số hóa đơn</th><th class="text-right">Giá trị</th><th>XML</th><th></th></tr></thead><tbody>
        ${invoices.map((inv, i) => `<tr>
          <td>${i + 1}</td>
          <td>${formatDateVN(inv.date)}</td>
          <td>${esc(inv.number || '—')}</td>
          <td class="text-right">${formatCurrency(inv.value)}</td>
          <td>${inv.xml ? '<span class="badge badge-success">XML</span>' : '<span class="badge badge-neutral">—</span>'}</td>
          <td class="edit-only" style="white-space:nowrap">
            <button class="btn-icon btn-sm" title="Sửa" onclick="openInvoiceForm('${catId}','${pkgId}','${inv.id}')"><span class="material-symbols-rounded">edit</span></button>
            <button class="btn-icon btn-sm" title="Xóa" onclick="deleteInvoice('${catId}','${pkgId}','${inv.id}')"><span class="material-symbols-rounded">delete</span></button>
          </td>
        </tr>`).join('')}
      </tbody></table>`
    : '<p class="pdf-empty">Chưa có hóa đơn GTGT</p>';

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
      ${pkg.quoteNumber || pkg.quoteDate || pkg.quoteCount ? `
      <div class="detail-item">
        <span class="detail-label">Báo giá</span>
        <span class="detail-value">${esc(pkg.quoteNumber || '—')}${pkg.quoteDate ? ` — đăng ${formatDateVN(pkg.quoteDate)}` : ''}${pkg.quoteCount ? ` · ${pkg.quoteCount} báo giá` : ''}</span>
      </div>` : ''}
      <div class="detail-item">
        <span class="detail-label">Phạm vi gói thầu</span>
        <span class="detail-value">${pkg.pkgScope === 'nonProject' ? 'Không hình thành dự án (dự toán mua sắm)' : 'Thuộc dự án'}</span>
      </div>
      ${pkg.purchaseType ? `
      <div class="detail-item">
        <span class="detail-label">Loại hình mua sắm</span>
        <span class="detail-value">${esc(pkg.purchaseType)}</span>
      </div>` : ''}
      <div class="detail-section-title">Thông tin hợp đồng</div>
      ${pkg.khlcntNumber || pkg.khlcntDate ? `
      <div class="detail-item">
        <span class="detail-label">KHLCNT</span>
        <span class="detail-value">${esc(pkg.khlcntNumber || '—')}${pkg.khlcntDate ? ` — ${formatDateVN(pkg.khlcntDate)}` : ''}</span>
      </div>` : ''}
      <div class="detail-item">
        <span class="detail-label">Quyết định phê duyệt kết quả</span>
        <span class="detail-value">${esc(pkg.bidDecision || '—')}${pkg.resultApprovalDate ? ` — ${formatDateVN(pkg.resultApprovalDate)}` : ''}</span>
      </div>
      ${pkg.negotiation ? `
      <div class="detail-item">
        <span class="detail-label">Biên bản thương thảo hợp đồng</span>
        <span class="detail-value">${esc(pkg.negotiation)}</span>
      </div>` : ''}
      <div class="detail-item">
        <span class="detail-label">Hợp đồng</span>
        <span class="detail-value">${esc(pkg.contract || '—')}</span>
      </div>
      ${pkg.pl02aDate ? `
      <div class="detail-item">
        <span class="detail-label">Phụ lục 02a — Bảng thông tin hợp đồng</span>
        <span class="detail-value">${formatDateVN(pkg.pl02aDate)}</span>
      </div>` : ''}
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
        <span class="detail-value"><span class="badge ${(() => { const r = getContractRoute(pkg); return r.code === 'ktkt' ? 'badge-warning' : (r.code === 'bcnckt' ? 'badge-info' : (r.code === 'competitive' ? 'badge-info' : (r.code === 'directPurchase' ? 'badge-success' : 'badge-neutral'))); })()}">${getContractRoute(pkg).name}</span> <small class="detail-sub">${getContractRoute(pkg).hint}</small></span>
      </div>
      <div class="detail-item ${pkg.contractExtension ? '' : 'full-width'}">
        <span class="detail-label">Phụ lục hợp đồng</span>
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
        <span class="detail-label">Số biên bản nghiệm thu hồ sơ</span>
        <span class="detail-value">${esc(pkg.docAcceptRecord || '—')}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ngày nghiệm thu</span>
        <span class="detail-value">${formatDateVN(pkg.docAcceptDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Trạng thái</span>
        <span class="detail-value"><span class="badge ${pkg.docAcceptStatus === 'Đã nghiệm thu' ? 'badge-success' : 'badge-warning'}">${pkg.docAcceptStatus || 'Chưa nghiệm thu'}</span></span>
      </div>
      ` : ''}
      ${(() => {
        const st = getAcceptanceStats(pkg);
        const accs = [...(pkg.acceptances || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const vars = pkg.variations || [];
        const varStatus = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
        return `
      <div class="detail-section-title">Giá trị hợp đồng & nghiệm thu</div>
      <div class="detail-item"><span class="detail-label">Trạng thái gói thầu</span><span class="detail-value">${getPackageStatusBadge(pkg)}</span></div>
      <div class="detail-item"><span class="detail-label">Giá trị trúng thầu</span><span class="detail-value money">${formatCurrency(pkg.bidValue)}</span></div>
      <div class="detail-item"><span class="detail-label">Phát sinh đã duyệt</span><span class="detail-value money">${formatCurrency(getApprovedVariationTotal(pkg))}</span></div>
      <div class="detail-item"><span class="detail-label">Giá trị hợp đồng hiện hành</span><span class="detail-value money"><strong>${formatCurrency(st.contract)}</strong></span></div>
      <div class="detail-item"><span class="detail-label">Giá trị nghiệm thu lũy kế</span><span class="detail-value money">${formatCurrency(st.accepted)}</span></div>
      <div class="detail-item"><span class="detail-label">% nghiệm thu / hợp đồng</span><span class="detail-value">${st.percent != null ? `<span class="${st.percent > 100 ? 'badge badge-danger' : ''}">${formatPercent(st.percent)}</span>` : '—'}</span></div>
      <div class="detail-item"><span class="detail-label">Còn lại chưa nghiệm thu</span><span class="detail-value money">${st.remaining != null ? formatCurrency(st.remaining) : '—'}</span></div>
      <div class="detail-item"><span class="detail-label">Chênh lệch dự toán - trúng thầu</span><span class="detail-value money">${st.saving != null ? formatCurrency(st.saving) : '—'}</span></div>
      <div class="detail-item"><span class="detail-label">Trạng thái nghiệm thu</span><span class="detail-value"><span class="badge ${pkg.acceptanceStatus === 'Đã nghiệm thu' ? 'badge-success' : 'badge-warning'}">${pkg.acceptanceStatus || 'Chưa nghiệm thu'}</span></span></div>
      <div class="detail-item"><span class="detail-label">Ngày nghiệm thu gần nhất</span><span class="detail-value">${formatDateVN(pkg.acceptanceDate)}</span></div>
      ${pkg.pl03aValue || pkg.pl03aDate ? `
      <div class="detail-item"><span class="detail-label">Phụ lục 03a — Giá trị khối lượng</span><span class="detail-value money">${pkg.pl03aValue ? formatCurrency(pkg.pl03aValue) : '—'}${pkg.pl03aDate ? ` — ${formatDateVN(pkg.pl03aDate)}` : ''}</span></div>` : ''}

      <div class="detail-section-title">Các đợt nghiệm thu
        <button type="button" class="btn btn-secondary btn-sm edit-only" style="margin-left:8px" onclick="openAcceptanceForm('${catId}','${pkgId}')"><span class="material-symbols-rounded">add</span> Thêm đợt</button>
      </div>
      <div class="detail-item full-width">
        ${accs.length ? `<table class="report-table"><thead><tr><th>Đợt</th><th>Ngày</th><th>Số biên bản</th><th class="text-right">Giá trị</th><th>Ghi chú</th><th></th></tr></thead><tbody>
          ${accs.map((a, i) => `<tr>
            <td>${i + 1}${a.final ? ' <span class="badge badge-success">Hoàn thành</span>' : ''}</td>
            <td>${formatDateVN(a.date)}</td>
            <td>${esc(a.doc || '—')}</td>
            <td class="text-right">${formatCurrency(a.value)}</td>
            <td>${esc(a.note || '')}</td>
            <td class="edit-only" style="white-space:nowrap">
              <button class="btn-icon btn-sm" title="Sửa" onclick="openAcceptanceForm('${catId}','${pkgId}','${a.id}')"><span class="material-symbols-rounded">edit</span></button>
              <button class="btn-icon btn-sm" title="Xóa" onclick="deleteAcceptance('${catId}','${pkgId}','${a.id}')"><span class="material-symbols-rounded">delete</span></button>
            </td></tr>`).join('')}
        </tbody></table>` : '<p class="pdf-empty">Chưa có đợt nghiệm thu</p>'}
      </div>

      <div class="detail-section-title">Phát sinh khối lượng
        <button type="button" class="btn btn-secondary btn-sm edit-only" style="margin-left:8px" onclick="addVariation('${catId}','${pkgId}')"><span class="material-symbols-rounded">add</span> Thêm phát sinh</button>
      </div>
      <div class="detail-item full-width">
        ${vars.length ? `<table class="report-table"><thead><tr><th>Ngày</th><th class="text-right">Giá trị</th><th>Trạng thái</th><th>Người duyệt</th><th>Lý do</th><th></th></tr></thead><tbody>
          ${vars.map(v => `<tr>
            <td>${formatDateVN(v.date)}</td>
            <td class="text-right">${formatCurrency(v.amount)}</td>
            <td>${varStatus[v.status] || esc(v.status || '')}</td>
            <td>${esc(v.approvedBy || '—')}</td>
            <td>${esc(v.reason || '')}</td>
            <td class="edit-only"><button class="btn-icon btn-sm" title="Xóa" onclick="deleteVariation('${catId}','${pkgId}','${v.id}')"><span class="material-symbols-rounded">delete</span></button></td>
          </tr>`).join('')}
        </tbody></table>` : '<p class="pdf-empty">Chưa có phát sinh</p>'}
      </div>`;
      })()}

      <div class="detail-section-title">Hóa đơn GTGT (NĐ 123/2020)
        <button type="button" class="btn btn-secondary btn-sm edit-only" style="margin-left:8px" onclick="openInvoiceForm('${catId}','${pkgId}')"><span class="material-symbols-rounded">add</span> Thêm hóa đơn</button>
      </div>
      <div class="detail-item full-width">
        ${invoicesHTML}
      </div>
      ${(() => { const ca = computeContractAlerts(pkg); return ca.length ? `<div class="detail-item full-width"><span class="detail-label">Cảnh báo hợp đồng</span><span class="detail-value">${ca.map(a => `<div class="log-item" style="margin-top:2px"><span class="material-symbols-rounded" style="font-size:16px;color:var(--accent-${a.level === 'danger' ? 'red' : 'amber'})">${a.icon}</span> ${esc(a.message)}</div>`).join('')}</span></div>` : ''; })()}

      ${pkg.pkgType !== 'consulting' && pkg.pkgType !== 'nonConsulting' ? `
      <div class="detail-section-title">Bàn giao & Bảo hành</div>
      <div class="detail-item">
        <span class="detail-label">Ngày bàn giao</span>
        <span class="detail-value">${formatDateVN(pkg.handoverDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Thời hạn bảo hành</span>
        <span class="detail-value">${pkg.warrantyMonths || computeWarrantyMonths(project.buildingGrade)} tháng</span>
      </div>
      ${pkg.warrantyGuaranteeNumber || pkg.warrantyGuaranteeDate || pkg.warrantyGuaranteeValue ? `
      <div class="detail-item">
        <span class="detail-label">Chứng thư bảo lãnh bảo hành</span>
        <span class="detail-value">${esc(pkg.warrantyGuaranteeNumber || '—')}${pkg.warrantyGuaranteeDate ? ` — ${formatDateVN(pkg.warrantyGuaranteeDate)}` : ''}${pkg.warrantyGuaranteeValue ? ` · ${formatCurrency(pkg.warrantyGuaranteeValue)}` : ''}</span>
      </div>` : ''}
      ` : ''}

      ${pkg.liquidationRecord || pkg.liquidationDate || pkg.liquidationValue || pkg.pl01qdaValue || pkg.pl01qdaDate ? `
      <div class="detail-section-title">Quyết toán A-B / Thanh lý</div>
      ${pkg.liquidationRecord ? `
      <div class="detail-item">
        <span class="detail-label">Biên bản thanh lý hợp đồng</span>
        <span class="detail-value">${esc(pkg.liquidationRecord)}</span>
      </div>` : ''}
      <div class="detail-item">
        <span class="detail-label">Ngày thanh lý hợp đồng</span>
        <span class="detail-value">${formatDateVN(pkg.liquidationDate)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Giá trị thanh lý</span>
        <span class="detail-value money">${formatCurrency(pkg.liquidationValue)}</span>
      </div>
      ${pkg.pl01qdaValue || pkg.pl01qdaDate ? `
      <div class="detail-item">
        <span class="detail-label">Phụ lục 01.QTDA — Giá trị quyết toán</span>
        <span class="detail-value money">${pkg.pl01qdaValue ? formatCurrency(pkg.pl01qdaValue) : '—'}${pkg.pl01qdaDate ? ` — ${formatDateVN(pkg.pl01qdaDate)}` : ''}</span>
      </div>` : ''}
      ` : ''}

      ${pkg.notes ? `<div class="detail-item full-width"><span class="detail-label">Ghi chú</span><span class="detail-value">${esc(pkg.notes)}</span></div>` : ''}

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

// Số nghiệm thu nhập trực tiếp trong form gói thầu -> đợt nghiệm thu đầu tiên
function ensureAcceptanceEntry(pkg) {
  if (pkg.acceptances.length || !(pkg.acceptanceValue > 0)) return;
  pkg.acceptances.push({
    id: generateId(), date: pkg.acceptanceDate || '', value: pkg.acceptanceValue,
    doc: '', note: '', final: pkg.acceptanceStatus === 'Đã nghiệm thu'
  });
}

function findPackage(catId, pkgId) {
  const project = getCurrentProject();
  const pkg = project?.categories?.find(c => c.id === catId)?.packages?.find(p => p.id === pkgId);
  return { project, pkg };
}

function openAcceptanceForm(catId, pkgId, accId = null) {
  if (!requireEditPermission()) return;
  const { pkg } = findPackage(catId, pkgId);
  if (!pkg) return;
  const a = accId ? (pkg.acceptances || []).find(x => x.id === accId) : null;
  openModal(a ? 'Sửa đợt nghiệm thu' : 'Thêm đợt nghiệm thu', `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Ngày nghiệm thu</label><input type="date" id="acc-date" value="${a?.date || ''}"></div>
      <div class="form-group"><label>Giá trị nghiệm thu (VNĐ) *</label><input type="number" id="acc-value" value="${a?.value ?? ''}"></div>
      <div class="form-group"><label>Số biên bản</label><input type="text" id="acc-doc" value="${esc(a?.doc || '')}" placeholder="VD: 02/BBNT ngày ..."></div>
      <div class="form-group" style="display:flex;align-items:flex-end"><label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:0.85rem"><input type="checkbox" id="acc-final" style="width:auto" ${a?.final ? 'checked' : ''}> Nghiệm thu hoàn thành (đợt cuối)</label></div>
      <div class="form-group full-width"><label>Ghi chú / khối lượng</label><textarea id="acc-note">${esc(a?.note || '')}</textarea></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="viewPackageDetail('${catId}','${pkgId}')">Hủy</button>
    <button class="btn btn-primary" onclick="saveAcceptance('${catId}','${pkgId}','${accId || ''}')">Lưu</button>
  `);
}

function saveAcceptance(catId, pkgId, accId) {
  const { project, pkg } = findPackage(catId, pkgId);
  if (!pkg) return;
  const value = Number(document.getElementById('acc-value').value);
  if (!(value > 0)) { showToast('Vui lòng nhập giá trị nghiệm thu', 'error'); return; }
  pkg.acceptances = pkg.acceptances || [];
  const entry = {
    date: toIso(document.getElementById('acc-date').value),
    value,
    doc: document.getElementById('acc-doc').value.trim(),
    note: document.getElementById('acc-note').value.trim(),
    final: document.getElementById('acc-final').checked
  };
  const existing = accId ? pkg.acceptances.find(x => x.id === accId) : null;
  if (existing) Object.assign(existing, entry);
  else pkg.acceptances.push({ id: generateId(), ...entry });
  syncPackageAcceptance(pkg);
  addAudit(project, existing ? 'update' : 'create', 'nghiệm thu', pkg.name, `Đợt ${pkg.acceptances.length}: ${formatCurrency(value)}`);
  saveState();
  closeModal();
  viewPackageDetail(catId, pkgId);
  renderAll();
  showToast('Đã lưu đợt nghiệm thu');
}

function deleteAcceptance(catId, pkgId, accId) {
  if (!requireEditPermission()) return;
  const { project, pkg } = findPackage(catId, pkgId);
  if (!pkg?.acceptances) return;
  pkg.acceptances = pkg.acceptances.filter(x => x.id !== accId);
  syncPackageAcceptance(pkg);
  addAudit(project, 'delete', 'nghiệm thu', pkg.name);
  saveState();
  viewPackageDetail(catId, pkgId);
  renderAll();
  showToast('Đã xóa đợt nghiệm thu', 'info');
}

function openInvoiceForm(catId, pkgId, invId = null) {
  if (!requireEditPermission()) return;
  const { pkg } = findPackage(catId, pkgId);
  if (!pkg) return;
  const inv = invId ? (pkg.invoices || []).find(x => x.id === invId) : null;
  openModal(inv ? 'Sửa hóa đơn GTGT' : 'Thêm hóa đơn GTGT', `
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>Số hóa đơn GTGT</label><input type="text" id="inv-number" value="${esc(inv?.number || '')}" placeholder="Ký hiệu & số HĐ"></div>
      <div class="form-group"><label>Ngày xuất hóa đơn</label><input type="date" id="inv-date" value="${inv?.date || ''}"></div>
      <div class="form-group"><label>Giá trị HĐ GTGT (VNĐ) *</label><input type="number" id="inv-value" value="${inv?.value ?? ''}"></div>
      <div class="form-group" style="display:flex;align-items:flex-end"><label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:0.85rem"><input type="checkbox" id="inv-xml" style="width:auto" ${inv?.xml ? 'checked' : ''}> HĐ điện tử XML (KBĐT)</label></div>
      <div class="form-group full-width"><label>Ghi chú</label><input type="text" id="inv-note" value="${esc(inv?.note || '')}" placeholder="Đợt thanh toán, nội dung..."></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="viewPackageDetail('${catId}','${pkgId}')">Hủy</button>
    <button class="btn btn-primary" onclick="saveInvoice('${catId}','${pkgId}','${invId || ''}')">Lưu</button>
  `);
}

function saveInvoice(catId, pkgId, invId) {
  const { project, pkg } = findPackage(catId, pkgId);
  if (!pkg) return;
  const value = Number(document.getElementById('inv-value').value);
  if (!(value > 0)) { showToast('Vui lòng nhập giá trị hóa đơn', 'error'); return; }
  pkg.invoices = pkg.invoices || [];
  const entry = {
    number: document.getElementById('inv-number').value.trim(),
    date: toIso(document.getElementById('inv-date').value),
    value,
    xml: document.getElementById('inv-xml').checked,
    note: document.getElementById('inv-note').value.trim()
  };
  const existing = invId ? pkg.invoices.find(x => x.id === invId) : null;
  if (existing) Object.assign(existing, entry);
  else pkg.invoices.push({ id: generateId(), ...entry });
  addAudit(project, existing ? 'update' : 'create', 'hóa đơn', pkg.name, `${entry.number || ''}: ${formatCurrency(value)}`);
  saveState();
  closeModal();
  viewPackageDetail(catId, pkgId);
  renderAll();
  showToast('Đã lưu hóa đơn GTGT');
}

function deleteInvoice(catId, pkgId, invId) {
  if (!requireEditPermission()) return;
  const { project, pkg } = findPackage(catId, pkgId);
  if (!pkg?.invoices) return;
  pkg.invoices = pkg.invoices.filter(x => x.id !== invId);
  addAudit(project, 'delete', 'hóa đơn', pkg.name);
  saveState();
  viewPackageDetail(catId, pkgId);
  renderAll();
  showToast('Đã xóa hóa đơn', 'info');
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
    date: toIso(document.getElementById('var-date').value),
    amount: Number(document.getElementById('var-amount').value) || 0,
    status: document.getElementById('var-status').value,
    approvedBy: document.getElementById('var-approvedBy').value.trim(),
    reason: document.getElementById('var-reason').value.trim()
  });
  addAudit(project, 'create', 'phát sinh', pkg.name, `Phát sinh #${pkg.variations.length}`);
  saveState();
  closeModal();
  viewPackageDetail(catId, pkgId);
  renderAll();
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
  renderAll();
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
      <div class="form-group full-width"><label>Nhóm theo Mẫu 04/QTDA</label>${qtdaGroupSelectHTML(getCatQtdaGroup(cat))}</div>
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
  cat.qtdaGroup = document.getElementById('f-cat-qtdaGroup').value;
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
      <div class="form-group full-width"><label>Nhóm theo Mẫu 04/QTDA</label>${qtdaGroupSelectHTML('')}</div>
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
  project.categories.push({ id: generateId(), code: code || '?', name, color, investTotal, qtdaGroup: document.getElementById('f-cat-qtdaGroup').value, packages: [] });
  addAudit(project, 'create', 'category', name);
  saveState();
  closeModal();
  renderAll();
  showToast('Đã thêm danh mục: ' + name);
}

// ---- Add / Edit Project ----
function getProjectFormHTML(proj = null) {
  const isNonProject = (proj ? (proj.projectScope || 'project') : state.projectScope) === 'nonProject';
  return `
    <div class="form-grid">
<div class="form-group full-width"><label>Tên dự án *</label><input type="text" id="f-proj-name" value="${esc(proj?.name || '')}"></div>
    <div class="form-group full-width">
      <label>Phạm vi</label>
      <select id="f-proj-scope" onchange="toggleProjectScopeForm()">
        <option value="project" ${isNonProject ? '' : 'selected'}>Hình thành dự án (đầu tư công / xây dựng)</option>
        <option value="nonProject" ${isNonProject ? 'selected' : ''}>Không hình thành dự án (mua sắm thường xuyên)</option>
      </select>
    </div>
    <div class="form-group full-width"><label>Tên đầy đủ</label><input type="text" id="f-proj-fullName" value="${esc(proj?.fullName || '')}"></div>
    <div class="form-group"><label>Chủ đầu tư</label><input type="text" id="f-proj-owner" value="${esc(proj?.owner || '')}"></div>
    <div class="form-group"><label>Mã số thuế CĐT</label><input type="text" id="f-proj-taxCode" value="${esc(proj?.investorTaxCode || '')}"></div>
    <div class="form-group"><label>Địa điểm</label><input type="text" id="f-proj-location" value="${esc(proj?.location || '')}"></div>
    <div class="form-group"><label>Năm bắt đầu thực hiện</label><input type="number" id="f-proj-startYear" min="1900" max="2200" value="${proj?.startYear ?? ''}" placeholder="Ví dụ: 2025"></div>
    <div class="form-group"><label>Năm kết thúc dự kiến</label><input type="number" id="f-proj-endYear" min="1900" max="2200" value="${proj?.endYear ?? ''}" placeholder="Ví dụ: 2027"></div>
    <div id="proj-investment-fields" ${isNonProject ? 'style="display:none"' : ''}>
      <div class="form-group">
        <label>Nguồn vốn đầu tư</label>
        <select id="f-proj-investmentSource">
          <option value="">— Chọn —</option>
          ${['Đầu tư công','PPP','Chi thường xuyên ngân sách','Vốn khác'].map(s => `<option value="${s}" ${proj?.investmentSource === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Tổng mức đầu tư (VNĐ)</label><input type="number" id="f-proj-totalInvestment" value="${proj?.totalInvestment ?? ''}"></div>
    </div>
  `;
}

function toggleProjectScopeForm() {
  const scope = document.getElementById('f-proj-scope');
  const invest = document.getElementById('proj-investment-fields');
  if (!scope) return;
  const isNonProject = scope.value === 'nonProject';
  if (invest) invest.style.display = isNonProject ? 'none' : '';
}

function getProjectFormData() {
  return {
    name: document.getElementById('f-proj-name').value.trim(),
    projectScope: document.getElementById('f-proj-scope').value || 'project',
    fullName: document.getElementById('f-proj-fullName').value.trim(),
    owner: document.getElementById('f-proj-owner').value.trim(),
    investorTaxCode: document.getElementById('f-proj-taxCode').value.trim(),
    location: document.getElementById('f-proj-location').value.trim(),
    startYear: Number(document.getElementById('f-proj-startYear').value) || null,
    endYear: Number(document.getElementById('f-proj-endYear').value) || null,
    investmentSource: document.getElementById('f-proj-investmentSource').value,
    totalInvestment: Number(document.getElementById('f-proj-totalInvestment').value) || 0
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
  const proj = { id: generateId(), ...data, categories: data.projectScope === 'nonProject' ? [] : createDefaultCategories() };
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
        refreshDocAttach(catId, pkgId);
      }
    } else {
      tempUploadedPDFs.push(pdfWithCategory);
      renderFormPDFList(catId, null, tempUploadedPDFs);
      refreshDocAttach(catId, '');
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
      refreshDocAttach(catId, pkgId);
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
    refreshDocAttach('', '');
    showToast('Đã xóa file đính kèm', 'info');
  } catch (err) {
    showToast('Lỗi xóa file: ' + err.message, 'error');
  }
}

// ---- Đính kèm file theo từng mục hồ sơ thanh toán ----
function docAttachFileItem(f, category, catId, pkgId) {
  return `
    <div class="pdf-item">
      <span class="material-symbols-rounded">attach_file</span>
      <span class="pdf-name" onclick="viewPDF('${f.id}')" title="Nhấn để xem">${esc(f.name)}</span>
      <span class="pdf-size">${formatFileSize(f.size)}</span>
      <button type="button" class="btn-icon btn-sm" title="Xóa file" onclick="removeDocAttach('${f.id}','${esc(category)}','${esc(catId)}','${esc(pkgId)}')">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `;
}

function docAttachBlock(catId, pkgId, pkg, category) {
  const source = pkg ? (pkg.pdfs || []) : tempUploadedPDFs;
  const files = source.filter(f => f.category === category);
  return `
    <div class="doc-attach" data-cat="${esc(category)}">
      <div class="doc-attach-bar">
        <span class="material-symbols-rounded">attach_file</span>
        <input type="file" accept="${ALLOWED_UPLOAD_ACCEPT}" style="display:none" onchange="handleDocAttach(this,'${esc(category)}','${esc(catId)}','${esc(pkgId)}')">
        <button type="button" class="btn btn-secondary btn-sm" onclick="this.previousElementSibling.click()">
          <span class="material-symbols-rounded">upload_file</span> Đính kèm file
        </button>
        ${files.length ? `<span class="doc-attach-count">${files.length} file</span>` : ''}
      </div>
      ${files.length ? `<div class="doc-attach-list">${files.map(f => docAttachFileItem(f, category, catId, pkgId)).join('')}</div>` : ''}
    </div>
  `;
}

function refreshDocAttach(catId, pkgId) {
  const source = pkgId ? (findPackage(catId, pkgId).pkg?.pdfs || []) : tempUploadedPDFs;
  document.querySelectorAll('.doc-attach').forEach(block => {
    const cat = block.getAttribute('data-cat');
    const files = source.filter(f => f.category === cat);
    const list = block.querySelector('.doc-attach-list');
    const count = block.querySelector('.doc-attach-count');
    if (list) list.innerHTML = files.length ? files.map(f => docAttachFileItem(f, cat, catId, pkgId)).join('') : '';
    if (count) count.textContent = files.length ? files.length + ' file' : '';
  });
}

async function handleDocAttach(input, category, catId, pkgId) {
  if (!requireEditPermission()) { input.value = ''; return; }
  const file = input.files?.[0];
  if (!file) return;
  if (!isAllowedUpload(file)) { showToast('Định dạng file không được hỗ trợ', 'error'); input.value = ''; return; }
  if (file.size > 50 * 1024 * 1024) { showToast('File quá lớn (tối đa 50MB)', 'error'); input.value = ''; return; }
  try {
    const meta = await apiUploadPDF(file);
    const pdf = { ...meta, category };
    if (pkgId) {
      const { pkg } = findPackage(catId, pkgId);
      if (pkg) { (pkg.pdfs = pkg.pdfs || []).push(pdf); saveState(); }
    } else {
      tempUploadedPDFs.push(pdf);
    }
    refreshDocAttach(catId, pkgId);
    showToast('Đã đính kèm: ' + meta.name);
  } catch (err) {
    showToast('Lỗi tải file: ' + err.message, 'error');
  }
  input.value = '';
}

async function removeDocAttach(fileId, category, catId, pkgId) {
  if (!requireEditPermission()) return;
  try {
    await apiDeletePDF(fileId);
    if (pkgId) {
      const { pkg } = findPackage(catId, pkgId);
      if (pkg) { pkg.pdfs = (pkg.pdfs || []).filter(f => f.id !== fileId); saveState(); }
    } else {
      tempUploadedPDFs = tempUploadedPDFs.filter(f => f.id !== fileId);
    }
    refreshDocAttach(catId, pkgId);
    showToast('Đã xóa file đính kèm', 'info');
  } catch (err) {
    showToast('Lỗi xóa file: ' + err.message, 'error');
  }
}

async function viewPDF(pdfId) {
  try {
    const res = handleAuthResponse(await fetch(`${API_BASE}/pdfs/${pdfId}`));
    if (!res.ok) throw new Error('Không tải được file');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const mime = blob.type || '';

    if (mime === 'application/pdf') {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = url;
      openModal('Xem tài liệu PDF', `
        <div class="pdf-preview-wrap">
          <iframe src="${url}" title="Xem trước PDF"></iframe>
        </div>
      `, `
        <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
      `, 'xl');
    } else if (mime.startsWith('image/')) {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = url;
      openModal('Xem hình ảnh', `
        <div class="pdf-preview-wrap">
          <img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain">
        </div>
      `, `
        <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
      `, 'xl');
    } else {
      // Tài liệu Word/Excel/khác: không xem trực tiếp được -> tải xuống
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (err) {
    showToast('Lỗi mở file: ' + err.message, 'error');
  }
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
  else if (viewName === 'qtda') renderQtdaView();
  else if (viewName === 'legal') renderLegalLibrary();
  else if (viewName === 'reports') renderReports();
}

function renderAll() {
  renderProjectInfoBar();
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'packages') renderPackages();
  else if (state.currentView === 'initiation') renderInitiationView();
  else if (state.currentView === 'qtda') renderQtdaView();
  else if (state.currentView === 'legal') renderLegalLibrary();
  else if (state.currentView === 'reports') renderReports();
}

// Nav tabs
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

// Scope switch (Dự án / Mua sắm)
document.querySelectorAll('.scope-btn').forEach(btn => {
  btn.addEventListener('click', () => switchScope(btn.dataset.scope));
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
['filter-pkg-status', 'filter-pkg-type'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => renderPackages());
});

function setPkgStatusFilter(code) {
  const sel = document.getElementById('filter-pkg-status');
  if (sel) sel.value = sel.value === code ? '' : code;
  renderPackages();
}

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

      <div class="restore-section glass-card" style="padding:16px;border-radius:8px">
        <h4 style="margin-bottom:8px;color:var(--accent-green);display:flex;align-items:center;gap:6px">
          <span class="material-symbols-rounded">history</span> 3. Sao lưu tự động
        </h4>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">
          Hệ thống tự động sao lưu định kỳ. Bấm "Phục hồi" để khôi phục dữ liệu từ một bản sao lưu.
        </p>
        <div id="auto-backups-list" style="display:flex;flex-direction:column;gap:6px">
          <p style="color:var(--text-muted);font-size:0.8rem">Đang tải danh sách sao lưu...</p>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
  `);
  loadAutoBackups();
}

async function loadAutoBackups() {
  const el = document.getElementById('auto-backups-list');
  if (!el) return;
  try {
    const res = await fetch('/api/backups');
    const data = await res.json();
    const backups = data.backups || [];
    if (!backups.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">Chưa có bản sao lưu tự động nào.</p>';
      return;
    }
    el.innerHTML = backups.map(b => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem">
        <span class="material-symbols-rounded" style="color:var(--accent-green);font-size:18px">save</span>
        <span style="flex:1;min-width:0">
          <strong style="color:var(--text-primary)">${new Date(b.mtime).toLocaleString('vi-VN')}</strong>
          <span style="color:var(--text-muted)"> · ${b.projectCount} dự án · ${formatFileSize(b.size)}</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="restoreAutoBackup('${esc(b.filename)}')">Phục hồi</button>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">Không tải được danh sách sao lưu.</p>';
  }
}

async function restoreAutoBackup(filename) {
  if (!confirm('Phục hồi dữ liệu từ bản sao lưu này? Dữ liệu hiện tại sẽ bị ghi đè.')) return;
  try {
    const res = await fetch(`/api/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Lỗi phục hồi');
    showToast('Phục hồi thành công!');
    closeModal();
    await loadState();
    renderAll();
    renderProjectSelector();
  } catch (err) {
    showToast(err.message, 'error');
  }
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
      <div class="cfg-section-title">HẠN MỨC CHỈ ĐỊNH THẦU (K4 Đ78 NĐ 214/2025, SỬA BỞI NĐ 349/2026)</div>
      <div class="cfg-grid">
        <div class="cfg-row"><label>Gói tư vấn</label><input id="cfg-limit-consulting" type="number" step="1" value="${da.consulting ?? 3000000000}"></div>
        <div class="cfg-row"><label>Gói xây lắp</label><input id="cfg-limit-construction" type="number" step="1" value="${da.construction ?? 5000000000}"></div>
        <div class="cfg-row"><label>Gói hàng hóa</label><input id="cfg-limit-goods" type="number" step="1" value="${da.goods ?? 5000000000}"></div>
        <div class="cfg-row"><label>Gói hỗn hợp</label><input id="cfg-limit-mixed" type="number" step="1" value="${da.mixed ?? 5000000000}"></div>
        <div class="cfg-row"><label>Gói phi tư vấn</label><input id="cfg-limit-nonConsulting" type="number" step="1" value="${da.nonConsulting ?? 5000000000}"></div>
        <div class="cfg-row"><label>Mua sắm (không dự án)</label><input id="cfg-limit-nonProject" type="number" step="1" value="${da.nonProject ?? 1000000000}"></div>
      </div>
      <div class="cfg-section-title" style="margin-top:12px">NGƯỠNG KHÁC</div>
      <div class="cfg-grid">
        <div class="cfg-row"><label>Thủ trưởng quyết định (≤)</label><input id="cfg-limit-directPurchase" type="number" step="1" value="${lim.directPurchase ?? 100000000}"></div>
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
      <div class="cfg-section-title">CƠ QUAN BAN HÀNH VĂN BẢN PHÁP LÝ</div>
      <textarea id="cfg-agencies" rows="3" style="width:100%">${esc(ag)}</textarea>
      <div class="cfg-section-title" style="margin-top:12px">DANH MỤC PHÂN LOẠI</div>
      <div class="cfg-grid">
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Loại dự án</label><textarea id="cfg-list-projectTypes" rows="3" style="width:100%">${esc(arrToText(lst.projectTypes))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Nguồn vốn</label><textarea id="cfg-list-fundSources" rows="3" style="width:100%">${esc(arrToText(lst.fundSources))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Loại hình mua sắm</label><textarea id="cfg-list-purchaseTypes" rows="3" style="width:100%">${esc(arrToText(lst.purchaseTypes))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Cấp công trình</label><textarea id="cfg-list-buildingGrades" rows="3" style="width:100%">${esc(arrToText(lst.buildingGrades))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Loại hợp đồng</label><textarea id="cfg-list-contractTypes" rows="3" style="width:100%">${esc(arrToText(lst.contractTypes))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">BCNCKT</label><textarea id="cfg-list-feasibility" rows="2" style="width:100%">${esc(arrToText(lst.feasibilityStatuses))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Nghiệm thu</label><textarea id="cfg-list-acceptance" rows="2" style="width:100%">${esc(arrToText(lst.acceptanceStatuses))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Quyết toán</label><textarea id="cfg-list-settlement" rows="2" style="width:100%">${esc(arrToText(lst.settlementStatuses))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Hình thức lựa chọn nhà thầu</label><textarea id="cfg-list-selectionMethods" rows="6" style="width:100%">${esc(arrToText(lst.selectionMethods))}</textarea></div>
        <div><label style="font-size:0.78rem;color:var(--text-muted)">Loại văn bản pháp lý</label><textarea id="cfg-list-legalDocTypes" rows="6" style="width:100%">${esc(arrToText(lst.legalDocTypes))}</textarea></div>
      </div>
    </div>

    <div id="cfg-panel-legal" class="cfg-panel">
      <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px">Danh mục tham khảo — dùng để tra cứu và giải thích mốc hiệu lực của từng văn bản. Không chỉnh sửa trực tiếp (cập nhật qua config file).</p>
      ${legalDocs.map(d => `
        <div class="cfg-legal-doc">
          <span class="doc-type">${esc(d.type)}</span>
          <span class="doc-title">${esc(d.number)} — ${esc(d.title)}</span>
          ${d.kbId ? `<a href="#" class="ai-source" onclick="closeModal();openLegalDoc('${esc(d.kbId)}');return false">Có toàn văn — xem</a>` : '<span class="badge badge-neutral" style="font-size:0.65rem">Chưa có toàn văn trong thư viện</span>'}
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
        consulting: Number(document.getElementById('cfg-limit-consulting')?.value) || 3000000000,
        construction: Number(document.getElementById('cfg-limit-construction')?.value) || 5000000000,
        goods: Number(document.getElementById('cfg-limit-goods')?.value) || 5000000000,
        mixed: Number(document.getElementById('cfg-limit-mixed')?.value) || 5000000000,
        nonConsulting: Number(document.getElementById('cfg-limit-nonConsulting')?.value) || 5000000000,
        nonProject: Number(document.getElementById('cfg-limit-nonProject')?.value) || 1000000000
      },
      directPurchase: Number(document.getElementById('cfg-limit-directPurchase')?.value) || 100000000,
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
      fundSources: textToArr('cfg-list-fundSources'),
      purchaseTypes: textToArr('cfg-list-purchaseTypes'),
      buildingGrades: textToArr('cfg-list-buildingGrades'),
      contractTypes: textToArr('cfg-list-contractTypes'),
      feasibilityStatuses: textToArr('cfg-list-feasibility'),
      acceptanceStatuses: textToArr('cfg-list-acceptance'),
      settlementStatuses: textToArr('cfg-list-settlement'),
      selectionMethods: textToArr('cfg-list-selectionMethods'),
      legalDocTypes: textToArr('cfg-list-legalDocTypes')
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

// Buộc đổi mật khẩu sau lần đăng nhập đầu tiên (must_change_password)
function requireForcePasswordChange() {
  let forced = false;
  let id = (currentUser && currentUser.id) || '';
  try {
    const raw = sessionStorage.getItem('qlda_force_pw');
    if (raw) {
      const info = JSON.parse(raw);
      if (info && info.id) { forced = true; id = info.id; }
    }
  } catch (e) { /* bỏ qua */ }
  if (!forced && !(currentUser && currentUser.mustChangePassword)) return;
  if (!id) return;
  openModal('Yêu cầu đổi mật khẩu', `
    <p style="margin-bottom:14px">Vì lý do bảo mật, bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống.</p>
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
    window.location.reload();
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
  // Đang bị buộc đổi mật khẩu: dừng tải dữ liệu, chờ đổi xong rồi reload
  if (currentUser.mustChangePassword) return;
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

var aiHistory = [];

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
      body: JSON.stringify({ message: text, history: aiHistory.slice(-6) })
    });
    var data = await res.json();
    loadDiv.remove();
    var botDiv = document.createElement('div');
    botDiv.className = 'ai-msg ai-msg-bot';
    if (res.ok) {
      botDiv.innerHTML = renderMarkdown(data.reply);
      if (typeof aiRenderSources === 'function') aiRenderSources(botDiv, data.sources);
      aiHistory.push({ role: 'user', text: text }, { role: 'model', text: data.reply });
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
