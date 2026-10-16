'use strict';

// ============================================================
// Import dự án từ Excel theo mẫu "TÌNH HÌNH THỰC HIỆN DỰ ÁN"
// (giống file TONG HOP DU AN.xlsx, sheet chi tiết 1 dự án)
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
  const s = String(v).trim();
  if (s === '-' || s === '–' || s === '—') return '';
  return s;
}

function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// "827/BBNT ngày 30/11/2022" -> "2022-11-30"
function parseDateVN(text) {
  const m = String(text || '').match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})/);
  if (!m) return '';
  const d = String(m[1]).padStart(2, '0');
  const mo = String(m[2]).padStart(2, '0');
  return `${m[3]}-${mo}-${d}`;
}

function findHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] || []).map(norm);
    const hasName = r.some(c => c.includes('ten hang muc') || c.includes('ten goi thau'));
    const hasContractor = r.some(c => c.includes('don vi trung thau'));
    if (hasName && hasContractor) return i;
  }
  return -1;
}

function mapColumns(headerRow, subHeaderRow) {
  const map = {};
  const n = Math.max(headerRow.length, subHeaderRow ? subHeaderRow.length : 0);
  for (let c = 0; c < n; c++) {
    const raw = (subHeaderRow && subHeaderRow[c] && String(subHeaderRow[c]).trim()) ? subHeaderRow[c] : headerRow[c];
    const h = norm(raw);
    if (!h) continue;
    if (map.tt == null && (h === 'tt' || h.startsWith('tt '))) map.tt = c;
    else if (map.name == null && (h.includes('ten hang muc') || h.includes('ten goi thau'))) map.name = c;
    else if (map.investValue == null && h.includes('theo tong muc dau tu')) map.investValue = c;
    else if (map.estimateValue == null && h.includes('du toan')) map.estimateValue = c;
    else if (map.bidDecision == null && (h.includes('qd trung thau') || h.includes('quyet dinh trung thau') || h.includes('trung thau so'))) map.bidDecision = c;
    else if (map.contract == null && h.includes('hop dong')) map.contract = c;
    else if (map.selectionMethod == null && h.includes('hinh thuc')) map.selectionMethod = c;
    else if (map.contractor == null && h.includes('don vi trung thau')) map.contractor = c;
    else if (map.duration == null && (h.includes('thoi gian kc') || h.includes('thoi gian thuc hien'))) map.duration = c;
    else if (map.bidValue == null && h.includes('gia tri trung thau')) map.bidValue = c;
    else if (map.fundSource == null && h.includes('nguon von')) map.fundSource = c;
    else if (map.progress == null && h.includes('tien do')) map.progress = c;
    else if (map.cumulativeValue == null && h.includes('luy ke gia tri')) map.cumulativeValue = c;
    else if (map.cumulativeDisbursed == null && h.includes('luy ke giai ngan')) map.cumulativeDisbursed = c;
    else if (map.acceptanceValue == null && h.includes('gia tri nghiem thu')) map.acceptanceValue = c;
    else if (map.acceptanceRecord == null && h.includes('bien ban nghiem thu')) map.acceptanceRecord = c;
    else if (map.loss == null && (h.includes('that thoat') || h.includes('lang phi'))) map.loss = c;
    else if (map.expectedCompletion == null && h.includes('du kien thoi gian')) map.expectedCompletion = c;
    else if (map.notes == null && h.includes('ghi chu')) map.notes = c;
    else if (map.periodValue == null && h.includes('gia tri thuc hien') && !h.includes('luy ke')) map.periodValue = c;
    else if (map.periodDisbursed == null && (h === 'giai ngan' || h.endsWith('giai ngan')) && !h.includes('luy ke')) map.periodDisbursed = c;
  }
  return map;
}

function cell(row, idx) {
  return idx != null && row[idx] != null ? row[idx] : '';
}

function buildPackage(row, map) {
  const name = toText(cell(row, map.name));
  const progressRaw = toNum(cell(row, map.progress));
  const progress = progressRaw > 0 && progressRaw <= 1 ? Math.round(progressRaw * 100) : Math.round(progressRaw);
  const acceptanceValue = toNum(cell(row, map.acceptanceValue));
  const acceptanceRecord = toText(cell(row, map.acceptanceRecord));
  return {
    id: 'pkg-' + crypto.randomUUID(),
    name,
    investValue: toNum(cell(row, map.investValue)),
    estimateValue: toNum(cell(row, map.estimateValue)),
    bidDecision: toText(cell(row, map.bidDecision)),
    contract: toText(cell(row, map.contract)),
    selectionMethod: toText(cell(row, map.selectionMethod)),
    contractor: toText(cell(row, map.contractor)),
    duration: toText(cell(row, map.duration)),
    bidValue: toNum(cell(row, map.bidValue)),
    fundSource: toText(cell(row, map.fundSource)),
    progress,
    periodValue: toNum(cell(row, map.periodValue)),
    periodDisbursed: toNum(cell(row, map.periodDisbursed)),
    cumulativeValue: toNum(cell(row, map.cumulativeValue)),
    cumulativeDisbursed: toNum(cell(row, map.cumulativeDisbursed)),
    loss: toNum(cell(row, map.loss)),
    expectedCompletion: toText(cell(row, map.expectedCompletion)),
    acceptanceRecord,
    acceptanceValue,
    acceptanceStatus: acceptanceValue > 0 ? 'Đã nghiệm thu' : 'Chưa nghiệm thu',
    acceptanceDate: parseDateVN(acceptanceRecord),
    notes: toText(cell(row, map.notes)),
    pdfs: []
  };
}

