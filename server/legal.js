// Kho tri thức pháp luật: tìm kiếm BM25 trên các Điều/Mẫu biểu đã trích từ thư mục phaply/
// (dữ liệu sinh bởi scripts/build-legal-kb.py -> server/knowledge/legal-kb.json)
const fs = require('fs');
const path = require('path');

const KB_PATH = path.join(__dirname, 'knowledge', 'legal-kb.json');

const STOP = new Set(['va', 'cua', 'la', 'cho', 'cac', 'nhung', 'duoc', 'trong', 'voi', 'khi', 'de', 'co', 'khong',
  'mot', 'nay', 'do', 'tu', 'theo', 'den', 'nhu', 'the', 'nao', 'gi', 'thi', 'ma', 'hay', 'hoac', 'neu', 'phai',
  'bi', 'o', 'tai', 've', 'se', 'da', 'cung', 'nhieu', 'bao', 'nhieu', 'sao', 'ra', 'vao', 'len', 'xin', 'hoi']);

// Nhận diện văn bản được nhắc đến trong câu hỏi (trên chuỗi đã bỏ dấu, chữ thường)
const DOC_HINTS = [
  { docs: ['LDT'], re: /luat dau thau|\bldt\b|22\/2023/ },
  { docs: ['ND214'], re: /\bnd\s*214|nghi dinh\s*214|214\/2025|vbhn\s*36|\bnd\s*349|nghi dinh\s*349|349\/2026/ },
  { docs: ['TT79-2025'], re: /\btt\s*79|thong tu\s*79|79\/2025/ },
  { docs: ['TT134-2026', 'TT134-PL'], re: /\btt\s*134|thong tu\s*134|134\/2026/ },
  { docs: ['LXD'], re: /luat xay dung|135\/2025|146\/2026/ },
  { docs: ['TT36-BXD'], re: /\btt\s*36\b|thong tu\s*36\b|36\/2026\/tt|89\/2026|vbhn\s*tt/ },
  { docs: ['ND254'], re: /\bnd\s*254|nghi dinh\s*254|254\/2025/ },
  { docs: ['ND193'], re: /\bnd\s*193|nghi dinh\s*193|193\/2026/ },
  { docs: ['ND104'], re: /\bnd\s*104|nghi dinh\s*104|104\/2026/ },
  { docs: ['TT73-2026'], re: /\btt\s*73|thong tu\s*73|73\/2026|qtda/ }
];

let kb = null;
let index = null;

