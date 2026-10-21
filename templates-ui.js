// ============================================================
// THƯ VIỆN MẪU BIỂU - giao diện điền và xuất Word/Excel
// ============================================================
let templateManifest = null;
let templateManifestPromise = null;
let templatePackageId = '';
let templateXlsxPromise = null;
let templateState = null;
let templatePreviewUrl = null;
let templatePreviewTimer = null;
let templateOpenToken = 0;

const TEMPLATE_STAGE_ORDER = [
  'chuanBiDauTu',
  'chuanBiThucHien',
  'luaChonNhaThau',
  'kyHopDong',
  'thucHienHopDong',
  'nghiemThu',
  'banGiao',
  'thanhToan',
  'thanhLy',
  'quyetToan'
];

const TEMPLATE_STAGE_LABELS = {
  chuanBiDauTu: 'Chuẩn bị đầu tư',
  chuanBiThucHien: 'Chuẩn bị thực hiện',
  luaChonNhaThau: 'Lựa chọn nhà thầu',
  kyHopDong: 'Ký hợp đồng',
  thucHienHopDong: 'Thực hiện hợp đồng',
  nghiemThu: 'Nghiệm thu',
  banGiao: 'Bàn giao',
  thanhToan: 'Thanh toán',
  thanhLy: 'Thanh lý',
  quyetToan: 'Quyết toán'
};

const TEMPLATE_GROUP_LABELS = {
  du_an: 'Dự án',
  goi_thau: 'Gói thầu',
  chu_dau_tu: 'Chủ đầu tư',
  nha_thau: 'Nhà thầu',
  hop_dong: 'Hợp đồng',
  nghiem_thu: 'Nghiệm thu',
  thanh_toan: 'Thanh toán',
  phu_luc: 'Phụ lục',
  quyet_dinh: 'Quyết định',
  bien_ban: 'Biên bản',
  quyet_toan: 'Quyết toán',
  chu_truong: 'Chủ trương',
  khlcnt: 'Kế hoạch lựa chọn nhà thầu',
  chi_dinh_thau: 'Chỉ định thầu',
  ket_qua_lua_chon: 'Kết quả lựa chọn nhà thầu',
  thoa_thuan_khung: 'Thỏa thuận khung',
  du_toan: 'Dự toán',
  to_chuc: 'Tổ chức',
  chay_thu: 'Chạy thử',
  hoan_cong: 'Hoàn công',
  thong_bao: 'Thông báo',
  hang_hoa: 'Hàng hóa',
  co_quan_phe_duyet: 'Cơ quan phê duyệt',
  don_vi_trinh: 'Đơn vị trình'
};

const TEMPLATE_FIELD_LABELS = {
  ten: 'Tên',
  so: 'Số',
  ngay: 'Ngày',
  ma: 'Mã',
  dia_diem: 'Địa điểm',
  gia_tri: 'Giá trị (đồng)',
  gia_tri_bang_chu: 'Giá trị bằng chữ',
  don_gia: 'Đơn giá (đồng)',
  tong_muc: 'Tổng mức (đồng)',
  nguon_von: 'Nguồn vốn',
  thoi_gian: 'Thời gian',
  thoi_han: 'Thời hạn',
  so_tien: 'Số tiền (đồng)',
  so_tien_bang_chu: 'Số tiền bằng chữ',
  tam_ung: 'Tạm ứng (đồng)',
  con_phai_thanh_toan: 'Còn phải thanh toán (đồng)',
  da_thanh_toan: 'Đã thanh toán (đồng)',
  so_ban: 'Số bản',
  so_ban_a: 'Số bản bên A giữ',
  so_ban_b: 'Số bản bên B giữ',
  bao_lanh: 'Bảo lãnh',
  dai_dien: 'Đại diện',
  chuc_vu: 'Chức vụ',
  dien_thoai: 'Điện thoại',
  fax: 'Fax',
  email: 'Email',
  ma_so_thue: 'Mã số thuế',
  tai_khoan: 'Tài khoản',
  tai_khoan_kbnn: 'Tài khoản KBNN',
  ngan_hang: 'Ngân hàng',
  co_quan_thue: 'Cơ quan thuế',
  hinh_thuc: 'Hình thức',
  phuong_thuc: 'Phương thức',
  loai_hop_dong: 'Loại hợp đồng',
  loai: 'Loại',
  hieu_luc: 'Ngày hiệu lực',
  noi_dung: 'Nội dung',
  ket_luan: 'Kết luận',
  tai_lieu: 'Tài liệu',
  thanh_vien: 'Thành viên',
  to_truong: 'Tổ trưởng',
  ly_do: 'Lý do',
  quy_mo: 'Quy mô',
  muc_tieu: 'Mục tiêu',
  danh_muc: 'Danh mục',
  chat_luong: 'Chất lượng',
  khoi_luong: 'Khối lượng',
  ghi_chu: 'Ghi chú',
  doi_tuong: 'Đối tượng',
  cong_viec: 'Công việc',
  hang_muc: 'Hạng mục',
  giai_doan: 'Giai đoạn',
  thanh_phan: 'Thành phần',
  don_vi_thi_cong: 'Đơn vị thi công',
  so_luong: 'Số lượng',
  don_vi: 'Đơn vị tính',
  xuat_xu: 'Xuất xứ',
  thoi_gian_giao: 'Thời gian giao',
  dia_diem_giao: 'Địa điểm giao',
  so_trinh: 'Số tờ trình',
  ngay_trinh: 'Ngày tờ trình',
  so_qd: 'Số quyết định',
  ngay_qd: 'Ngày quyết định',
  muc_tieu: 'Mục tiêu',
  hinh_thuc_quan_ly: 'Hình thức quản lý dự án'
};