function headerValue(rows, labelNorm) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      if (norm(r[c]).includes(labelNorm)) {
        for (let k = c + 1; k < r.length; k++) {
          if (r[k] !== '' && r[k] != null) return r[k];
        }
        return '';
      }
    }
  }
  return '';
}

function extractLabeled(rows, labelNorm) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) {
      const cellText = String(r[c] == null ? '' : r[c]);
      if (norm(cellText).includes(labelNorm)) {
        const idx = cellText.indexOf(':');
        if (idx >= 0) {
          const after = cellText.slice(idx + 1).trim();
          if (after) return after;
        }
        // giá trị có thể ở ô bên phải
        for (let k = c + 1; k < r.length; k++) {
          if (r[k] !== '' && r[k] != null) return String(r[k]).trim();
        }
      }
    }
  }
  return '';
}

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' });
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) return null;
  const headerRow = rows[headerRowIndex];
  const subHeaderRow = rows[headerRowIndex + 1] || [];
  const map = mapColumns(headerRow, subHeaderRow);
  if (map.name == null) return null;

  const name = extractLabeled(rows, 'ten du an');
  if (!name) return null;

  const project = {
    id: 'proj-' + crypto.randomUUID(),
    name,
    fullName: name,
    owner: extractLabeled(rows, 'chu dau tu'),
    location: extractLabeled(rows, 'dia diem'),
    totalInvestment: toNum(headerValue(rows, 'tong muc dau tu')),
    annualPlan: toNum(headerValue(rows, 'ke hoach von trong nam')),
    cumulativePlan: toNum(headerValue(rows, 'luy ke ke hoach von')),
    projectScope: 'project',
    initiations: [],
    categories: [],
    settlementAnnual: [],
    settlement: { status: 'Chưa quyết toán', totalValue: 0, approvedDate: '' }
  };

  // Gom các dòng dữ liệu (bỏ sub-header, tổng cộng, chữ ký...)
  const dataRows = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const tt = toText(cell(row, map.tt));
    const rowName = toText(cell(row, map.name));
    const nName = norm(rowName);
    const nTt = norm(tt);
    if (nName.includes('tong cong') || nTt.includes('tong cong')) break; // hết bảng dữ liệu
    if (!tt && !rowName) continue;
    if (nName.includes('hieu truong') || nName.includes('can tho') || nName.includes('trieu dong')) continue;
    if (nTt.includes('hieu truong') || nTt.includes('trieu dong')) continue;
    dataRows.push({ tt, name: rowName, row });
  }

  let currentCat = null;
  const catHasSub = [];
  dataRows.forEach(item => {
    const isCat = /^[IVXLC]+$/i.test(item.tt) && item.name;
    if (isCat) {
      currentCat = { id: 'cat-' + crypto.randomUUID(), code: item.tt, name: item.name, color: CAT_COLORS[project.categories.length % CAT_COLORS.length], packages: [], _catRow: item.row, _hasSub: false };
      project.categories.push(currentCat);
    } else if (item.name && currentCat) {
      currentCat._hasSub = true;
      currentCat.packages.push(buildPackage(item.row, map));
    }
  });

  // Danh mục không có dòng con -> chính nó là gói thầu
  project.categories.forEach(cat => {
    if (!cat._hasSub && cat._catRow) {
      const pkg = buildPackage(cat._catRow, map);
      if (!pkg.name) pkg.name = cat.name;
      cat.packages.push(pkg);
    }
    delete cat._catRow;
    delete cat._hasSub;
  });

  return project;
}

// Chọn sheet chi tiết dự án (có header 'Tên hạng mục/Gói thầu' + tên dự án)
function parseWorkbook(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const names = sheetName ? [sheetName] : wb.SheetNames;
  for (const nm of names) {
    const ws = wb.Sheets[nm];
    if (!ws) continue;
    const project = parseSheet(ws);
    if (project && project.categories.length) return project;
  }
  return null;
}

module.exports = { parseWorkbook };