// Chủ đề thường gặp -> các Điều nên ưu tiên (từ khóa của người dùng thường không trùng chữ trong văn bản, vd "hạn mức" vs "không quá")
const TOPICS = [
  { re: /chi dinh thau|han muc/, boost: ['ND214:78', 'ND214:79', 'ND214:80', 'LDT:23'] },
  { re: /gia goi thau/, boost: ['ND214:18', 'LDT:39'] },
  { re: /ke hoach (lua chon )?nha thau|khlcnt/, boost: ['LDT:38', 'LDT:39', 'LDT:40', 'LDT:41', 'ND214:16', 'ND214:17'] },
  { re: /quyet toan/, boost: ['ND193:4', 'ND193:7', 'ND193:21', 'TT73-2026:3', 'TT73-2026:4'] },
  { re: /quyet toan.*(tham quyen|phe duyet)|(tham quyen|phe duyet).*quyet toan/, boost: ['ND193:8', 'ND193:19'] },
  { re: /kiem toan/, boost: ['ND193:9'] },
  { re: /thoi gian.*quyet toan|quyet toan.*thoi (gian|han)|bao lau.*quyet toan/, boost: ['ND193:21'] },
  { re: /tam ung|thanh toan|kho bac/, boost: ['ND254:8', 'ND254:9', 'ND254:10', 'ND214:118', 'ND214:119'] },
  { re: /ho so phap ly/, boost: ['ND254:8', 'ND254:18', 'ND193:7', 'ND193:12'] },
  { re: /thanh ly hop dong/, boost: ['ND214:121', 'LXD:87'] },
  { re: /bao hanh/, boost: ['LXD:64'] },
  { re: /nghiem thu|ban giao/, boost: ['LXD:57', 'LXD:58'] },
  { re: /khoi cong|giay phep xay dung/, boost: ['LXD:48', 'LXD:43', 'LXD:44'] },
  { re: /kinh te.{0,3}ky thuat|bcnckt|nghien cuu kha thi|lap du an/, boost: ['LXD:23', 'LXD:24', 'LXD:25', 'LXD:26', 'LXD:28'] },
  { re: /tong muc dau tu/, boost: ['TT36-BXD:3', 'TT36-BXD:4', 'TT36-BXD:5', 'LXD:75'] },
  { re: /du toan/, boost: ['TT36-BXD:6', 'TT36-BXD:7', 'TT36-BXD:8', 'LXD:76', 'LDT:41'] },
  { re: /mua sam truc tiep|100 trieu/, boost: ['ND214:80', 'ND214:82', 'LDT:25'] },
  { re: /chao hang canh tranh/, boost: ['ND214:81', 'LDT:24'] },
  { re: /dau thau rong rai/, boost: ['LDT:21'] },
  { re: /dieu chinh hop dong|sua doi hop dong|phat sinh/, boost: ['LDT:70', 'ND214:114', 'ND214:115', 'LXD:84'] },
  { re: /hop dong xay dung/, boost: ['LXD:80', 'LXD:81', 'LXD:82', 'LXD:87'] },
  { re: /dang tai|mang dau thau|e-?gp|thong tin dau thau/, boost: ['TT79-2025:13', 'TT79-2025:17', 'TT79-2025:20', 'LDT:7', 'LDT:8'] },
  { re: /bao dam thuc hien hop dong/, boost: ['LDT:68'] },
  { re: /trinh tu dau tu|giai doan.*du an/, boost: ['LXD:16'] },
  { re: /nhom (a|b|c)\b|phan loai du an/, boost: ['LXD:17'] },
  { re: /kiem tra.*dau thau|kiem tra hoat dong dau thau/, boost: ['ND214:122', 'ND214:125', 'ND214:126', 'ND214:129'] },
  { re: /du toan mua sam/, boost: ['LDT:41', 'ND214:18'] },
  { re: /mau.*chi dinh thau|ho so yeu cau/, boost: ['TT134-2026:2'] },
  { re: /du toan chi thuong xuyen|mua sam thuong xuyen|co so du toan|lap du toan|chi thuong xuyen/, boost: ['ND104:4', 'ND104:7', 'ND104:8', 'ND104:9'] },
  { re: /mua sam.*sua chua|sua chua.*mua sam|mua sam tai san|trang thiet bi/, boost: ['ND104:17', 'ND104:18', 'ND104:19'] }
];

function topicBoosts(q) {
  const map = new Map();
  for (const t of TOPICS) {
    if (!t.re.test(q)) continue;
    t.boost.forEach(k => map.set(k, 25));
  }
  return map;
}

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

function tokenize(s) {
  return fold(s).split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

function load() {
  if (kb) return kb;
  try {
    kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  } catch (err) {
    console.warn('Không đọc được kho pháp luật:', err.message);
    kb = { documents: [], chunks: [] };
  }
  const docById = new Map(kb.documents.map(d => [d.id, d]));
  const df = new Map();
  let totalLen = 0;
  const items = kb.chunks.map(c => {
    const body = tokenize(c.text);
    const head = new Set(tokenize(c.heading + ' ' + (c.chapter || '')));
    const tf = new Map();
    body.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
    new Set([...tf.keys(), ...head]).forEach(t => df.set(t, (df.get(t) || 0) + 1));
    totalLen += body.length;
    return { c, tf, head, len: body.length, ntext: ' ' + body.join(' ') + ' ', article: fold(c.article) };
  });
  index = { items, df, avg: totalLen / Math.max(items.length, 1), docById, byId: new Map(kb.chunks.map(c => [c.id, c])) };
  return kb;
}

function docShort(id) {
  return index.docById.get(id)?.short || id;
}

function bestSnippet(text, terms) {
  const paras = text.split('\n');
  let best = paras[0] || '', bestScore = -1;
  paras.forEach(p => {
    const f = fold(p);
    const score = terms.reduce((s, t) => s + (f.includes(t) ? 1 : 0), 0);
    if (score > bestScore && p.length > 25) { best = p; bestScore = score; }
  });
  return best.length > 320 ? best.slice(0, 320) + '…' : best;
}

function search(query, { limit = 8, docs = null } = {}) {
  load();
  const q = fold(query);
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];

  const hinted = new Set();
  DOC_HINTS.forEach(h => { if (h.re.test(q)) h.docs.forEach(d => hinted.add(d)); });
  const articles = [...q.matchAll(/dieu\s+(\d+[a-z]?)(?![0-9])/g)].map(m => 'dieu ' + m[1]);
  const seq = tokenize(query);
  const bigrams = [];
  for (let i = 0; i + 1 < seq.length; i++) bigrams.push(seq[i] + ' ' + seq[i + 1]);

  const k1 = 1.2, b = 0.75, N = index.items.length;
  const topics = topicBoosts(q);
  const scored = [];
  for (const it of index.items) {
    if (docs && !docs.includes(it.c.doc)) continue;
    let s = 0;
    for (const t of terms) {
      const n = index.df.get(t) || 0;
      if (!n) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const tf = it.tf.get(t) || 0;
      if (tf) s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * it.len / index.avg));
      if (it.head.has(t)) s += 2.5 * idf;
    }
    const artNo = it.article.match(/^dieu (\d+[a-z]?)/)?.[1];
    if (artNo && topics.has(`${it.c.doc}:${artNo}`)) s += topics.get(`${it.c.doc}:${artNo}`);
    if (s <= 0) continue;
    let bg = 0;
    for (const g of bigrams) if (it.ntext.includes(' ' + g + ' ')) bg++;
    s += Math.min(bg, 6) * 1.5;
    const docHit = hinted.has(it.c.doc);
    if (articles.length && articles.some(a => it.article === a || it.article.startsWith(a + ' '))) s += docHit ? 14 : (hinted.size ? 3 : 6);
    if (docHit) s *= 1.8;
    if (it.c.repealed) s *= 0.4;
    scored.push({ it, s });
  }
  scored.sort((a, b2) => b2.s - a.s);
  return scored.slice(0, limit).map(({ it, s }) => ({
    id: it.c.id, doc: it.c.doc, docShort: docShort(it.c.doc), article: baseArticle(it.c.article), heading: baseArticle(it.c.heading),
    chapter: it.c.chapter, repealed: it.c.repealed || '', score: Math.round(s * 10) / 10,
    snippet: bestSnippet(it.c.text, terms)
  }));
}

