// ============================================================
// GIAO DIỆN CÂY QUY TRÌNH
// Đọc WorkflowCatalog (workflow-catalog.js), hiển thị theo dự án/gói thầu,
// lưu trạng thái vào project.workflow.nodes.
// ============================================================
const WorkflowCatalog = (typeof window !== 'undefined' && window.WorkflowCatalog)
  || (typeof globalThis !== 'undefined' && globalThis.WorkflowCatalog)
  || {};

let workflowPackageId = '';
let wfCurrentNodes = new Map();
let wfCurrentWorkflow = null;

function wfEsc(value) {
  return typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '');
}

function wfToday() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function wfGetProject() {
  return typeof getCurrentProject === 'function' ? getCurrentProject() : null;
}

function wfEnsureState(project) {
  if (!project.workflow || typeof project.workflow !== 'object') project.workflow = {};
  if (!project.workflow.nodes || typeof project.workflow.nodes !== 'object') project.workflow.nodes = {};
  return project.workflow;
}

function wfNodeRecord(project, nodeId) {
  return project?.workflow?.nodes?.[nodeId] || null;
}

function wfNodeStatus(project, nodeId) {
  return wfNodeRecord(project, nodeId)?.status || 'notStarted';
}

function wfStatusMeta(status) {
  return WorkflowCatalog.statuses[status] || WorkflowCatalog.statuses.notStarted;
}

function wfProgress(nodes, project) {
  const required = (nodes || []).filter(n => n.required);
  const done = required.filter(n => wfNodeStatus(project, n.id) === 'done').length;
  const total = required.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
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

function wfRenderWorkflowView() {
  const container = document.getElementById('workflow-container');
  const toolbar = document.getElementById('workflow-toolbar');
  if (!container) return;
  if (!WorkflowCatalog || typeof WorkflowCatalog.build !== 'function') {
    container.innerHTML = '<div class="wf-empty">Không tải được dữ liệu cây quy trình.</div>';
    return;
  }
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    if (toolbar) toolbar.innerHTML = '';
    container.innerHTML = '<div class="wf-empty">Cây quy trình chỉ dành cho quản trị viên.</div>';
    return;
  }
  const project = wfGetProject();
  if (!project) {
    if (toolbar) toolbar.innerHTML = '';
    container.innerHTML = '<div class="wf-empty">Chọn hoặc tạo dự án để xem cây quy trình.</div>';
    return;
  }
  wfEnsureState(project);
  const workflow = WorkflowCatalog.build(project);
  wfCurrentWorkflow = workflow;
  wfCurrentNodes = new Map();
  for (const node of workflow.master) wfCurrentNodes.set(node.id, node);
  for (const group of workflow.packages) for (const node of group.nodes) wfCurrentNodes.set(node.id, node);
  if (workflowPackageId !== 'all' && !workflow.packages.some(g => g.pkg.id === workflowPackageId)) {
    workflowPackageId = workflow.packages[0]?.pkg.id || 'all';
  }
  wfRenderToolbar(workflow, project);
  const groups = workflowPackageId === 'all'
    ? workflow.packages
    : workflow.packages.filter(g => g.pkg.id === workflowPackageId);

  const masterGroups = wfGroupByStage(workflow.master);
  const preGroups = masterGroups.filter(([stage]) => wfStageIndex(stage) < wfStageIndex('quyetToan'));
  const postGroups = masterGroups.filter(([stage]) => wfStageIndex(stage) >= wfStageIndex('quyetToan'));
  const masterTitle = workflow.isPurchase ? 'Quy trình chung của dự toán mua sắm' : 'Quy trình chung của dự án';
  const preHtml = preGroups.length
    ? `<div class="wf-section-title">${wfEsc(masterTitle)}</div>` +
      preGroups.map(([stage, nodes]) => wfRenderStage(stage, nodes, project)).join('')
    : '';
  const postHtml = postGroups.length
    ? `<div class="wf-section-title">Kết thúc dự án</div>` +
      postGroups.map(([stage, nodes]) => wfRenderStage(stage, nodes, project)).join('')
    : '';
  const packageHtml = groups.length
    ? `<div class="wf-section-title">Quy trình theo gói thầu</div>` +
      groups.map(group => wfRenderPackageGroup(group, project)).join('')
    : (workflow.packages.length
      ? ''
      : '<div class="wf-empty">Dự án chưa có gói thầu. Thêm gói thầu để sinh cây quy trình chi tiết.</div>');
  container.innerHTML = preHtml + packageHtml + postHtml;
  container.onclick = (e) => {
    const btn = e.target.closest('[data-wf-node]');
    if (!btn) return;
    e.preventDefault();
    wfOpenNodeModal(btn.dataset.wfNode);
  };
}