const TEMPLATE_MONEY_RE = /(gia_tri|so_tien|tam_ung|tong_muc|don_gia|da_thanh_toan|con_phai_thanh_toan|luy_ke|nghiem_thu_ky|de_nghi_ky|chua_thanh_toan|tien_bao_hanh|tam_giu|thu_hoi|thanh_toan_khoi_luong|thanh_toan_nha_thau|gia_trung_thau)/;
const TEMPLATE_TEXTAREA_RE = /(noi_dung|ket_luan|tai_lieu|thanh_vien|ly_do|quy_mo|muc_tieu|danh_muc|chat_luong|khoi_luong|ghi_chu|mo_ta|dieu_khoan|dia_chi|noi_dung_truoc|noi_dung_sau)/;
const TEMPLATE_NUMBER_RE = /(gia_tri|so_tien|tam_ung|tong_muc|don_gia|da_thanh_toan|con_phai_thanh_toan|luy_ke|nghiem_thu_ky|de_nghi_ky|chua_thanh_toan|tien_bao_hanh|tam_giu|thu_hoi|thanh_toan_khoi_luong|thanh_toan_nha_thau|gia_trung_thau)/;

function templateEsc(value) {
  return (typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
}

function templateStageLabel(stage) {
  return TEMPLATE_STAGE_LABELS[stage] || stage || 'Khác';
}

function templateGroupLabel(group) {
  return TEMPLATE_GROUP_LABELS[group] || group.replace(/_/g, ' ');
}

function templateFieldLabel(key) {
  const field = String(key || '').split('.').pop();
  return TEMPLATE_FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase());
}

function templateToday() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function templateIsoToDmy(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && typeof toDmy === 'function') return toDmy(s);
  return s;
}

function templateSplitDoc(value) {
  const s = String(value || '').trim();
  if (!s) return { so: '', ngay: '' };
  const m = s.match(/^(.*?)\s+ng[àa]y\s+(.+)$/i);
  return m ? { so: m[1].trim(), ngay: m[2].trim() } : { so: s, ngay: '' };
}

function templateParseMoney(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^\d-]/g, '');
  return cleaned ? Number(cleaned) : NaN;
}

function templateFormatMoney(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = templateParseMoney(value);
  if (!isFinite(n)) return String(value);
  return n.toLocaleString('vi-VN');
}

function templatePackages() {
  const project = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
  if (!project) return [];
  const out = [];
  for (const cat of (project.categories || [])) {
    for (const pkg of (cat.packages || [])) {
      out.push({ ...pkg, categoryName: cat.name || '', categoryCode: cat.code || '' });
    }
  }
  return out;
}

function templateSelectedPackage() {
  const list = templatePackages();
  return list.find(p => p.id === templatePackageId) || list[0] || null;
}

