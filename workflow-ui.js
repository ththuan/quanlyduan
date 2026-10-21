// ============================================================
// CÂY QUY TRÌNH THAM KHẢO ĐỘC LẬP
// Không gắn với dự án cụ thể; admin chọn loại quy trình, loại gói,
// hình thức lựa chọn để xem lại cách làm.
// ============================================================
const WorkflowCatalog = (typeof window !== 'undefined' && window.WorkflowCatalog)
  || (typeof globalThis !== 'undefined' && globalThis.WorkflowCatalog)
  || {};

const WF_SCOPE_OPTIONS = [
  { value: 'project', label: 'Dự án đầu tư xây dựng' },
  { value: 'nonProject', label: 'Mua sắm tài sản công / dự toán mua sắm' }
];

const WF_PACKAGE_TYPE_OPTIONS = [
  { value: 'consulting', label: 'Gói tư vấn' },
  { value: 'construction', label: 'Gói xây lắp' },
  { value: 'goods', label: 'Gói hàng hóa' },
  { value: 'mixed', label: 'Gói hỗn hợp / EPC' },
  { value: 'nonConsulting', label: 'Gói phi tư vấn' },
  { value: 'cost', label: 'Chi phí (không lựa chọn nhà thầu)' }
];

const WF_METHOD_OPTIONS = [
  { value: '', label: 'Đấu thầu rộng rãi (mặc định)' },
  { value: 'Đấu thầu hạn chế', label: 'Đấu thầu hạn chế' },
  { value: 'Chỉ định thầu thông thường', label: 'Chỉ định thầu thông thường' },
  { value: 'Chỉ định thầu rút gọn', label: 'Chỉ định thầu rút gọn' },
  { value: 'Chào hàng cạnh tranh', label: 'Chào hàng cạnh tranh' },
  { value: 'Mua sắm trực tiếp', label: 'Mua sắm trực tiếp' },
  { value: 'Tự thực hiện', label: 'Tự thực hiện' },
  { value: 'Cộng đồng dân cư', label: 'Cộng đồng dân cư' },
  { value: 'Đặt hàng', label: 'Đặt hàng' },
  { value: 'Đàm phán giá', label: 'Đàm phán giá' },
  { value: 'Trường hợp đặc biệt', label: 'Trường hợp đặc biệt' },
  { value: 'Chào giá trực tuyến', label: 'Chào giá trực tuyến' },
  { value: 'Mua sắm trực tuyến', label: 'Mua sắm trực tuyến' },
  { value: 'Mua sắm tập trung', label: 'Mua sắm tập trung' },
  { value: 'Tư vấn cá nhân', label: 'Tư vấn cá nhân' },
  { value: 'Đấu thầu trước', label: 'Đấu thầu trước' }
];

function wfEsc(value) {
  return typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '');
}

function wfLoadScenario() {
  try {
    const raw = localStorage.getItem('qlda_workflow_scenario');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.scope && parsed.packageType) return parsed;
    }
  } catch (_) { /* bỏ qua */ }
  return { scope: 'project', packageType: 'construction', method: '' };
}

let wfScenario = wfLoadScenario();
if (!WF_SCOPE_OPTIONS.some(o => o.value === wfScenario.scope)) wfScenario.scope = 'project';
if (!WF_PACKAGE_TYPE_OPTIONS.some(o => o.value === wfScenario.packageType)) wfScenario.packageType = 'construction';
if (!WF_METHOD_OPTIONS.some(o => o.value === (wfScenario.method || ''))) wfScenario.method = '';

function wfSaveScenario() {
  try {
    localStorage.setItem('qlda_workflow_scenario', JSON.stringify(wfScenario));
  } catch (_) { /* bỏ qua */ }
}

function wfStageIndex(stage) {
  const i = WorkflowCatalog.stages.indexOf(stage);
  return i < 0 ? 99 : i;
}

