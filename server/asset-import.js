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

// Chuyển tên VIẾT HOA HẾT về dạng chữ thường đúng chuẩn (Title Case)
function toTitleCase(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/(^|[\s([/,.\-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
}
function normalizeName(s) {
  const str = String(s == null ? '' : s).trim();
  const letters = str.replace(/[^\p{L}]/gu, '');
  const uppers = str.replace(/[^\p{Lu}]/gu, '');
  if (letters.length >= 4 && uppers.length / letters.length > 0.6) return toTitleCase(str);
  return str;
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
const ROMAN_SET = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
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
  let afterTotal = false;

  const nextA = (i) => {
    for (let k = i + 1; k < rows.length; k++) {
      const a = toText((rows[k] || [])[0]);
      if (a) return a;
    }
    return '';
  };

  const usedNames = new Map();
  const uniqueName = (name) => {
    const key = (name || '').trim().toLowerCase();
    const c = (usedNames.get(key) || 0) + 1;
    usedNames.set(key, c);
    return c === 1 ? name : `${name} (${c})`;
  };

  const newProject = (name, code) => {
    name = uniqueName(normalizeName(name));
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
      source: 'asset-seed',
      initiations: [],
      categories: [],
      assets: [],
      settlementAnnual: [],
      settlement: { status: 'Chưa quyết toán', totalValue: 0, approvedDate: '' }
    };
    const cat = {
      id: 'cat-' + crypto.randomUUID(),
      code: 'MS',
      name: 'Mua sắm',
      color: CAT_COLORS[projects.length % CAT_COLORS.length],
      packages: []
    };
    p.categories.push(cat);
    p._cat = cat;
    projects.push(p);
    return p;
  };

  const newGroup = (name, supplier, amount) => {
    if (!project) project = newProject('Mua sắm tài sản', '');
    const g = {
      id: 'pkg-' + crypto.randomUUID(),
      name,
      contractor: supplier,
      pkgType: 'goods',
      pkgScope: 'nonProject',
      purchaseType: 'Mua sắm tài sản',
      bidValue: amount,
      selectionMethod: '',
      payments: [],
      assets: [],
      pdfs: []
    };
    project._cat.packages.push(g);
    return g;
  };

  const EXCLUDE = /(thuế|hoá đơn|hóa đơn|tổng cộng|tổng tiền)/i;
  const RE_TITLE_GROUP = /^(thiet bi|thang may|cung cap|phat sinh|goi thau|mua sam|he thong|sach)/;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const A = toText(cell(row, map.stt));
    const B = toText(cell(row, map.name));
    const D = toText(cell(row, map.quantity));
    const F = cell(row, map.amount);
    const nB = norm(B);
    if (!A && !B) continue;
    if (nB.startsWith('cong hoa') || nB.includes('doc lap') || nB.includes('danh muc thiet bi cac du an')) continue;
    if (nB === 'tong cong') { afterTotal = true; continue; }

    const aIsNum = /^\d+$/.test(A);
    const isRoman = RE_ROMAN_GROUP.test(B);
    const isNamed = !aIsNum && /^(goi thau|mua sam|he thong)/.test(nB) && toNum(F) > 0 && !EXCLUDE.test(B);
    const isAmountGroup = !A && !D && toNum(F) > 0 && B && nextA(i) === '1' && !EXCLUDE.test(B);
    const isTitleGroup = !A && !D && B && nextA(i) === '1' && !EXCLUDE.test(B) && RE_TITLE_GROUP.test(nB);
    const isProject = !A && RE_PROJECT.test(B) && !isRoman;

    // Dự án mới (A., B., C. ...)
    if (isProject) {
      const letter = B.match(RE_PROJECT)[1];
      const name = B.replace(RE_PROJECT, '').replace(/:$/, '').trim();
      project = newProject(name, letter);
      group = null; lastAsset = null; afterTotal = false;
      continue;
    }

    // Cụm cuối sheet: mỗi "Gói thầu ..." = 1 dự án riêng (sau mốc "Tổng cộng")
    if (isNamed && afterTotal) {
      const { name, supplier } = splitSupplier(B);
      project = newProject(name || B, '');
      group = newGroup(name || B, supplier, toNum(F));
      lastAsset = null;
      continue;
    }

    // Nửa sau sheet: ký hiệu ở CỘT A — chữ cái = dự án (G,H,M,N,O,Ô...), số La Mã = gói
    const isGroupColA = ROMAN_SET.has(A) && B;
    const isProjectColA = A && !isGroupColA && !/^\d+$/.test(A) && B;
    if (isProjectColA) {
      project = newProject(B, A);
      group = null; lastAsset = null; afterTotal = false;
      continue;
    }
    if (isGroupColA) {
      const { name, supplier } = splitSupplier(B);
      group = newGroup(name, supplier, toNum(F));
      lastAsset = null;
      continue;
    }

    // Gói thầu (nhóm) trong dự án
    if (isRoman || isNamed || isAmountGroup || isTitleGroup) {
      const raw = isRoman ? B.replace(RE_ROMAN_GROUP, '').trim() : B;
      const { name, supplier } = splitSupplier(raw);
      group = newGroup(name, supplier, toNum(F));
      lastAsset = null;
      continue;
    }

    // Tài sản
    const hasQty = isNumCell(cell(row, map.quantity));
    if (A || hasQty) {
      if (!project) project = newProject('Mua sắm tài sản', '');
      if (!group) group = newGroup(project.name, '', 0);
      const noteRaw = toText(cell(row, map.note));
      const yearRaw = map.year != null ? toText(cell(row, map.year)) : '';
      const asset = {
        id: 'asset-' + crypto.randomUUID(),
        code: '',
        stt: A,
        name: B,
        group: group.name,
        supplier: group.contractor,
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
      group.assets.push(asset);
      lastAsset = asset;
      continue;
    }

    // Dòng phụ (quy cách, phụ kiện...) -> nối vào ghi chú tài sản trước
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
    const total = (p.categories[0]?.packages || []).reduce((s, pk) => s + pk.assets.reduce((x, a) => x + (a.amount || 0), 0), 0)
      + p.assets.reduce((s, a) => s + (a.amount || 0), 0);
    p.totalInvestment = total;
  });

  return projects.filter(p => p.categories[0].packages.some(pk => (pk.assets || []).length) || p.assets.length);
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

// Kiểm tra file trước khi nhập: trả về lỗi chặn nhập, cảnh báo và thống kê
function validateWorkbook(buffer, sheetName) {
  const errors = [];
  const warnings = [];
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return { errors: ['Không đọc được file Excel: ' + err.message], warnings, stats: null, projects: [] };
  }
  const ws = pickSheet(wb, sheetName);
  if (!ws) {
    return { errors: ['Không tìm thấy sheet dữ liệu. Cần sheet tên "TB CÁC DỰ ÁN" (hoặc sheet có dòng tiêu đề STT / TÊN THIẾT BỊ).'], warnings, stats: null, projects: [] };
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' });
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) {
    return { errors: ['Không tìm thấy dòng tiêu đề. Cần có cột "STT" và cột "TÊN THIẾT BỊ" (hoặc "NHÃN HIỆU").'], warnings, stats: null, projects: [] };
  }
  const map = mapColumns(rows[headerRowIndex]);
  if (map.name == null) {
    return { errors: ['Không xác định được cột tên tài sản. Đặt tiêu đề cột là "TÊN THIẾT BỊ".'], warnings, stats: null, projects: [] };
  }
  if (map.quantity == null) warnings.push('Không thấy cột "SL" (số lượng); tài sản sẽ có số lượng 0.');
  if (map.unitPrice == null && map.amount == null) warnings.push('Không thấy cột "ĐƠN GIÁ" hoặc "THÀNH TIỀN"; giá trị tài sản sẽ bằng 0.');

  const projects = parseSheet(ws);
  if (!projects.length) {
    return { errors: ['Không đọc được dự án/tài sản nào. Kiểm tra lại bố cục: dòng dự án bắt đầu bằng "A. ", gói thầu bằng "I. ", tài sản có STT là số.'], warnings, stats: null, projects: [] };
  }

  let packages = 0;
  let assets = 0;
  let totalValue = 0;
  const assetNames = new Set();
  projects.forEach(p => {
    if (!p.name) errors.push('Có dự án không có tên.');
    if (!p.code) warnings.push(`Dự án "${p.name || '(chưa tên)'}" chưa có mã ở cột A (dạng "A. Tên dự án").`);
    const pkgs = p.categories?.[0]?.packages || [];
    packages += pkgs.length;
    if (!pkgs.length) warnings.push(`Dự án "${p.name || '(chưa tên)'}" không có gói thầu nào.`);
    pkgs.forEach(pk => {
      if (!pk.name) warnings.push(`Dự án "${p.name}": có gói thầu chưa có tên.`);
      (pk.assets || []).forEach(a => {
        assets += 1;
        const amount = Number(a.amount) || 0;
        const price = Number(a.unitPrice) || 0;
        const qty = Number(a.quantity) || 0;
        totalValue += amount;
        if (a.name) assetNames.add(norm(a.name));
        const where = `Dự án "${p.name}" / gói "${pk.name || '(chưa tên)'}" / tài sản "${a.name || '(chưa tên)'}"`;
        if (!a.name) errors.push(`${where}: thiếu tên tài sản.`);
        if (!(qty > 0)) warnings.push(`${where}: số lượng ${a.quantity} không hợp lệ.`);
        if (!a.unit) warnings.push(`${where}: thiếu đơn vị tính.`);
        if (!amount && !price) warnings.push(`${where}: chưa có đơn giá và thành tiền.`);
        else if (qty && price && amount && Math.abs(amount - qty * price) > 1) {
          warnings.push(`${where}: thành tiền (${amount}) khác SL × đơn giá (${qty * price}).`);
        }
      });
    });
  });

  // Cảnh báo các dòng trông giống tài sản nhưng không được nhận dạng
  let skippedRows = 0;
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const a = toText(cell(row, map.stt));
    const name = toText(cell(row, map.name));
    if (!a || !name || !/^\d+$/.test(a)) continue;
    if (assetNames.has(norm(name))) continue;
    skippedRows += 1;
    if (skippedRows <= 10) {
      warnings.push(`Dòng ${i + 1}: "${name}" chưa được nhận dạng là tài sản (kiểm tra cột STT/SL).`);
    }
  }
  if (skippedRows > 10) warnings.push(`Còn ${skippedRows - 10} dòng tương tự chưa được nhận dạng.`);

  return {
    errors,
    warnings,
    stats: { projects: projects.length, packages, assets, totalValue, skippedRows },
    projects
  };
}

module.exports = { parseWorkbook, validateWorkbook };