function baseArticle(a) {
  return String(a || '').replace(/ \(phần \d+\/\d+\)$/, '');
}

function getDocuments() {
  load();
  return kb.documents.map(d => ({ ...d }));
}

// Mục lục theo Điều/Mẫu (gộp các phần của cùng một Điều)
function getOutline(docId) {
  load();
  const seen = new Set();
  const out = [];
  for (const c of kb.chunks) {
    if (c.doc !== docId) continue;
    const article = baseArticle(c.article);
    if (seen.has(article)) continue;
    seen.add(article);
    out.push({ article, heading: baseArticle(c.heading), chapter: c.chapter, repealed: c.repealed || '' });
  }
  return out;
}

// Toàn văn một Điều/Mẫu (nối các phần)
function getArticle(docId, article) {
  load();
  const base = baseArticle(article);
  const parts = kb.chunks.filter(c => c.doc === docId && baseArticle(c.article) === base);
  if (!parts.length) return null;
  const doc = index.docById.get(docId);
  return {
    doc: docId, docShort: doc?.short || docId, docNumber: doc?.number || '', docTitle: doc?.title || '',
    effectiveDate: doc?.effectiveDate || '',
    article: base, heading: baseArticle(parts[0].heading), chapter: parts[0].chapter,
    repealed: parts[0].repealed || '', text: parts.map(p => p.text).join('\n')
  };
}

// Ngữ cảnh pháp lý đưa vào prompt của chatbot kèm danh sách nguồn để hiển thị
function buildContext(query, { limit = 7, maxChars = 16000 } = {}) {
  const hits = search(query, { limit });
  let used = 0;
  const blocks = [];
  const sources = [];
  for (const h of hits) {
    const chunk = index.byId.get(h.id);
    let text = chunk.text.length > 3600 ? chunk.text.slice(0, 3600) + ' …' : chunk.text;
    if (used + text.length > maxChars) text = text.slice(0, Math.max(0, maxChars - used));
    if (!text) break;
    used += text.length;
    const doc = index.docById.get(h.doc);
    const flag = h.repealed ? ` [ĐÃ HẾT HIỆU LỰC: ${h.repealed}]` : '';
    blocks.push(`[Nguồn ${blocks.length + 1}] ${doc?.short || h.doc} (${doc?.number || ''}) — ${h.heading}${flag}\n${text}`);
    sources.push({ id: h.id, doc: h.doc, docShort: doc?.short || h.doc, article: h.article, heading: h.heading, repealed: h.repealed });
  }
  const uniq = new Map(sources.map(s => [s.doc + '|' + s.article, s]));
  return { text: blocks.join('\n\n'), sources: [...uniq.values()] };
}

module.exports = { search, getDocuments, getOutline, getArticle, buildContext, load };
