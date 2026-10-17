'use strict';

// ============================================================
// Import danh mục tài sản từ Excel "BÁO CÁO TĂNG TÀI SẢN ... " — sheet "TB CÁC DỰ ÁN"
// Phân cấp: A/B/C... = DỰ ÁN ; I/II/III... = GÓI THẦU (nhóm, có nhà thầu) ; dòng STT = TÀI SẢN
// ============================================================

const XLSX = require('xlsx');
const crypto = require('node:crypto');

const CAT_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#6b7280'];

function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function toText(v) {
  if (v == null) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (s === '-' || s === '–' || s === '—') return '';
  return s;
}

function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function isNumCell(v) {
  if (typeof v === 'number') return isFinite(v);
  const s = String(v == null ? '' : v).replace(/[.,\s]/g, '');
  return s !== '' && /^-?\d+$/.test(s);
}

function extractYear(text) {
  const m = String(text || '').match(/(19|20)\d{2}/);
  return m ? m[0] : '';
}

// Header: STT | THIẾT BỊ (nhãn hiệu, quy cách) | ĐVT | SL | ĐƠN GIÁ | THÀNH TIỀN | ĐẶT Ở | GHI CHÚ
function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] || []).map(norm);
    const hasStt = r.some(c => c === 'stt');
    const hasName = r.some(c => c.includes('thiet bi') || c.includes('ten thiet bi') || c.includes('nhan hieu'));
    if (hasStt && hasName) return i;
  }
  return -1;
}

function mapColumns(headerRow) {
  const map = {};
  headerRow.forEach((raw, c) => {
    const h = norm(raw);
    if (!h) return;
    if (map.stt == null && h === 'stt') map.stt = c;
    else if (map.name == null && (h.includes('thiet bi') || h.includes('ten thiet bi') || h.includes('nhan hieu'))) map.name = c;
    else if (map.unit == null && (h === 'dvt' || h.includes('don vi tinh'))) map.unit = c;
    else if (map.quantity == null && (h === 'sl' || h.includes('so luong'))) map.quantity = c;
    else if (map.unitPrice == null && h.includes('don gia')) map.unitPrice = c;
    else if (map.amount == null && h.includes('thanh tien')) map.amount = c;
    else if (map.location == null && h.includes('dat o')) map.location = c;
    else if (map.note == null && h.includes('ghi chu')) map.note = c;
    else if (map.year == null && h.includes('nam dua vao')) map.year = c;
  });
  return map;
}

const RE_ROMAN_GROUP = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+/;
const RE_PROJECT = /^([A-Z])\.\s+/;

function splitSupplier(title) {
  // Nhà thầu thường ở cuối tên nhóm sau dấu "-"
  const m = title.match(/^(.*?)\s*[-–]\s*([^-–]+)$/);
  if (m) return { name: m[1].trim(), supplier: m[2].trim() };
  return { name: title.trim(), supplier: '' };
}