function wfRenderToolbar(workflow, project) {
  const bar = document.getElementById('workflow-toolbar');
  if (!bar) return;
  const options = ['<option value="all">Toàn dự án</option>'].concat(
    workflow.packages.map(group => {
      const pkg = group.pkg;
      const prefix = pkg.categoryCode ? `[${pkg.categoryCode}] ` : '';
      return `<option value="${wfEsc(pkg.id)}" ${pkg.id === workflowPackageId ? 'selected' : ''}>${wfEsc(prefix + pkg.name)} (${wfEsc(wfPackageTypeLabel(pkg.pkgType))})</option>`;
    })
  ).join('');
  const groups = workflowPackageId === 'all'
    ? workflow.packages
    : workflow.packages.filter(g => g.pkg.id === workflowPackageId);
  const allNodes = [...workflow.master, ...groups.flatMap(g => g.nodes)];
  const progress = wfProgress(allNodes, project);
  const scopeLabel = workflow.isPurchase ? 'Mua sắm' : 'Dự án';
  const groupLabel = project.projectGroup ? ` · ${project.projectGroup}` : '';
  bar.innerHTML = `
    <div class="wf-toolbar-row">
      <div class="wf-toolbar-project">
        <b>${wfEsc(project.fullName || project.name)}</b>
        <span>${wfEsc(scopeLabel + groupLabel)}</span>
      </div>
      <label for="workflow-package-select">Gói thầu:</label>
      <select id="workflow-package-select">${options}</select>
      <div class="wf-progress-wrap">
        <div class="wf-progress-label">Tiến độ: <b>${progress.done}/${progress.total}</b> bước bắt buộc (${progress.pct}%)</div>
        <div class="wf-progress-bar"><span style="width:${progress.pct}%"></span></div>
      </div>
    </div>
    <div class="wf-legend">
      <span class="wf-legend-item"><i class="wf-legend-dot not-started"></i>Chưa thực hiện</span>
      <span class="wf-legend-item"><i class="wf-legend-dot in-progress"></i>Đang thực hiện</span>
      <span class="wf-legend-item"><i class="wf-legend-dot done"></i>Hoàn thành</span>
      <span class="wf-legend-item"><i class="wf-legend-dot blocked"></i>Vướng mắc</span>
      <span class="wf-legend-item"><i class="wf-legend-dot skipped"></i>Bỏ qua (tùy chọn)</span>
    </div>`;
  document.getElementById('workflow-package-select')?.addEventListener('change', (e) => {
    workflowPackageId = e.target.value;
    wfRenderWorkflowView();
  });
}

function wfRenderStage(stage, nodes, project) {
  if (!nodes.length) return '';
  const progress = wfProgress(nodes, project);
  const open = progress.done < progress.total;
  return `
    <details class="wf-stage" ${open ? 'open' : ''}>
      <summary class="wf-stage-summary">
        <span class="wf-stage-name">${wfEsc(wfStageLabel(stage))}</span>
        <span class="wf-stage-progress">${progress.done}/${progress.total}</span>
      </summary>
      <div class="wf-stage-body">
        ${nodes.map(node => wfRenderNode(node, project)).join('')}
      </div>
    </details>`;
}

function wfRenderPackageGroup(group, project) {
  const pkg = group.pkg;
  const progress = wfProgress(group.nodes, project);
  const open = workflowPackageId !== 'all';
  const stages = wfGroupByStage(group.nodes)
    .map(([stage, nodes]) => wfRenderStage(stage, nodes, project))
    .join('');
  return `
    <details class="wf-package" ${open ? 'open' : ''}>
      <summary class="wf-package-summary">
        <span class="wf-package-name">${wfEsc(pkg.name)}</span>
        <span class="wf-badge type">${wfEsc(wfPackageTypeLabel(pkg.pkgType))}</span>
        <span class="wf-stage-progress">${progress.done}/${progress.total}</span>
      </summary>
      <div class="wf-package-body">${stages}</div>
    </details>`;
}

function wfRenderNode(node, project) {
  const status = wfNodeStatus(project, node.id);
  const meta = wfStatusMeta(status);
  const rec = wfNodeRecord(project, node.id) || {};
  const basis = (node.legalBasis || []).join(' · ');
  const optional = node.optional ? '<span class="wf-badge optional">Tùy chọn</span>' : '';
  const metaBits = [];
  if (rec.date) metaBits.push(`<span>Ngày: ${wfEsc(rec.date)}</span>`);
  if (rec.assignee) metaBits.push(`<span>Phụ trách: ${wfEsc(rec.assignee)}</span>`);
  const note = rec.note ? `<div class="wf-node-note">${wfEsc(rec.note)}</div>` : '';
  return `
    <div class="wf-node ${meta.className}">
      <span class="wf-node-dot"></span>
      <div class="wf-node-card">
        <div class="wf-node-head">
          <span class="wf-node-title">${wfEsc(node.title)}</span>
          <span class="wf-badge ${meta.className}">${wfEsc(meta.label)}</span>
          ${optional}
        </div>
        ${node.hint ? `<div class="wf-node-hint">${wfEsc(node.hint)}</div>` : ''}
        ${basis ? `<div class="wf-node-basis">Căn cứ: ${wfEsc(basis)}</div>` : ''}
        ${metaBits.length ? `<div class="wf-node-meta">${metaBits.join('')}</div>` : ''}
        ${note}
        <div class="wf-node-actions">
          <button class="btn btn-secondary btn-sm" data-wf-node="${wfEsc(node.id)}">
            <span class="material-symbols-rounded">edit</span> Cập nhật
          </button>
        </div>
      </div>
    </div>`;
}

