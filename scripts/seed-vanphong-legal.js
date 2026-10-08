// Sinh các file Markdown văn bản pháp luật từ legal-kb.json để seed kho tri thức VAN-PHONG-AI.
// Chạy: node scripts/seed-vanphong-legal.js
const fs = require('fs');
const path = require('path');

const KB = path.join(__dirname, '..', 'server', 'knowledge', 'legal-kb.json');
const OUT = path.join(__dirname, '..', 'VAN-PHONG-AI', 'seed-legal');

const kb = JSON.parse(fs.readFileSync(KB, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const byDoc = new Map();
for (const c of kb.chunks) {
  if (!byDoc.has(c.doc)) byDoc.set(c.doc, []);
  byDoc.get(c.doc).push(c);
}

let count = 0;
for (const [docId, chunks] of byDoc) {
  const doc = kb.documents.find(d => d.id === docId);
  const title = doc ? `${doc.type || 'Văn bản'} ${doc.number || ''} — ${doc.title || doc.short || docId}` : docId;
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  if (doc) {
    lines.push(`- Số hiệu: ${doc.number || '—'}`);
    lines.push(`- Ban hành: ${doc.issueDate || '—'}`);
    lines.push(`- Hiệu lực: ${doc.effectiveDate || '—'}`);
    if (doc.group) lines.push(`- Nhóm: ${doc.group}`);
    if (doc.summary) lines.push(`- Tóm tắt: ${doc.summary}`);
    lines.push('');
  }
  for (const c of chunks) {
    const heading = c.heading || c.article || '';
    lines.push(`## ${c.article}${heading && heading !== c.article ? ' — ' + heading : ''}`);
    lines.push('');
    lines.push((c.text || '').trim());
    lines.push('');
  }
  const name = String(docId).replace(/[^a-zA-Z0-9_-]/g, '-') + '.md';
  fs.writeFileSync(path.join(OUT, name), lines.join('\n'), 'utf8');
  count++;
}

console.log('Đã sinh ' + count + ' file Markdown vào ' + OUT);