function renderTemplatePackageBar() {
  const bar = document.getElementById('template-package-bar');
  if (!bar) return;
  const project = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
  if (!project) {
    bar.innerHTML = '<span>Chọn hoặc tạo dự án để sử dụng thư viện mẫu.</span>';
    return;
  }
  const pkgs = templatePackages();
  if (!pkgs.length) {
    bar.innerHTML = `<span><b>Dự án:</b> ${templateEsc(project.fullName || project.name)} — chưa có gói thầu.</span>`;
    return;
  }
  if (!templatePackageId || !pkgs.some(p => p.id === templatePackageId)) {
    templatePackageId = pkgs[0].id;
  }
  const options = pkgs.map(p => {
    const cat = p.categoryCode ? `[${p.categoryCode}] ` : '';
    return `<option value="${templateEsc(p.id)}" ${p.id === templatePackageId ? 'selected' : ''}>${templateEsc(cat + p.name)}</option>`;
  }).join('');
  bar.innerHTML = `
    <label for="template-package-select">Gói thầu áp dụng:</label>
    <select id="template-package-select">${options}</select>
    <span style="color:var(--text-muted);font-size:0.78rem">Dữ liệu tự điền từ gói đã chọn; có thể sửa trong biểu mẫu.</span>`;
  document.getElementById('template-package-select')?.addEventListener('change', (e) => {
    templatePackageId = e.target.value;
  });
}

function loadTemplateManifest() {
  if (templateManifest) return Promise.resolve(templateManifest);
  if (!templateManifestPromise) {
    templateManifestPromise = fetch('/templates/manifest.json', { cache: 'no-cache' })
      .then(res => {
        if (!res.ok) throw new Error('Không tải được manifest mẫu biểu');
        return res.json();
      })
      .then(manifest => {
        templateManifest = manifest;
        return manifest;
      })
      .catch(err => {
        templateManifestPromise = null;
        throw err;
      });
  }
  return templateManifestPromise;
}