function cell(row, idx) {
  return idx != null && row[idx] != null ? row[idx] : '';
}

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' });
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) return [];
  const map = mapColumns(rows[headerRowIndex]);
  if (map.name == null) return [];

  const projects = [];
  let project = null;
  let group = null;
  let lastAsset = null;

  const newProject = (name, code) => {
    const p = {
      id: 'proj-' + crypto.randomUUID(),
      name,
      fullName: name,
      code,
      owner: '',
      location: '',
      totalInvestment: 0,
      projectScope: 'nonProject',
      purchaseType: 'Mua sắm tài sản',
      initiations: [],
      categories: [],
      assets: [],
      settlementAnnual: [],
      settlement: { status: 'Chưa quyết toán', totalValue: 0, approvedDate: '' }
    };
    const cat = {
      id: 'cat-' + crypto.randomUUID(),
      code: 'TB',
      name: 'Thiết bị mua sắm',
      color: CAT_COLORS[projects.length % CAT_COLORS.length],
      packages: []
    };
    p.categories.push(cat);
    p._cat = cat;
    projects.push(p);
    return p;
  };

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const A = toText(cell(row, map.stt));
    const B = toText(cell(row, map.name));
    const nB = norm(B);
    if (!A && !B) continue;
    if (nB.includes('tong cong')) break;
    if (nB.startsWith('cong hoa') || nB.includes('doc lap') || nB.includes('danh muc thiet bi cac du an')) continue;

    // Gói thầu (nhóm) — ưu tiên kiểm tra trước để không nhầm C./D. là dự án
    if (!A && RE_ROMAN_GROUP.test(B)) {
      const raw = B.replace(RE_ROMAN_GROUP, '').trim();
      const { name, supplier } = splitSupplier(raw);
      group = {
        id: 'pkg-' + crypto.randomUUID(),
        name,
        contractor: supplier,
        pkgType: 'goods',
        pkgScope: 'nonProject',
        purchaseType: 'Mua sắm tài sản',
        bidValue: toNum(cell(row, map.amount)),
        selectionMethod: '',
        payments: [],
        assets: [],
        pdfs: []
      };
      if (!project) project = newProject('Dự án mua sắm tài sản', '');
      project._cat.packages.push(group);
      lastAsset = null;
      continue;
    }

    // Dự án
    if (!A && RE_PROJECT.test(B)) {
      const letter = B.match(RE_PROJECT)[1];
      const name = B.replace(RE_PROJECT, '').replace(/:$/, '').trim();
      project = newProject(name, letter);
      group = null;
      lastAsset = null;
      continue;
    }

    // Tài sản: có STT (kể cả dạng text) hoặc có SL
    const hasQty = isNumCell(cell(row, map.quantity));
    if (A || hasQty) {
      if (!project) project = newProject('Dự án mua sắm tài sản', '');
      const noteRaw = toText(cell(row, map.note));
      const yearRaw = map.year != null ? toText(cell(row, map.year)) : '';
      const asset = {
        id: 'asset-' + crypto.randomUUID(),
        code: '',
        stt: A,
        name: B,
        group: group ? group.name : '',
        supplier: group ? group.contractor : '',
        unit: toText(cell(row, map.unit)),
        quantity: toNum(cell(row, map.quantity)),
        unitPrice: toNum(cell(row, map.unitPrice)),
        amount: toNum(cell(row, map.amount)),
        location: toText(cell(row, map.location)),
        year: yearRaw || extractYear(noteRaw),
        note: noteRaw,
        status: 'Đang sử dụng'
      };
      if (!asset.amount && asset.quantity && asset.unitPrice) asset.amount = Math.round(asset.quantity * asset.unitPrice);
      if (group) group.assets.push(asset);
      else project.assets.push(asset);
      lastAsset = asset;
      continue;
    }

    // Dòng phụ (quy cách, phụ kiện, địa điểm...) -> nối vào ghi chú tài sản trước
    if (B && lastAsset) {
      lastAsset.note = (lastAsset.note ? lastAsset.note + '; ' : '') + B;
    }
  }

  // Sinh mã tài sản & tổng hợp (tài sản nằm trong từng gói thầu)
  projects.forEach(p => {
    delete p._cat;
    const prefix = p.code || 'TS';
    let n = 0;
    (p.categories[0]?.packages || []).forEach(pk => {
      pk.assets = pk.assets || [];
      pk.assets.forEach(a => {
        n += 1;
        a.code = `${prefix}-${String(n).padStart(4, '0')}`;
        a.projectId = p.id;
        a.packageId = pk.id;
      });
      if (!pk.bidValue) pk.bidValue = pk.assets.reduce((s, a) => s + (a.amount || 0), 0);
    });
    p.assets = p.assets || [];
    p.assets.forEach((a, idx) => { a.code = `${prefix}-X${String(idx + 1).padStart(3, '0')}`; a.projectId = p.id; });
    const total = (p.categories[0]?.packages || []).reduce((s, pk) => s + pk.assets.reduce((x, a) => x + (a.amount || 0), 0), 0)
      + p.assets.reduce((s, a) => s + (a.amount || 0), 0);
    p.totalInvestment = total;
  });

  return projects.filter(p => p.assets.length || p.categories[0].packages.length);
}

function pickSheet(wb, sheetName) {
  if (sheetName && wb.Sheets[sheetName]) return wb.Sheets[sheetName];
  const prefer = wb.SheetNames.find(n => norm(n).includes('tb cac du an'));
  if (prefer) return wb.Sheets[prefer];
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n];
    if (ws && findHeaderRow(XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })) >= 0) return ws;
  }
  return null;
}

function parseWorkbook(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = pickSheet(wb, sheetName);
  if (!ws) return null;
  const projects = parseSheet(ws);
  return projects.length ? projects : null;
}

module.exports = { parseWorkbook };