function wfGroupByStage(nodes) {
  const map = new Map();
  for (const node of nodes || []) {
    const stage = node.stage || 'luaChonNhaThau';
    if (!map.has(stage)) map.set(stage, []);
    map.get(stage).push(node);
  }
  return [...map.entries()].sort((a, b) => wfStageIndex(a[0]) - wfStageIndex(b[0]));
}

function wfStageLabel(stage) {
  return WorkflowCatalog.stageLabels[stage] || stage;
}

function wfPackageTypeLabel(type) {
  return WorkflowCatalog.packageTypeLabels[type] || type || 'Khác';
}

function wfMethodLabel(method) {
  const found = WF_METHOD_OPTIONS.find(o => o.value === (method || ''));
  return found ? found.label : (method || 'Đấu thầu rộng rãi');
}

function wfOption(value, label, selected) {
  return `<option value="${wfEsc(value)}" ${value === selected ? 'selected' : ''}>${wfEsc(label)}</option>`;
}

function wfRenderBar(workflow) {
  const bar = document.getElementById('workflow-toolbar');
  if (!bar) return;
  const methodDisabled = wfScenario.packageType === 'cost';
  bar.innerHTML = `
    <div class="wf-scenario-grid">
      <div class="wf-scenario-field">
        <label for="wf-scope">Loại quy trình</label>
        <select id="wf-scope">
          ${WF_SCOPE_OPTIONS.map(o => wfOption(o.value, o.label, wfScenario.scope)).join('')}
        </select>
      </div>
      <div class="wf-scenario-field">
        <label for="wf-package-type">Loại gói thầu</label>
        <select id="wf-package-type">
          ${WF_PACKAGE_TYPE_OPTIONS.map(o => wfOption(o.value, o.label, wfScenario.packageType)).join('')}
        </select>
      </div>
      <div class="wf-scenario-field">
        <label for="wf-method">Hình thức lựa chọn</label>
        <select id="wf-method" ${methodDisabled ? 'disabled' : ''}>
          ${WF_METHOD_OPTIONS.map(o => wfOption(o.value, o.label, wfScenario.method)).join('')}
        </select>
      </div>
      <div class="wf-scenario-actions">
        <button class="btn btn-secondary btn-sm" id="wf-expand">Mở tất cả</button>
        <button class="btn btn-secondary btn-sm" id="wf-collapse">Thu gọn</button>
        <button class="btn btn-primary btn-sm" id="wf-print">
          <span class="material-symbols-rounded">print</span> In / PDF
        </button>
      </div>
    </div>
    <div class="wf-scenario-summary">
      <span class="material-symbols-rounded">account_tree</span>
      <span>${wfEsc(WF_SCOPE_OPTIONS.find(o => o.value === wfScenario.scope)?.label || '')}
        · ${wfEsc(wfPackageTypeLabel(wfScenario.packageType))}
        · ${wfEsc(methodDisabled ? 'Không áp dụng lựa chọn nhà thầu' : wfMethodLabel(wfScenario.method))}</span>
    </div>
    <div class="wf-scenario-note">
      Quy trình tham khảo độc lập, không gắn với dự án cụ thể. Chọn loại/hình thức để xem lại cách làm.
    </div>`;

  document.getElementById('wf-scope')?.addEventListener('change', (e) => {
    wfScenario.scope = e.target.value;
    wfSaveScenario();
    wfRenderWorkflowView();
  });
  document.getElementById('wf-package-type')?.addEventListener('change', (e) => {
    wfScenario.packageType = e.target.value;
    if (wfScenario.packageType === 'cost') wfScenario.method = '';
    wfSaveScenario();
    wfRenderWorkflowView();
  });
  document.getElementById('wf-method')?.addEventListener('change', (e) => {
    wfScenario.method = e.target.value;
    wfSaveScenario();
    wfRenderWorkflowView();
  });
  document.getElementById('wf-expand')?.addEventListener('click', () => wfExpandAll(true));
  document.getElementById('wf-collapse')?.addEventListener('click', () => wfExpandAll(false));
  document.getElementById('wf-print')?.addEventListener('click', () => { wfExpandAll(true); setTimeout(() => window.print(), 60); });
}