function populateTemplateStageFilter() {
  const select = document.getElementById('filter-template-stage');
  if (!select || !templateManifest) return;
  const current = select.value;
  const stages = [...new Set((templateManifest.templates || []).map(t => t.stage))];
  stages.sort((a, b) => {
    const ia = TEMPLATE_STAGE_ORDER.indexOf(a);
    const ib = TEMPLATE_STAGE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  select.innerHTML = '<option value="">Tất cả giai đoạn</option>' +
    stages.map(s => `<option value="${templateEsc(s)}">${templateEsc(templateStageLabel(s))}</option>`).join('');
  select.value = current;
}

function templateFilteredList() {
  if (!templateManifest) return [];
  const q = (document.getElementById('search-templates')?.value || '').toLowerCase().trim();
  const stage = document.getElementById('filter-template-stage')?.value || '';
  const format = document.getElementById('filter-template-format')?.value || '';
  return (templateManifest.templates || []).filter(t => {
    if (stage && t.stage !== stage) return false;
    if (format && t.format !== format) return false;
    if (!q) return true;
    const hay = [t.name, t.code, t.note, ...(t.legalBasis || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function templateCard(t) {
  const formatLabel = t.format === 'excel' ? 'Excel' : 'Word';
  const formatClass = t.format === 'excel' ? 'badge-success' : 'badge-info';
  const basis = (t.legalBasis || []).slice(0, 3).join(' · ');
  return `
    <div class="tpl-card">
      <div class="tpl-card-head">
        <div class="tpl-card-title">${templateEsc(t.name)}</div>
        <div class="tpl-code">${templateEsc(t.code)}</div>
      </div>
      <div class="tpl-card-meta">
        <span class="badge ${formatClass}">${formatLabel}</span>
        <span class="badge badge-neutral">${templateEsc(templateStageLabel(t.stage))}</span>
      </div>
      ${basis ? `<div class="tpl-card-basis"><b>Căn cứ:</b> ${templateEsc(basis)}</div>` : ''}
      ${t.note ? `<div class="tpl-card-note">${templateEsc(t.note)}</div>` : ''}
      <div class="tpl-card-actions">
        <button class="btn btn-primary btn-sm" data-template-action="open" data-code="${templateEsc(t.code)}">
          <span class="material-symbols-rounded">edit_document</span> Xem &amp; điền
        </button>
        <button class="btn btn-secondary btn-sm" data-template-action="blank" data-code="${templateEsc(t.code)}">
          <span class="material-symbols-rounded">download</span> Tải mẫu trống
        </button>
      </div>
    </div>`;
}

function renderTemplateCards() {
  const container = document.getElementById('templates-container');
  if (!container || !templateManifest) return;
  const list = templateFilteredList();
  if (!list.length) {
    container.innerHTML = '<div class="tpl-empty">Không có mẫu phù hợp bộ lọc.</div>';
    return;
  }
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.stage)) groups.set(t.stage, []);
    groups.get(t.stage).push(t);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = TEMPLATE_STAGE_ORDER.indexOf(a);
    const ib = TEMPLATE_STAGE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  container.innerHTML = ordered.map(stage => {
    const items = groups.get(stage);
    return `
      <div class="tpl-stage">
        <div class="tpl-stage-title">
          <span class="material-symbols-rounded">folder_open</span>
          ${templateEsc(templateStageLabel(stage))}
          <span class="tpl-count">${items.length}</span>
        </div>
        <div class="tpl-grid">${items.map(templateCard).join('')}</div>
      </div>`;
  }).join('');
  container.onclick = (e) => {
    const btn = e.target.closest('[data-template-action]');
    if (!btn) return;
    const code = btn.dataset.code;
    if (btn.dataset.templateAction === 'open') openTemplateModal(code);
    else if (btn.dataset.templateAction === 'blank') downloadBlankTemplate(code);
  };
}

function renderTemplatesView() {
  renderTemplatePackageBar();
  const container = document.getElementById('templates-container');
  if (!container) return;
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    container.innerHTML = '<div class="tpl-empty">Thư viện mẫu biểu chỉ dành cho quản trị viên.</div>';
    return;
  }
  if (templateManifest) {
    populateTemplateStageFilter();
    renderTemplateCards();
    return;
  }
  container.innerHTML = '<div class="tpl-loading">Đang tải thư viện mẫu...</div>';
  loadTemplateManifest().then(() => {
    populateTemplateStageFilter();
    renderTemplateCards();
  }).catch(err => {
    container.innerHTML = `<div class="tpl-empty">Lỗi tải thư viện: ${templateEsc(err.message)}</div>`;
  });
}

function buildTemplateContext() {
  const project = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
  const pkg = templateSelectedPackage();
  const ctx = {};
  const set = (key, value) => {
    if (value !== undefined && value !== null && value !== '') ctx[key] = value;
  };
  if (templateManifest?.context) {
    for (const [group, fields] of Object.entries(templateManifest.context)) {
      for (const field of fields) {
        const key = `${group}.${field}`;
        if (!(key in ctx)) ctx[key] = '';
      }
    }
  }
  if (project) {
    const contract = templateSplitDoc(pkg?.contract);
    const decision = templateSplitDoc(pkg?.bidDecision);
    const acceptance = templateSplitDoc(pkg?.acceptanceRecord);
    set('du_an.ten', project.fullName || project.name);
    set('du_an.ma', project.code || project.id);
    set('du_an.dia_diem', project.location);
    set('du_an.tong_muc', project.totalInvestment);
    set('du_an.nguon_von', project.fundSource || project.fundingSource);
    set('du_an.thoi_gian', project.duration);
    set('du_an.muc_tieu', project.objective);
    set('du_an.quy_mo', project.scale);
    set('du_an.hinh_thuc_quan_ly', project.managementForm);
    set('du_an.so_trinh', project.submissionNumber);
    set('du_an.ngay_trinh', templateIsoToDmy(project.submissionDate) || templateToday());
    set('du_an.so_qd', project.approvalNumber || project.decisionNumber || decision.so);
    set('du_an.ngay_qd', templateIsoToDmy(project.approvalDate) || decision.ngay || '');
    set('chu_dau_tu.ten', project.owner);
    set('chu_dau_tu.dia_chi', project.ownerAddress || project.location);
    set('chu_dau_tu.dai_dien', project.ownerRepresentative);
    set('chu_dau_tu.chuc_vu', project.ownerPosition);
    set('chu_dau_tu.dien_thoai', project.ownerPhone);
    set('chu_dau_tu.fax', project.ownerFax);
    set('chu_dau_tu.email', project.ownerEmail);
    set('chu_dau_tu.ma_so_thue', project.ownerTaxCode);
    set('chu_dau_tu.tai_khoan_kbnn', project.ownerAccount);
    set('chu_dau_tu.co_quan_thue', project.ownerTaxOffice);
    set('goi_thau.ten', pkg?.name);
    set('goi_thau.ma', pkg?.code || pkg?.id);
    set('nha_thau.ten', pkg?.contractor);
    set('nha_thau.dia_chi', pkg?.contractorAddress);
    set('nha_thau.dai_dien', pkg?.contractorRepresentative);
    set('nha_thau.dien_thoai', pkg?.contractorPhone);
    set('nha_thau.tai_khoan', pkg?.contractorAccount);
    set('nha_thau.ngan_hang', pkg?.contractorBank);
    set('nha_thau.ma_so_thue', pkg?.contractorTaxCode);
    set('hop_dong.so', contract.so);
    set('hop_dong.ngay', templateIsoToDmy(contract.ngay) || templateIsoToDmy(pkg?.contractSignDate));
    set('hop_dong.loai', pkg?.contractType);
    set('hop_dong.gia_tri', pkg?.bidValue || pkg?.contractValue || 0);
    set('hop_dong.hieu_luc', templateIsoToDmy(pkg?.contractStartDate));
    set('hop_dong.thoi_han', pkg?.duration);
    set('hop_dong.tam_ung', 0);
    set('hop_dong.da_thanh_toan', pkg?.cumulativeDisbursed || 0);
    set('hop_dong.con_phai_thanh_toan', Math.max(0, Number(pkg?.bidValue || 0) - Number(pkg?.cumulativeDisbursed || 0)));
    set('hop_dong.so_ban', '08');
    set('hop_dong.so_ban_a', '06');
    set('hop_dong.so_ban_b', '02');
    set('hop_dong.bao_lanh', pkg?.advanceGuaranteeNumber);
    set('nghiem_thu.so', acceptance.so);
    set('nghiem_thu.ngay', templateIsoToDmy(acceptance.ngay) || templateIsoToDmy(pkg?.acceptanceDate) || templateToday());
    set('nghiem_thu.doi_tuong', pkg?.name);
    set('nghiem_thu.dia_diem', project.location);
    set('nghiem_thu.chat_luong', 'Đạt yêu cầu');
    set('nghiem_thu.khoi_luong', 'Đạt yêu cầu theo hợp đồng');
    set('nghiem_thu.ket_luan', 'Chấp nhận nghiệm thu theo quy định.');
    set('nghiem_thu.cong_viec', pkg?.name);
    set('nghiem_thu.hang_muc', project.name);
    set('nghiem_thu.don_vi_thi_cong', pkg?.contractor);
    set('thanh_toan.ngay', templateToday());
    set('thanh_toan.ky', '01');
    set('thanh_toan.so_tien', pkg?.periodValue || pkg?.bidValue || 0);
    set('thanh_toan.hinh_thuc', 'Chuyển khoản');
    set('thanh_toan.de_nghi_ky', pkg?.periodValue || pkg?.bidValue || 0);
    set('thanh_toan.nghiem_thu_ky', pkg?.periodValue || pkg?.bidValue || 0);
    set('thanh_toan.da_thanh_toan_truoc', 0);
    set('thanh_toan.chua_thanh_toan_truoc', 0);
    set('thanh_toan.tam_ung_con_lai', 0);
    set('khlcnt.so', project.khlcntNumber);
    set('khlcnt.ngay', templateIsoToDmy(project.khlcntDate));
    set('khlcnt.tong_gia_tri', templatePackages().reduce((sum, p) => sum + (Number(p.bidValue) || 0), 0) || project.totalInvestment);
    set('khlcnt.nguon_von', project.fundSource || project.fundingSource);
    set('khlcnt.thoi_gian', project.duration);
    set('khlcnt.hinh_thuc', pkg?.selectionMethod);
    set('khlcnt.phuong_thuc', pkg?.selectionMethod);
    set('khlcnt.loai_hop_dong', pkg?.contractType);
    set('du_toan.so', decision.so);
    set('du_toan.ngay', decision.ngay);
    set('du_toan.so_trinh', decision.so);
    set('du_toan.ngay_trinh', decision.ngay);
    set('du_toan.so_qd', decision.so);
    set('du_toan.ngay_qd', decision.ngay);
    set('du_toan.gia_tri', pkg?.estimateValue || pkg?.bidValue || 0);
    set('du_toan.noi_dung', pkg?.name);
    set('du_toan.nguon_von', pkg?.fundSource || project.fundSource);
    set('du_toan.thoi_gian', pkg?.duration);
    set('chi_dinh_thau.so', decision.so);
    set('chi_dinh_thau.ngay', decision.ngay);
    set('chi_dinh_thau.gia_tri', pkg?.bidValue || 0);
    set('chi_dinh_thau.thoi_gian', pkg?.duration);
    set('ket_qua_lua_chon.so', decision.so);
    set('ket_qua_lua_chon.ngay', decision.ngay);
    set('ket_qua_lua_chon.nha_thau_trung', pkg?.contractor);
    set('ket_qua_lua_chon.gia_trung_thau', pkg?.bidValue || 0);
    set('ket_qua_lua_chon.thoi_gian', pkg?.duration);
    set('thong_bao.so', decision.so);
    set('thong_bao.ngay', decision.ngay);
    set('thong_bao.thoi_gian', pkg?.duration);
    set('thong_bao.hinh_thuc', pkg?.selectionMethod);
    set('thong_bao.dia_diem', project.location);
    set('thoa_thuan_khung.so', project.khlcntNumber || decision.so);
    set('thoa_thuan_khung.ngay', templateIsoToDmy(project.khlcntDate) || decision.ngay);
    set('thoa_thuan_khung.thoi_han', pkg?.duration);
    set('thoa_thuan_khung.danh_muc', pkg?.name);
    set('thoa_thuan_khung.gia_tri', pkg?.bidValue || 0);
    set('hang_hoa.ten', pkg?.name);
    set('to_chuc.ten', project.owner);
  }
  return ctx;
}

function templatePlaceholdersFromHtml(html) {
  const keys = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/\{\{([^}]+)\}\}/g)) {
    const key = m[1].trim();
    if (!seen.has(key)) { seen.add(key); keys.push(key); }
  }
  return keys;
}

function templateRenderForm(keys, values) {
  const grouped = new Map();
  for (const key of keys) {
    const group = key.split('.')[0];
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(key);
  }
  const order = Object.keys(TEMPLATE_GROUP_LABELS).filter(g => grouped.has(g));
  for (const g of grouped.keys()) if (!order.includes(g)) order.push(g);
  return order.map(group => {
    const fields = grouped.get(group).map(key => {
      const field = key.split('.').pop();
      const value = values[key] ?? '';
      const isArea = TEMPLATE_TEXTAREA_RE.test(field);
      const isNumber = TEMPLATE_NUMBER_RE.test(field) && !isArea && !/bang_chu/.test(field);
      const label = templateFieldLabel(key);
      const common = `data-tpl-key="${templateEsc(key)}"`;
      const input = isArea
        ? `<textarea ${common} placeholder="${templateEsc(label)}">${templateEsc(value)}</textarea>`
        : `<input ${common} type="${isNumber ? 'number' : 'text'}" ${isNumber ? 'step="any"' : ''} value="${templateEsc(value)}" placeholder="${templateEsc(label)}">`;
      return `<div class="tpl-form-field"><label>${templateEsc(label)}</label>${input}</div>`;
    }).join('');
    return `<div class="tpl-form-group"><h4>${templateEsc(templateGroupLabel(group))}</h4>${fields}</div>`;
  }).join('');
}

function templateCurrentValues() {
  const values = {};
  document.querySelectorAll('[data-tpl-key]').forEach(el => {
    const key = el.dataset.tplKey;
    if (el.type === 'number') values[key] = el.value === '' ? '' : Number(el.value);
    else values[key] = el.value;
  });
  return values;
}

function templateApplyHtml(html, values) {
  return String(html).replace(/\{\{([^}]+)\}\}/g, (_, rawKey) => {
    const key = rawKey.trim();
    const value = values[key];
    if (value === undefined || value === null || value === '') return '';
    if (TEMPLATE_MONEY_RE.test(key.split('.').pop() || '') && !/bang_chu/.test(key)) return templateEsc(templateFormatMoney(value));
    return templateEsc(value);
  });
}

