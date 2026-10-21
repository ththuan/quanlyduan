// Kiểm tra placeholder trong templates có khớp với manifest.
// Chạy: node scripts/check-template-placeholders.js
const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'server', 'node_modules', 'xlsx'));

const root = path.join(__dirname, '..', 'templates');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const allowed = new Set();
for (const [group, fields] of Object.entries(manifest.context)) {
  for (const field of fields) allowed.add(`${group}.${field}`);
}

const found = new Map();
function scan(text, file) {
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) {
    const key = m[1].trim();
    if (!found.has(key)) found.set(key, new Set());
    found.get(key).add(file);
  }
}

for (const t of manifest.templates) {
  const file = path.join(root, t.file);
  if (!fs.existsSync(file)) {
    console.error('THIẾU FILE:', t.file);
    continue;
  }
  if (t.format === 'word') {
    scan(fs.readFileSync(file, 'utf8'), t.file);
  } else if (t.format === 'excel') {
    const wb = XLSX.readFile(file);
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      for (const addr of Object.keys(ws)) {
        if (addr[0] === '!') continue;
        const cell = ws[addr];
        if (cell && typeof cell.v === 'string') scan(cell.v, t.file + '!' + sn + '!' + addr);
      }
    }
  }
}

let ok = true;
for (const [key, files] of [...found.entries()].sort()) {
  if (!allowed.has(key)) {
    ok = false;
    console.error('PLACEHOLDER CHƯA KHAI BÁO:', key, '->', [...files].join(', '));
  }
}
console.log(`Đã quét ${manifest.templates.length} mẫu, ${found.size} placeholder.`);
if (ok) console.log('OK: tất cả placeholder đều có trong manifest.');
process.exit(ok ? 0 : 1);