function wfRenderWorkflowView() {
  const container = document.getElementById('workflow-container');
  if (!container) return;
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    container.innerHTML = '<div class="wf-empty">Cây quy trình chỉ dành cho quản trị viên.</div>';
    return;
  }
  if (!WorkflowCatalog || typeof WorkflowCatalog.buildScenario !== 'function') {
    container.innerHTML = '<div class="wf-empty">Không tải được dữ liệu cây quy trình.</div>';
    return;
  }
  const workflow = WorkflowCatalog.buildScenario(wfScenario);
  wfRenderBar(workflow);
  const masterGroups = wfGroupByStage(workflow.master);
  const preGroups = masterGroups.filter(([stage]) => wfStageIndex(stage) < wfStageIndex('quyetToan'));
  const postGroups = masterGroups.filter(([stage]) => wfStageIndex(stage) >= wfStageIndex('quyetToan'));
  const masterTitle = workflow.isPurchase ? 'Quy trình chung của dự toán mua sắm' : 'Quy trình chung của dự án';
  const preHtml = preGroups.length
    ? `<div class="wf-section-title">${wfEsc(masterTitle)}</div>` +
      preGroups.map(([stage, nodes]) => wfRenderStage(stage, nodes)).join('')
    : '';
  const postHtml = postGroups.length
    ? `<div class="wf-section-title">Kết thúc dự án</div>` +
      postGroups.map(([stage, nodes]) => wfRenderStage(stage, nodes)).join('')
    : '';
  const pkg = workflow.packages[0];
  const pkgNodes = pkg ? pkg.nodes : [];
  const pkgHtml = pkgNodes.length
    ? `<div class="wf-section-title">Quy trình gói thầu: ${wfEsc(wfPackageTypeLabel(pkg.pkg.pkgType))} · ${wfEsc(wfScenario.packageType === 'cost' ? 'Không áp dụng lựa chọn nhà thầu' : wfMethodLabel(workflow.method))}</div>` +
      wfGroupByStage(pkgNodes).map(([stage, nodes]) => wfRenderStage(stage, nodes)).join('')
    : '';
  container.innerHTML = preHtml + pkgHtml + postHtml;
}

function wfRenderStage(stage, nodes) {
  if (!nodes.length) return '';
  return `
    <details class="wf-stage" open>
      <summary class="wf-stage-summary">
        <span class="wf-stage-name">${wfEsc(wfStageLabel(stage))}</span>
        <span class="wf-stage-progress">${nodes.length} bước</span>
      </summary>
      <div class="wf-stage-body">
        ${nodes.map(node => wfRenderNode(node)).join('')}
      </div>
    </details>`;
}

function wfRenderNode(node) {
  const basis = (node.legalBasis || []).join(' · ');
  const outputs = (node.outputs || []).join('; ');
  const optional = node.optional ? '<span class="wf-badge optional">Tùy chọn</span>' : '';
  const icon = node.type === 'gate' ? 'verified' : (node.type === 'document' ? 'description' : 'task_alt');
  return `
    <div class="wf-node">
      <span class="wf-node-dot"></span>
      <div class="wf-node-card">
        <div class="wf-node-head">
          <span class="material-symbols-rounded wf-node-icon">${icon}</span>
          <span class="wf-node-title">${wfEsc(node.title)}</span>
          ${optional}
        </div>
        ${node.hint ? `<div class="wf-node-hint">${wfEsc(node.hint)}</div>` : ''}
        ${basis ? `<div class="wf-node-basis">Căn cứ: ${wfEsc(basis)}</div>` : ''}
        ${outputs ? `<div class="wf-node-outputs"><b>Đầu ra:</b> ${wfEsc(outputs)}</div>` : ''}
      </div>
    </div>`;
}

function wfExpandAll(open) {
  document.querySelectorAll('#workflow-container details').forEach(d => { d.open = !!open; });
}

function renderWorkflowView() {
  wfRenderWorkflowView();
}

if (typeof state !== 'undefined' && state.currentView === 'workflow') {
  wfRenderWorkflowView();
}