function wfOpenNodeModal(nodeId) {
  const project = wfGetProject();
  const node = wfCurrentNodes.get(nodeId);
  if (!project || !node) return;
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
    if (typeof showToast === 'function') showToast('Chỉ quản trị viên được cập nhật quy trình', 'error');
    return;
  }
  const rec = wfNodeRecord(project, nodeId) || {};
  const status = rec.status || 'notStarted';
  const statusOptions = Object.entries(WorkflowCatalog.statuses)
    .filter(([key]) => key !== 'skipped' || node.optional)
    .map(([key, meta]) => `<option value="${key}" ${key === status ? 'selected' : ''}>${wfEsc(meta.label)}</option>`)
    .join('');
  const basis = (node.legalBasis || []).join(' · ');
  const outputs = (node.outputs || []).join('; ');
  const packageLine = node.packageName
    ? `<div><b>Gói thầu:</b> ${wfEsc(node.packageName)}</div>`
    : '';
  const body = `
    <div class="wf-modal-meta">
      ${packageLine}
      <div><b>Giai đoạn:</b> ${wfEsc(wfStageLabel(node.stage))}</div>
      ${node.hint ? `<div class="wf-modal-hint">${wfEsc(node.hint)}</div>` : ''}
      ${basis ? `<div class="wf-modal-basis"><b>Căn cứ:</b> ${wfEsc(basis)}</div>` : ''}
      ${outputs ? `<div class="wf-modal-basis"><b>Đầu ra:</b> ${wfEsc(outputs)}</div>` : ''}
      ${node.optional ? '<div class="wf-modal-basis"><b>Lưu ý:</b> Bước này là tùy chọn, có thể bỏ qua nếu không thuộc trường hợp áp dụng.</div>' : ''}
    </div>
    <div class="form-grid" style="margin-top:14px">
      <div class="form-group">
        <label for="wf-node-status">Trạng thái</label>
        <select id="wf-node-status">${statusOptions}</select>
      </div>
      <div class="form-group">
        <label for="wf-node-date">Ngày thực hiện</label>
        <input id="wf-node-date" type="text" placeholder="dd/mm/yyyy" value="${wfEsc(rec.date || wfToday())}">
      </div>
      <div class="form-group">
        <label for="wf-node-assignee">Người phụ trách</label>
        <input id="wf-node-assignee" type="text" placeholder="Họ tên, đơn vị" value="${wfEsc(rec.assignee || '')}">
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label for="wf-node-note">Ghi chú</label>
        <textarea id="wf-node-note" rows="3" placeholder="Số văn bản, nội dung, vướng mắc...">${wfEsc(rec.note || '')}</textarea>
      </div>
    </div>`;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" id="wf-node-save">
      <span class="material-symbols-rounded">save</span> Lưu
    </button>`;
  openModal(`Cập nhật: ${node.title}`, body, footer, 'lg');
  document.getElementById('wf-node-save').onclick = () => {
    wfSaveNode(nodeId, {
      status: document.getElementById('wf-node-status').value,
      date: document.getElementById('wf-node-date').value.trim(),
      assignee: document.getElementById('wf-node-assignee').value.trim(),
      note: document.getElementById('wf-node-note').value.trim()
    });
  };
}

function wfSaveNode(nodeId, data) {
  const project = wfGetProject();
  if (!project) return;
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') return;
  wfEnsureState(project);
  project.workflow.nodes[nodeId] = {
    ...(project.workflow.nodes[nodeId] || {}),
    status: data.status || 'notStarted',
    date: data.date || '',
    assignee: data.assignee || '',
    note: data.note || '',
    updatedAt: new Date().toISOString()
  };
  project.workflow.updatedAt = new Date().toISOString();
  const auditNode = wfCurrentNodes.get(nodeId);
  if (typeof addAudit === 'function' && auditNode) {
    addAudit(project, 'update', 'workflow', auditNode.title, `Trạng thái: ${wfStatusMeta(data.status || 'notStarted').label}`);
  }
  if (typeof saveState === 'function') saveState();
  closeModal();
  wfRenderWorkflowView();
  if (typeof showToast === 'function') showToast('Đã cập nhật bước quy trình');
}

// Ve lai khi tai lai trang o tab workflow
if (typeof state !== 'undefined' && state.currentView === 'workflow') {
  wfRenderWorkflowView();
}

// Tên hàm theo quy ước chung của app.js
function renderWorkflowView() {
  wfRenderWorkflowView();
}