function templateApplyWorkbook(wb, values) {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const cell = ws[addr];
      if (!cell || typeof cell.v !== 'string' || cell.f) continue;
      const exact = cell.v.match(/^\{\{([^}]+)\}\}$/);
      if (exact) {
        const key = exact[1].trim();
        const value = values[key];
        const field = key.split('.').pop() || '';
        if (TEMPLATE_MONEY_RE.test(field) && !/bang_chu/.test(key)) {
          const n = templateParseMoney(value);
          if (isFinite(n)) {
            cell.t = 'n';
            cell.v = n;
            delete cell.w;
            continue;
          }
        }
        cell.t = 's';
        cell.v = value === undefined || value === null ? '' : String(value);
        delete cell.w;
      } else if (cell.v.includes('{{')) {
        cell.v = cell.v.replace(/\{\{([^}]+)\}\}/g, (_, rawKey) => {
          const key = rawKey.trim();
          const value = values[key];
          if (value === undefined || value === null) return '';
          if (TEMPLATE_MONEY_RE.test(key.split('.').pop() || '') && !/bang_chu/.test(key)) return templateFormatMoney(value);
          return String(value);
        });
        delete cell.w;
      }
    }
  }
}

function templateEnsureXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (templateXlsxPromise) return templateXlsxPromise;
  templateXlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/assets/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => {
      templateXlsxPromise = null;
      reject(new Error('Không tải được thư viện Excel'));
    };
    document.head.appendChild(script);
  });
  return templateXlsxPromise;
}

