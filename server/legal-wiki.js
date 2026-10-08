// Kho tri thức pháp luật tự học (Karpathy's LLM Wiki pattern — phiên bản web)
// Tầng wiki nằm trên tầng nguồn thô (legal-kb.json):
//   - entries: trang khái niệm / câu hỏi-đáp do AI đề xuất, con người duyệt.
//   - sources[]: truy vết về văn bản + điều khoản gốc.
//   - links[]: liên kết chéo giữa các mục (wikilink).
//   - ingestedDocs: đánh dấu văn bản pháp luật nào đã được "ingest" (tóm tắt) để không làm lại.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lưu vào thư mục data (mounted volume) để tồn tại qua các lần rebuild container
const DATA_DIR = path.join(__dirname, 'data');
const WIKI_PATH = path.join(DATA_DIR, 'legal-wiki.json');

const STOP = new Set(['va', 'cua', 'la', 'cho', 'cac', 'nhung', 'duoc', 'trong', 'voi', 'khi', 'de', 'co', 'khong',
  'mot', 'nay', 'do', 'tu', 'theo', 'den', 'nhu', 'the', 'nao', 'gi', 'thi', 'ma', 'hay', 'hoac', 'neu', 'phai',
  'bi', 'o', 'tai', 've', 'se', 'da', 'cung', 'nhieu', 'bao', 'nhieu', 'sao', 'ra', 'vao', 'len', 'xin', 'hoi',
  'luat', 'nghi', 'dinh', 'thong', 'tu']);

let store = null;

function emptyStore() {
  return { entries: [], ingestedDocs: {} };
}

function load() {
  if (store) return store;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    store = JSON.parse(fs.readFileSync(WIKI_PATH, 'utf8'));
    if (!Array.isArray(store.entries)) store.entries = [];
    if (!store.ingestedDocs || typeof store.ingestedDocs !== 'object') store.ingestedDocs = {};
  } catch (err) {
    store = emptyStore();
  }
  return store;
}

function save() {
  load();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WIKI_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function tokenize(s) {
  return fold(s).split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function list(status) {
  load();
  if (status === 'pending' || status === 'approved') {
    return store.entries.filter(e => e.status === status);
  }
  return store.entries;
}

function get(id) {
  load();
  return store.entries.find(e => e.id === id);
}

function add({ type, title, content, sources, links }) {
  load();
  const entry = {
    id: newId(),
    type: type || 'concept',
    title: String(title || '').trim(),
    content: String(content || '').trim(),
    sources: Array.isArray(sources) ? sources : [],
    links: Array.isArray(links) ? links : [],
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.entries.unshift(entry);
  save();
  return entry;
}

function approve(id) {
  load();
  const e = store.entries.find(x => x.id === id);
  if (e) { e.status = 'approved'; e.updatedAt = new Date().toISOString(); save(); }
  return e;
}

function reject(id) {
  load();
  store.entries = store.entries.filter(x => x.id !== id);
  save();
}

function search(query, limit = 8) {
  load();
  const terms = tokenize(query);
  const q = fold(query);
  const pool = store.entries.filter(e => e.status === 'approved');
  if (!terms.length) return pool.slice(0, limit);
  const scored = pool.map(e => {
    const hay = fold(e.title + ' ' + e.content);
    let score = 0;
    terms.forEach(t => { if (hay.includes(t)) score++; });
    if (fold(e.title).includes(q)) score += 5;
    return { e, score };
  })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.e);
  return scored;
}

function context(query, limit = 5, maxChars = 6000) {
  const entries = search(query, limit);
  const text = entries.map(e => {
    const src = (e.sources || []).map(s => s.doc + (s.article ? ' Điều ' + s.article : '')).join(', ');
    return 'MỤC KHOA TRI THỨC: ' + e.title + '\n' + e.content + (src ? '\nNguồn: ' + src : '');
  }).join('\n\n');
  return { entries, text: text.slice(0, maxChars) };
}

function graph() {
  load();
  const nodes = store.entries.map(e => ({
    id: e.id,
    label: e.title,
    type: e.type,
    status: e.status,
    sources: (e.sources || []).map(s => s.doc)
  }));
  const ids = new Set(nodes.map(n => n.id));
  const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const seen = new Set();
  const edges = [];
  const addEdge = (a, b, kind) => {
    if (!ids.has(a) || !ids.has(b) || a === b) return;
    const k = edgeKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ from: a, to: b, kind });
  };
  // Liên kết tường minh ([[wikilink]])
  store.entries.forEach(e => (e.links || []).forEach(l => addEdge(e.id, l, 'link')));
  // Liên kết chung nguồn văn bản (source overlap)
  const bySource = {};
  store.entries.forEach(e => (e.sources || []).forEach(s => {
    if (!s || !s.doc) return;
    (bySource[s.doc] = bySource[s.doc] || []).push(e.id);
  }));
  Object.values(bySource).forEach(arr => {
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addEdge(arr[i], arr[j], 'shared');
  });
  return { nodes, edges };
}

function getIngestedDocs() {
  load();
  return store.ingestedDocs;
}

function markIngested(docId, hash) {
  load();
  store.ingestedDocs[docId] = hash;
  save();
}

function countByStatus() {
  load();
  const r = { pending: 0, approved: 0, total: store.entries.length };
  store.entries.forEach(e => { r[e.status] = (r[e.status] || 0) + 1; });
  return r;
}

module.exports = { load, save, list, get, add, approve, reject, search, context, graph, getIngestedDocs, markIngested, countByStatus };
