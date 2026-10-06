// ============================================================
// THƯ VIỆN PHÁP LUẬT (tra cứu văn bản trong thư mục phaply) + LỘ TRÌNH HÌNH THÀNH DỰ ÁN
// Dữ liệu văn bản do server/legal.js cung cấp; lộ trình dựa trên điều khoản của các văn bản đó.
// ============================================================
const legalLib = { docs: null, docId: '', outline: [], results: null, query: '' };

async function legalGet(url) {
  const res = typeof handleAuthResponse === 'function' ? handleAuthResponse(await fetch(url)) : await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lỗi tải dữ liệu pháp luật');
  return data;
}

function legalFold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function legalDocDate(iso) {
  return typeof formatDateVN === 'function' ? formatDateVN(iso) : iso;
}

// ---- Màn hình Tra cứu luật ----
function renderLegalLibrary() {
  if (!legalLib.pending) legalLib.pending = doRenderLegalLibrary().finally(() => { legalLib.pending = null; });
  return legalLib.pending;
}

async function doRenderLegalLibrary() {
  const box = document.getElementById('legal-container');
  if (!box) return;
  if (!legalLib.docs) {
    box.innerHTML = '<p style="color:var(--text-muted)">Đang tải kho văn bản…</p>';
    try { legalLib.docs = await legalGet('/api/legal/docs'); }
    catch (err) { box.innerHTML = `<p style="color:var(--accent-red)">${esc(err.message)}</p>`; return; }
  }
  box.innerHTML = `
    <div class="legal-search glass-card">
      <input type="text" id="legal-q" placeholder="Tìm điều khoản: chỉ định thầu xây lắp, hồ sơ quyết toán, bảo hành, Điều 78 NĐ 214…" value="${esc(legalLib.query)}" onkeydown="if(event.key==='Enter')legalSearch()">
      <select id="legal-doc-filter" title="Giới hạn trong một văn bản">
        <option value="">Tất cả văn bản</option>
        ${legalLib.docs.map(d => `<option value="${esc(d.id)}">${esc(d.short)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" onclick="legalSearch()"><span class="material-symbols-rounded">search</span> Tìm</button>
    </div>
    <div class="legal-grid">
      <div class="legal-left" id="legal-left"></div>
      <div class="legal-right glass-card" id="legal-viewer"><p class="legal-empty">Chọn một văn bản hoặc kết quả tìm kiếm để đọc nội dung.</p></div>
    </div>`;
  renderLegalLeft();
}

function renderLegalLeft() {
  const left = document.getElementById('legal-left');
  if (!left) return;
  if (legalLib.results) {
    left.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="legalBack()"><span class="material-symbols-rounded">arrow_back</span> Danh sách văn bản</button>
      <div class="legal-count">${legalLib.results.length} kết quả cho “${esc(legalLib.query)}”</div>
      ${legalLib.results.map(r => `
        <div class="legal-item" onclick="openLegalRef('${esc(r.doc)}','${esc(r.article)}')">
          <div class="legal-item-head">${esc(r.heading)}${r.repealed ? ' <span class="badge badge-danger">Hết hiệu lực</span>' : ''}</div>
          <div class="legal-item-doc">${esc(r.docShort)}</div>
          <div class="legal-item-snippet">${esc(r.snippet)}</div>
        </div>`).join('') || '<p class="legal-empty">Không tìm thấy điều khoản phù hợp.</p>'}`;
    return;
  }
  if (legalLib.docId) {
    const d = legalLib.docs.find(x => x.id === legalLib.docId);
    left.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="legalBack()"><span class="material-symbols-rounded">arrow_back</span> Danh sách văn bản</button>
      <div class="legal-docinfo">
        <strong>${esc(d.short)}</strong><br>${esc(d.title)}<br>
        <small>Số hiệu: ${esc(d.number)} · Hiệu lực: ${legalDocDate(d.effectiveDate)} · ${d.pages} trang</small>
        ${d.summary ? `<p>${esc(d.summary)}</p>` : ''}
      </div>
      <input type="text" class="legal-outline-filter" placeholder="Lọc theo điều…" oninput="legalFilterOutline(this.value)">
      <div id="legal-outline">${legalOutlineHTML('')}</div>`;
    return;
  }
  const groups = [...new Set(legalLib.docs.map(d => d.group))];
  left.innerHTML = groups.map(g => `
    <div class="legal-group-title">${esc(g)}</div>
    ${legalLib.docs.filter(d => d.group === g).map(d => `
      <div class="legal-doc-card glass-card" onclick="legalOpenDoc('${esc(d.id)}')">
        <div class="legal-doc-title">${esc(d.short)}</div>
        <div class="legal-doc-sub">${esc(d.title)}</div>
        <div class="legal-doc-meta">${esc(d.type)} · hiệu lực ${legalDocDate(d.effectiveDate)} · ${d.chunks} mục</div>
        ${d.summary ? `<div class="legal-doc-summary">${esc(d.summary)}</div>` : ''}
      </div>`).join('')}`).join('');
}

function legalOutlineHTML(filter) {
  const f = legalFold(filter);
  return legalLib.outline
    .filter(o => !f || legalFold(o.heading).includes(f))
    .map(o => `<div class="legal-item compact" onclick="openLegalRef('${esc(legalLib.docId)}','${esc(o.article)}')">
      ${esc(o.heading)}${o.repealed ? ' <span class="badge badge-danger">Hết hiệu lực</span>' : ''}</div>`).join('')
    || '<p class="legal-empty">Không có mục phù hợp.</p>';
}

function legalFilterOutline(v) {
  const el = document.getElementById('legal-outline');
  if (el) el.innerHTML = legalOutlineHTML(v);
}

async function legalOpenDoc(id) {
  try {
    legalLib.outline = await legalGet('/api/legal/doc/' + encodeURIComponent(id));
    legalLib.docId = id;
    legalLib.results = null;
    renderLegalLeft();
  } catch (err) { showToast(err.message, 'error'); }
}

function legalBack() {
  legalLib.docId = '';
  legalLib.results = null;
  renderLegalLeft();
}

async function legalSearch() {
  const q = document.getElementById('legal-q')?.value.trim();
  if (!q) return;
  const doc = document.getElementById('legal-doc-filter')?.value || '';
  try {
    legalLib.query = q;
    legalLib.results = await legalGet(`/api/legal/search?q=${encodeURIComponent(q)}&limit=20${doc ? '&doc=' + encodeURIComponent(doc) : ''}`);
    legalLib.docId = '';
    renderLegalLeft();
  } catch (err) { showToast(err.message, 'error'); }
}

function legalFormatText(text) {
  return text.split('\n').filter(l => l.trim()).map((l, i) => {
    const line = esc(l);
    if (i === 0) return `<p class="legal-p legal-p-head">${line}</p>`;
    if (/^[a-zđ]\)/.test(l)) return `<p class="legal-p legal-p-point">${line}</p>`;
    if (/^\d+\.\s/.test(l)) return `<p class="legal-p legal-p-clause">${line}</p>`;
    if (/^\[\d+\]/.test(l)) return `<p class="legal-p legal-p-note">${line}</p>`;
    return `<p class="legal-p">${line}</p>`;
  }).join('');
}

// Mở một Điều/Mẫu trong thư viện (dùng cho lộ trình, nguồn chatbot, cấu hình)
async function openLegalRef(docId, article) {
  if (state.currentView !== 'legal') switchView('legal');
  await renderLegalLibraryReady();
  const viewer = document.getElementById('legal-viewer');
  if (!viewer) return;
  viewer.innerHTML = '<p class="legal-empty">Đang tải…</p>';
  try {
    const a = await legalGet(`/api/legal/article?doc=${encodeURIComponent(docId)}&article=${encodeURIComponent(article)}`);
    legalLib.current = a;
    viewer.innerHTML = `
      <div class="legal-viewer-head">
        <div class="legal-viewer-doc">${esc(a.docShort)} <small>(${esc(a.docNumber)})</small></div>
        <h3>${esc(a.heading)}</h3>
        ${a.chapter ? `<div class="legal-viewer-chapter">${esc(a.chapter)}</div>` : ''}
        <div class="legal-viewer-actions">
          <button class="btn btn-secondary btn-sm" onclick="legalAskAI()"><span class="material-symbols-rounded">smart_toy</span> Hỏi AI về điều này</button>
          <button class="btn btn-secondary btn-sm" onclick="legalCopyCite()"><span class="material-symbols-rounded">content_copy</span> Sao chép trích dẫn</button>
        </div>
      </div>
      ${a.repealed ? `<div class="legal-warn"><span class="material-symbols-rounded">warning</span> Nội dung này đã hết hiệu lực: ${esc(a.repealed)}.</div>` : ''}
      <div class="legal-text">${legalFormatText(a.text)}</div>`;
    viewer.scrollTop = 0;
  } catch (err) {
    viewer.innerHTML = `<p class="legal-empty">${esc(err.message)}</p>`;
  }
}

async function renderLegalLibraryReady() {
  if (!document.getElementById('legal-viewer')) await renderLegalLibrary();
}

async function openLegalDoc(id) {
  if (state.currentView !== 'legal') switchView('legal');
  await renderLegalLibraryReady();
  await legalOpenDoc(id);
}

function legalCopyCite() {
  const a = legalLib.current;
  if (!a) return;
  const cite = `${a.heading.replace(/\.\s.*$/, '')}, ${a.docNumber} (${a.docShort})`;
  navigator.clipboard?.writeText(cite).then(() => showToast('Đã sao chép: ' + cite), () => showToast(cite));
}

function legalAskAI() {
  const a = legalLib.current;
  if (!a) return;
  document.getElementById('ai-chat-panel')?.classList.remove('hidden');
  aiSend(`Giải thích ${a.heading} (${a.docShort}) và nêu cách áp dụng cho dự án đang quản lý trong phần mềm.`);
}

// Nguồn trích dẫn dưới câu trả lời của chatbot
function aiRenderSources(botDiv, sources) {
  if (!sources || !sources.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'ai-sources';
  wrap.innerHTML = '<span>Căn cứ:</span> ' + sources.map(s =>
    `<a href="#" class="ai-source${s.repealed ? ' repealed' : ''}" title="${esc(s.heading)}" onclick="openLegalRef('${esc(s.doc)}','${esc(s.article)}');return false">${esc(s.docShort)} · ${esc(s.article)}</a>`).join('');
  botDiv.appendChild(wrap);
}

// ============================================================
// LỘ TRÌNH HÌNH THÀNH DỰ ÁN & HỒ SƠ PHÁP LÝ CẦN CÓ
// Mỗi bước nêu căn cứ (văn bản, Điều) trong kho; trạng thái tự đối chiếu với mục Pháp lý và gói thầu của dự án.
// ============================================================
const ROADMAP_PROJECT = [
  { stage: 'Chuẩn bị dự án', steps: [
    { title: 'Quyết định hoặc chấp thuận chủ trương đầu tư', optional: true, kw: /chu truong/,
      basis: [['LXD', 'Điều 23']], hint: 'Chỉ áp dụng với dự án thuộc diện phải quyết định hoặc chấp thuận chủ trương đầu tư theo pháp luật về đầu tư công (Điều 23 khoản 5).' },
    { title: 'Báo cáo nghiên cứu khả thi hoặc Báo cáo kinh tế - kỹ thuật', kw: /nghien cuu kha thi|kinh te.{0,4}ky thuat|bcnckt|bckt/,
      basis: [['LXD', 'Điều 23'], ['LXD', 'Điều 24'], ['LXD', 'Điều 25']], hint: 'Chỉ lập Báo cáo kinh tế - kỹ thuật khi thuộc trường hợp Điều 23 khoản 2 (quy mô nhỏ hoặc kỹ thuật đơn giản theo quy định của Chính phủ).' },
    { title: 'Thẩm định báo cáo', kw: /tham dinh|tham tra/,
      basis: [['LXD', 'Điều 26']], hint: 'Báo cáo phải được thẩm định làm cơ sở phê duyệt dự án (Điều 26 khoản 1).' },
    { title: 'Quyết định phê duyệt dự án (quyết định đầu tư)', kw: /phe duyet (du an|bao cao|bcnckt)|quyet dinh dau tu/,
      basis: [['LXD', 'Điều 28']], hint: 'Việc quyết định đầu tư thể hiện tại Quyết định phê duyệt dự án đầu tư xây dựng (Điều 28 khoản 1).' },
    { title: 'Kế hoạch vốn năm được giao', kw: /ke hoach (von|dau tu cong)|giao ke hoach|giao du toan|bo tri von/,
      basis: [['ND254', 'Điều 8']], hint: 'Là hồ sơ pháp lý gửi cơ quan thanh toán lần đầu cùng Quyết định phê duyệt dự án (Điều 8 khoản 1).' },
    { title: 'Phê duyệt dự toán (chuẩn bị đầu tư, gói thầu)', kw: /du toan/,
      basis: [['TT36-BXD', 'Điều 6'], ['TT36-BXD', 'Điều 7'], ['ND214', 'Điều 79']], hint: 'Chỉ định thầu thông thường cần có dự toán gói thầu được phê duyệt khi pháp luật ngành có quy định lập dự toán (NĐ 214 Điều 79 khoản 2).' },
    { title: 'Kế hoạch lựa chọn nhà thầu (KHLCNT)', kw: /ke hoach lua chon nha thau|khlcnt/,
      basis: [['LDT', 'Điều 38'], ['LDT', 'Điều 40'], ['ND214', 'Điều 16']], hint: 'Căn cứ gồm quyết định phê duyệt dự án, kế hoạch bố trí vốn…; chủ đầu tư phê duyệt (Luật Đấu thầu Điều 38, 40).' }
  ] },
  { stage: 'Thực hiện dự án', steps: [
    { title: 'Thiết kế bản vẽ thi công được phê duyệt', kw: /thiet ke/,
      basis: [['LXD', 'Điều 29'], ['LXD', 'Điều 48']], hint: 'Chủ đầu tư thẩm định, phê duyệt thiết kế triển khai sau khi dự án được phê duyệt; là một điều kiện khởi công (Điều 48 khoản 1c).' },
    { title: 'Giấy phép xây dựng', optional: true, kw: /giay phep xay dung|gpxd/,
      basis: [['LXD', 'Điều 43'], ['LXD', 'Điều 48']], hint: 'Điều kiện khởi công gồm có giấy phép xây dựng theo Điều 43; kiểm tra trường hợp được miễn.' },
    { title: 'Quyết định chỉ định thầu hoặc phê duyệt kết quả lựa chọn nhà thầu', kw: /chi dinh thau|ket qua lua chon nha thau|trung thau/,
      basis: [['ND214', 'Điều 78'], ['ND214', 'Điều 79'], ['ND214', 'Điều 80']], hint: 'Chỉ định thầu thông thường cần: KHLCNT được duyệt, kế hoạch bố trí vốn và dự toán gói thầu (nếu có quy định) — Điều 79 khoản 2.' },
    { title: 'Hợp đồng với nhà thầu', check: p => pkgsOf(p).some(k => hasValue(k.contract) || k.contractSignDate) ? 'Có hợp đồng trong gói thầu' : '',
      basis: [['LDT', 'Điều 66'], ['LDT', 'Điều 67'], ['LXD', 'Điều 82']], hint: 'Hợp đồng ký phù hợp quyết định phê duyệt kết quả lựa chọn nhà thầu (NĐ 214 Điều 79 khoản 3đ).' },
    { title: 'Thông báo khởi công xây dựng', optional: true, kw: /khoi cong/,
      basis: [['LXD', 'Điều 48']], hint: 'Chủ đầu tư gửi thông báo khởi công đến cơ quan quản lý nhà nước về xây dựng tại địa phương (Điều 48 khoản 1đ).' }
  ] },
  { stage: 'Nghiệm thu, bàn giao, quyết toán', steps: [
    { title: 'Nghiệm thu hoàn thành công trình', check: p => pkgsOf(p).some(k => (k.acceptances || []).length || k.acceptanceStatus === 'Đã nghiệm thu') ? 'Đã có nghiệm thu trong gói thầu' : '',
      basis: [['LXD', 'Điều 57']], hint: 'Công trình chỉ được đưa vào khai thác, sử dụng sau khi nghiệm thu (Điều 57 khoản 2).' },
    { title: 'Bàn giao đưa vào sử dụng', check: p => pkgsOf(p).some(k => k.handoverDate) ? 'Có ngày bàn giao' : '',
      basis: [['LXD', 'Điều 58']], hint: 'Việc bàn giao được lập thành biên bản (Điều 58 khoản 2).' },
    { title: 'Hồ sơ quyết toán dự án (Mẫu 01-07/QTDA)', manual: true, tab: 'qtda',
      basis: [['ND193', 'Điều 7'], ['ND193', 'Điều 21'], ['TT73-2026', 'Điều 4']], hint: 'Thời gian lập hồ sơ tối đa tính từ ngày bàn giao: nhóm A 09 tháng, nhóm B 06 tháng, nhóm C 04 tháng (NĐ 193 Điều 21). Lập tại tab Quyết toán.' }
  ] }
];

const ROADMAP_PURCHASE = [
  { stage: 'Chuẩn bị mua sắm', steps: [
    { title: 'Dự toán mua sắm / kinh phí được giao', kw: /du toan/,
      basis: [['LDT', 'Điều 41'], ['ND214', 'Điều 18']], hint: 'Chủ đầu tư không phải thẩm định, phê duyệt dự toán mua sắm nhưng phải xác định kinh phí (NĐ 214 Điều 18 khoản 5).' },
    { title: 'Kế hoạch lựa chọn nhà thầu', kw: /ke hoach lua chon nha thau|khlcnt/,
      basis: [['LDT', 'Điều 41'], ['LDT', 'Điều 38']], hint: 'Căn cứ gồm tiêu chuẩn, định mức sử dụng tài sản công (nếu có) và dự toán mua sắm (Điều 38 khoản 2).' },
    { title: 'Xác định giá gói thầu (báo giá, thẩm định giá)', kw: /bao gia|tham dinh gia/, check: p => pkgsOf(p).some(k => k.quoteNumber) ? 'Có yêu cầu báo giá trong gói thầu' : '',
      basis: [['ND214', 'Điều 18']], hint: 'Cần tối thiểu 01 báo giá đăng tải trên Hệ thống mạng đấu thầu quốc gia nếu căn cứ báo giá (Điều 18 khoản 2d).' }
  ] },
  { stage: 'Lựa chọn nhà thầu và thực hiện', steps: [
    { title: 'Quyết định chỉ định thầu hoặc phê duyệt kết quả lựa chọn nhà thầu', kw: /chi dinh thau|ket qua lua chon nha thau|trung thau/,
      basis: [['ND214', 'Điều 78'], ['ND214', 'Điều 79'], ['ND214', 'Điều 80']], hint: 'Gói thuộc dự toán mua sắm không hình thành dự án có giá không quá 1 tỷ đồng có thể chỉ định thầu (Điều 78 khoản 4); không quá 100 triệu đồng do Thủ trưởng quyết định, bảo đảm hóa đơn chứng từ (Điều 80 khoản 4).' },
    { title: 'Hợp đồng với nhà thầu', check: p => pkgsOf(p).some(k => hasValue(k.contract) || k.contractSignDate) ? 'Có hợp đồng trong gói thầu' : '',
      basis: [['LDT', 'Điều 66'], ['LDT', 'Điều 67']], hint: 'Hợp đồng phù hợp quyết định phê duyệt kết quả lựa chọn nhà thầu.' },
    { title: 'Nghiệm thu và thanh lý hợp đồng', check: p => pkgsOf(p).some(k => (k.acceptances || []).length || k.liquidationDate) ? 'Đã có nghiệm thu hoặc thanh lý' : '',
      basis: [['ND214', 'Điều 119'], ['ND214', 'Điều 121']], hint: 'Thanh lý hợp đồng trong 45 ngày kể từ khi hoàn thành nghĩa vụ, không quá 90 ngày với hợp đồng lớn, phức tạp (Điều 121 khoản 2).' }
  ] }
];

function pkgsOf(project) {
  return (project?.categories || []).flatMap(c => c.packages || []);
}

function roadmapStepStatus(step, project) {
  const docs = project.initiations || [];
  if (step.manual) return { state: 'manual', detail: '' };
  if (step.check) {
    const d = step.check(project);
    if (d) return { state: 'done', detail: d };
  }
  if (step.kw) {
    const hits = docs.filter(d => step.kw.test(legalFold([d.title, d.note, d.name].join(' '))));
    if (hits.length) return { state: 'done', detail: hits.map(h => h.number || h.title).slice(0, 3).join('; ') };
  }
  return { state: step.optional ? 'optional' : 'missing', detail: '' };
}

function renderLegalRoadmap() {
  const box = document.getElementById('legal-roadmap');
  if (!box) return;
  const project = getCurrentProject();
  if (!project) { box.innerHTML = ''; return; }
  const plan = project.projectScope === 'nonProject' ? ROADMAP_PURCHASE : ROADMAP_PROJECT;
  const rows = plan.map(g => ({ ...g, steps: g.steps.map(s => ({ ...s, st: roadmapStepStatus(s, project) })) }));
  const required = rows.flatMap(g => g.steps).filter(s => !s.optional && !s.manual);
  const done = required.filter(s => s.st.state === 'done').length;
  const icon = { done: ['check_circle', 'var(--accent-green)'], missing: ['radio_button_unchecked', 'var(--accent-red)'], optional: ['remove_circle_outline', 'var(--text-muted)'], manual: ['edit_note', 'var(--accent-cyan)'] };
  const label = { done: 'Đã có', missing: 'Chưa có', optional: 'Tùy trường hợp', manual: 'Thực hiện tại tab Quyết toán' };

  box.innerHTML = `
    <details class="roadmap glass-card" ${done < required.length ? 'open' : ''}>
      <summary>
        <span class="material-symbols-rounded">route</span>
        <strong>${project.projectScope === 'nonProject' ? 'Quy trình mua sắm' : 'Lộ trình hình thành dự án'} và hồ sơ pháp lý cần có</strong>
        <span class="roadmap-progress">${done}/${required.length} bước bắt buộc đã có hồ sơ</span>
      </summary>
      <p class="roadmap-note">Tự đối chiếu với văn bản đã nhập ở mục Pháp lý (theo tên văn bản) và dữ liệu gói thầu. Bấm vào căn cứ để đọc điều khoản trong thư viện pháp luật.</p>
      ${rows.map(g => `
        <div class="roadmap-stage">${esc(g.stage)}</div>
        ${g.steps.map(s => `
          <div class="roadmap-step">
            <span class="material-symbols-rounded" style="color:${icon[s.st.state][1]}">${icon[s.st.state][0]}</span>
            <div class="roadmap-body">
              <div class="roadmap-title">${esc(s.title)} <span class="roadmap-state ${s.st.state}">${label[s.st.state]}</span>
                ${s.tab ? `<a href="#" onclick="switchView('${s.tab}');return false">Mở</a>` : ''}</div>
              ${s.st.detail ? `<div class="roadmap-detail">${esc(s.st.detail)}</div>` : ''}
              <div class="roadmap-hint">${esc(s.hint)}</div>
              <div class="roadmap-basis">Căn cứ: ${s.basis.map(([d, a]) => `<a href="#" class="ai-source" onclick="openLegalRef('${d}','${a}');return false">${esc(legalDocShort(d))} · ${esc(a)}</a>`).join(' ')}</div>
            </div>
          </div>`).join('')}`).join('')}
    </details>`;
}

const LEGAL_SHORT = { LDT: 'Luật Đấu thầu', ND214: 'NĐ 214/2025', LXD: 'Luật Xây dựng', ND254: 'NĐ 254/2025', ND193: 'NĐ 193/2026', 'TT73-2026': 'TT 73/2026', 'TT36-BXD': 'TT 36/2026/BXD' };
function legalDocShort(id) { return LEGAL_SHORT[id] || id; }