function templateDownloadBlob(content, filename, mime) {
  const blob = new Blob(['\ufeff', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function templateSafeName(name) {
  return String(name || 'du-an').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function templateDownloadWord(html, code) {
  const project = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
  templateDownloadBlob(html, `${code}-${templateSafeName(project?.name)}.doc`, 'application/msword');
}

function templateFilename(t) {
  const project = typeof getCurrentProject === 'function' ? getCurrentProject() : null;
  return `${t.code}-${templateSafeName(project?.name)}.${t.format === 'excel' ? 'xlsx' : 'doc'}`;
}

async function downloadBlankTemplate(code) {
  if (!templateManifest) await loadTemplateManifest();
  const t = templateManifest?.templates?.find(x => x.code === code);
  if (!t) return;
  if (t.format === 'excel') {
    const a = document.createElement('a');
    a.href = '/templates/' + t.file;
    a.download = templateFilename(t);
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  try {
    const res = await fetch('/templates/' + t.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Không tải được mẫu');
    const html = await res.text();
    templateDownloadWord(html, t.code + '-trong');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function templateSchedulePreview() {
  clearTimeout(templatePreviewTimer);
  templatePreviewTimer = setTimeout(templateUpdatePreview, 180);
}

function templateRenderWordPreview(html) {
  const host = document.getElementById('tpl-preview-host');
  if (!host) return;
  if (templatePreviewUrl) URL.revokeObjectURL(templatePreviewUrl);
  templatePreviewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  host.innerHTML = `<iframe class="tpl-preview-frame" sandbox="" src="${templatePreviewUrl}" title="Xem trước mẫu"></iframe>`;
}

function templateRenderExcelPreview(buffer, values) {
  const host = document.getElementById('tpl-preview-host');
  if (!host) return;
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    templateApplyWorkbook(wb, values);
    const sheetName = wb.SheetNames[0];
    const html = XLSX.utils.sheet_to_html(wb.Sheets[sheetName], { editable: false });
    host.innerHTML = `<div class="tpl-preview-note">Đang xem sheet <b>${templateEsc(sheetName)}</b>. Khi tải, toàn bộ sheet và công thức được giữ nguyên.</div><div class="tpl-excel-preview">${html}</div>`;
  } catch (err) {
    host.innerHTML = `<div class="tpl-empty">Không dựng được bản xem trước Excel: ${templateEsc(err.message)}</div>`;
  }
}

function templateUpdatePreview() {
  if (!templateState) return;
  const values = templateCurrentValues();
  if (templateState.format === 'word') {
    templateRenderWordPreview(templateApplyHtml(templateState.html, values));
  } else if (templateState.format === 'excel') {
    templateRenderExcelPreview(templateState.buffer, values);
  }
}

async function openTemplateModal(code) {
  const token = ++templateOpenToken;
  if (!templateManifest) await loadTemplateManifest();
  const t = templateManifest?.templates?.find(x => x.code === code);
  if (!t) return;
  openModal(t.name, '<div class="tpl-loading">Đang tải mẫu...</div>', '<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>', 'xl');
  try {
    const res = await fetch('/templates/' + t.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Không tải được file mẫu');
    const ctx = buildTemplateContext();
    let html = null;
    let buffer = null;
    let keys = [];
    if (t.format === 'excel') {
      buffer = await res.arrayBuffer();
      await templateEnsureXlsx();
      const wb = XLSX.read(buffer, { type: 'array' });
      const seen = new Set();
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        for (const addr of Object.keys(ws)) {
          if (addr[0] === '!') continue;
          const cell = ws[addr];
          if (!cell || typeof cell.v !== 'string') continue;
          for (const m of cell.v.matchAll(/\{\{([^}]+)\}\}/g)) {
            const key = m[1].trim();
            if (!seen.has(key)) { seen.add(key); keys.push(key); }
          }
        }
      }
    } else {
      html = await res.text();
      keys = templatePlaceholdersFromHtml(html);
    }
    if (token !== templateOpenToken) return;
    templateState = { t, format: t.format, html, buffer, keys };
    const formHtml = templateRenderForm(keys, ctx);
    const body = `
      <div class="tpl-modal-layout">
        <div class="tpl-form-pane">${formHtml}</div>
        <div class="tpl-preview-pane">
          <div class="tpl-preview-note">Sửa trực tiếp các trường bên trái; bản xem trước cập nhật ngay.</div>
          <div id="tpl-preview-host"><div class="tpl-loading">Đang dựng bản xem trước...</div></div>
        </div>
      </div>`;
    const footer = `
      <button class="btn btn-secondary" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" id="tpl-download-btn">
        <span class="material-symbols-rounded">download</span> Tải ${t.format === 'excel' ? 'Excel' : 'Word'}
      </button>`;
    openModal(t.name, body, footer, 'xl');
    document.querySelectorAll('[data-tpl-key]').forEach(el => {
      el.addEventListener('input', templateSchedulePreview);
      el.addEventListener('change', templateSchedulePreview);
    });
    document.getElementById('tpl-download-btn')?.addEventListener('click', () => templateDownloadCurrent());
    templateUpdatePreview();
  } catch (err) {
    if (token !== templateOpenToken) return;
    const body = `<div class="tpl-empty">Lỗi tải mẫu: ${templateEsc(err.message)}</div>`;
    openModal(t.name, body, '<button class="btn btn-secondary" onclick="closeModal()">Đóng</button>', 'xl');
  }
}

async function templateDownloadCurrent() {
  if (!templateState) return;
  const t = templateState.t;
  const values = templateCurrentValues();
  const btn = document.getElementById('tpl-download-btn');
  if (btn) btn.disabled = true;
  try {
    if (t.format === 'word') {
      templateDownloadWord(templateApplyHtml(templateState.html, values), t.code);
    } else {
      await templateEnsureXlsx();
      const wb = XLSX.read(templateState.buffer, { type: 'array' });
      templateApplyWorkbook(wb, values);
      XLSX.writeFile(wb, templateFilename(t), { compression: true });
    }
    if (typeof showToast === 'function') showToast('Đã tạo file từ mẫu');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function cleanupTemplatePreview() {
  if (templatePreviewUrl) {
    URL.revokeObjectURL(templatePreviewUrl);
    templatePreviewUrl = null;
  }
  clearTimeout(templatePreviewTimer);
  templateOpenToken++;
  templateState = null;
}

// Dọn URL/blob khi modal đóng bằng bất kỳ cách nào.
(function observeTemplateModal() {
  const modal = document.getElementById('modal');
  if (!modal || typeof MutationObserver === 'undefined') return;
  new MutationObserver(() => {
    if (modal.classList.contains('hidden')) cleanupTemplatePreview();
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });
})();

// Bộ lọc và tìm kiếm
['search-templates', 'filter-template-stage', 'filter-template-format'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', renderTemplateCards);
  el.addEventListener('change', renderTemplateCards);
});

// Nếu người dùng tải lại trang khi đang ở tab Mẫu biểu, app.js đã chạy trước
// nên cần vẽ lại sau khi module này nạp xong.
if (typeof state !== 'undefined' && state.currentView === 'templates') {
  renderTemplatesView();
}



