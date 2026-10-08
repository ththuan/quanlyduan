/* ============================================================
   Kho tri thức pháp luật tự học — UI
   Danh sách mục (chờ duyệt / đã duyệt) + đồ thị nơ-ron liên kết.
   ============================================================ */

let wikiState = { view: 'list', entries: [], stats: {} };
let wikiGraphAnim = null;

function wikiGet(url, options) {
  return fetch(url, options).then(res => {
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Phiên hết hạn'); }
    return res.json().then(d => {
      if (!res.ok) throw new Error(d.error || 'Lỗi máy chủ');
      return d;
    });
  });
}

async function renderWikiView() {
  const box = document.getElementById('wiki-container');
  if (!box) return;
  box.innerHTML = '<p class="pdf-empty">Đang tải kho tri thức...</p>';
  try {
    const [entries, stats] = await Promise.all([
      wikiGet('/api/wiki/entries'),
      wikiGet('/api/wiki/stats')
    ]);
    wikiState.entries = entries || [];
    wikiState.stats = stats || {};
    wikiRenderBody();
  } catch (e) {
    box.innerHTML = '<p class="pdf-empty">Lỗi: ' + esc(e.message) + '</p>';
  }
}

function wikiSetView(v) {
  wikiState.view = v;
  wikiRenderBody();
}

function wikiRenderBody() {
  const box = document.getElementById('wiki-container');
  if (!box) return;
  const s = wikiState.stats;
  const head = `
    <div class="wiki-stats">
      <div class="kpi-card glass-card" data-color="cyan"><div class="kpi-label">Đã duyệt</div><div class="kpi-value">${s.approved || 0}</div></div>
      <div class="kpi-card glass-card" data-color="amber"><div class="kpi-label">Chờ duyệt</div><div class="kpi-value">${s.pending || 0}</div></div>
      <div class="kpi-card glass-card" data-color="purple"><div class="kpi-label">Tổng mục</div><div class="kpi-value">${s.total || 0}</div></div>
    </div>`;

  if (wikiState.view === 'graph') {
    box.innerHTML = head + '<div class="chart-card glass-card"><h3><span class="material-symbols-rounded">hub</span> Đồ thị liên kết tri thức</h3><div id="wiki-graph"></div></div>';
    wikiRenderGraph();
  } else {
    box.innerHTML = head + wikiListHTML();
  }
}

function wikiListHTML() {
  const pending = wikiState.entries.filter(e => e.status === 'pending');
  const approved = wikiState.entries.filter(e => e.status === 'approved');

  const itemHTML = (e) => `
    <div class="wiki-item">
      <div class="wiki-item-head">
        <span class="wiki-item-title">${esc(e.title)}</span>
        <span class="badge ${e.type === 'source-summary' ? 'badge-info' : 'badge-neutral'}">${e.type === 'source-summary' ? 'Văn bản' : 'Khái niệm'}</span>
      </div>
      <div class="wiki-item-content">${esc(e.content)}</div>
      ${e.sources && e.sources.length ? `<div class="wiki-item-sources">Nguồn: ${e.sources.map(s => esc(s.doc + (s.article ? ' · Điều ' + s.article : ''))).join(', ')}</div>` : ''}
      <div class="wiki-item-actions">
        ${e.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="wikiApprove('${e.id}')">Duyệt</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="wikiDelete('${e.id}')">Xóa</button>
      </div>
    </div>`;

  return `
    <div class="wiki-section">
      <h3 class="wiki-section-title"><span class="material-symbols-rounded">pending_actions</span> Chờ duyệt (${pending.length})</h3>
      ${pending.length ? pending.map(itemHTML).join('') : '<p class="pdf-empty">Không có mục chờ duyệt.</p>'}
    </div>
    <div class="wiki-section">
      <h3 class="wiki-section-title"><span class="material-symbols-rounded">verified</span> Đã duyệt (${approved.length})</h3>
      ${approved.length ? approved.map(itemHTML).join('') : '<p class="pdf-empty">Chưa có tri thức đã duyệt. Hãy hỏi trợ lý AI rồi bấm "Lưu vào kho tri thức", hoặc bấm "Ingest văn bản mới".</p>'}
    </div>`;
}

async function wikiApprove(id) {
  try {
    await wikiGet('/api/wiki/entries/' + encodeURIComponent(id) + '/approve', { method: 'POST' });
    showToast('Đã duyệt mục vào kho tri thức');
    renderWikiView();
  } catch (e) { showToast(e.message, 'error'); }
}

async function wikiDelete(id) {
  if (!confirm('Xóa mục này khỏi kho tri thức?')) return;
  try {
    await wikiGet('/api/wiki/entries/' + encodeURIComponent(id), { method: 'DELETE' });
    showToast('Đã xóa', 'info');
    renderWikiView();
  } catch (e) { showToast(e.message, 'error'); }
}

async function wikiIngest() {
  if (!confirm('Ingest sẽ dùng AI tóm tắt các văn bản pháp luật chưa có trong kho. Tiếp tục?')) return;
  showToast('Đang ingest văn bản pháp luật... (có thể mất vài phút)', 'info');
  try {
    const r = await wikiGet('/api/wiki/ingest', { method: 'POST' });
    showToast('Đã tạo ' + (r.created || []).length + ' mục tóm tắt văn bản (chờ duyệt)');
    renderWikiView();
  } catch (e) { showToast(e.message, 'error'); }
}

// Lưu một cặp hỏi-đáp vào kho tri thức (gọi từ chat)
async function wikiLearn(question, answer) {
  try {
    const r = await wikiGet('/api/wiki/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer })
    });
    if (r.skipped) { showToast('AI không tìm thấy kiến thức cần lưu', 'info'); return; }
    showToast('Đã thêm vào kho tri thức (chờ duyệt)');
  } catch (e) { showToast(e.message, 'error'); }
}

/* ---- Đồ thị nơ-ron (kiểu knowledge engine) ---- */
function wikiStatusColor(status) {
  return status === 'approved' ? '#22d3ee' : '#fbbf24';
}

async function wikiRenderGraph() {
  const el = document.getElementById('wiki-graph');
  if (!el) return;
  if (wikiGraphAnim) { cancelAnimationFrame(wikiGraphAnim); wikiGraphAnim = null; }
  try {
    const g = await wikiGet('/api/wiki/graph');
    if (!g.nodes.length) { el.innerHTML = '<p class="pdf-empty">Chưa có tri thức để vẽ đồ thị.</p>'; return; }
    el.innerHTML = '<canvas id="wiki-graph-canvas"></canvas>';
    wikiDrawGraph(document.getElementById('wiki-graph-canvas'), g);
  } catch (e) { el.innerHTML = '<p class="pdf-empty">Lỗi: ' + esc(e.message) + '</p>'; }
}

function wikiDrawGraph(canvas, g) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(340, canvas.parentElement.clientWidth);
  const height = 460;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const cx = width / 2, cy = height / 2;
  const R = Math.min(width, height) / 2 - 90;
  const n = g.nodes.length;

  const nodes = g.nodes.map((nd, i) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      ...nd,
      x: cx + Math.cos(ang) * R,
      y: cy + Math.sin(ang) * R,
      r: 16,
      color: wikiStatusColor(nd.status)
    };
  });
  const byId = new Map(nodes.map(x => [x.id, x]));

  let tip = canvas.parentElement.querySelector('.chart-tooltip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tooltip'; canvas.parentElement.appendChild(tip); }

  const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.1 + 0.3, tw: Math.random() * 6 }));

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(full, 16);
    return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${a})`;
  }

  let t = 0;
  function frame() {
    wikiGraphAnim = requestAnimationFrame(frame);
    t += 0.016;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.7);
    bg.addColorStop(0, '#1e293b');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    stars.forEach(d => {
      ctx.globalAlpha = Math.max(0, 0.2 + 0.25 * Math.sin(t * 2 + d.tw));
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Edges
    g.edges.forEach(e => {
      const a = byId.get(e.from), b = byId.get(e.to);
      if (!a || !b) return;
      const col = e.kind === 'shared' ? 'rgba(148,163,184,0.25)' : 'rgba(34,211,238,0.4)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // energy dot
      const s = (t * 0.6) % 1;
      const px = a.x + (b.x - a.x) * s, py = a.y + (b.y - a.y) * s;
      ctx.fillStyle = 'rgba(34,211,238,0.7)';
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    });

    // Nodes
    nodes.forEach(nd => {
      const breathe = 1 + Math.sin(t * 1.5 + nd.x) * 0.04;
      const Rr = nd.r * breathe;
      const halo = ctx.createRadialGradient(nd.x, nd.y, Rr * 0.4, nd.x, nd.y, Rr * 2.4);
      halo.addColorStop(0, hexA(nd.color, 0.4));
      halo.addColorStop(1, hexA(nd.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(nd.x, nd.y, Rr * 2.4, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = nd.color;
      ctx.beginPath(); ctx.arc(nd.x, nd.y, Rr, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();

      // label below
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const label = String(nd.label || '').length > 26 ? nd.label.slice(0, 26) + '…' : (nd.label || '');
      ctx.fillText(label, nd.x, nd.y + Rr + 6);
    });
  }
  wikiGraphAnim = requestAnimationFrame(frame);

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = nodes.find(nd => Math.hypot(mx - nd.x, my - nd.y) <= nd.r + 5);
    if (!hit) { tip.style.display = 'none'; return; }
    tip.style.display = 'block';
    tip.innerHTML = `<strong>${esc(hit.label)}</strong><br>${hit.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'} · ${hit.type === 'source-summary' ? 'Văn bản' : 'Khái niệm'}`;
    tip.style.left = Math.min(mx + 14, rect.width - 200) + 'px';
    tip.style.top = Math.max(my - 10, 0) + 'px';
  };
  canvas.onmouseleave = () => { tip.style.display = 'none'; };
}
