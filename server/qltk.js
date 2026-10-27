/* ============================================================
   QLDA - Kết nối phần mềm Quản lý tài sản (QLTS)
   QLTS API: https://quanlytaisanctec.dpdns.org/api
   Cấu hình qua biến môi trường: QLTS_API_URL, QLTS_USERNAME, QLTS_PASSWORD
   ============================================================ */
'use strict';

const BASE_URL = (process.env.QLTS_API_URL || 'https://quanlytaisanctec.dpdns.org/api').replace(/\/+$/, '');
const USERNAME = process.env.QLTS_USERNAME || '';
const PASSWORD = process.env.QLTS_PASSWORD || '';
const CACHE_TTL = 10 * 60 * 1000;

let auth = null;
let authPromise = null;
let optionsCache = null;

function isConfigured() {
  return !!(USERNAME && PASSWORD);
}

async function raw(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await res.text();
  let json = {};
  if (text) { try { json = JSON.parse(text); } catch { json = {}; } }
  if (!res.ok) {
    const err = new Error(json.message || json.error || `QLTS trả về HTTP ${res.status}`);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

function extractTokens(json) {
  const d = json && json.data && typeof json.data === 'object' ? json.data : json;
  return {
    access: d?.accessToken || d?.access_token || d?.token || json?.accessToken || json?.token || '',
    refresh: d?.refreshToken || d?.refresh_token || json?.refreshToken || ''
  };
}

async function login(force) {
  if (!isConfigured()) throw new Error('Chưa cấu hình tài khoản QLTS (QLTS_USERNAME / QLTS_PASSWORD)');
  if (!force && auth && auth.token && Date.now() - auth.at < CACHE_TTL) return auth.token;
  if (!force && authPromise) return authPromise;
  authPromise = (async () => {
    const json = await raw('/auth/login', {
      method: 'POST',
      body: { username: USERNAME, password: PASSWORD }
    });
    if (json.requires_2fa || json.data?.requires_2fa) {
      throw new Error('Tài khoản QLTS đang bật 2FA. Vui lòng dùng tài khoản dịch vụ không bật 2FA.');
    }
    const { access, refresh } = extractTokens(json);
    if (!access) throw new Error('Đăng nhập QLTS không trả về access token');
    auth = { token: access, refresh, at: Date.now() };
    return access;
  })();
  try {
    return await authPromise;
  } finally {
    authPromise = null;
  }
}

async function request(path, opts = {}) {
  let token = await login();
  try {
    return await raw(path, { ...opts, token });
  } catch (err) {
    if (err.status !== 401) throw err;
    auth = null;
    token = await login(true);
    return raw(path, { ...opts, token });
  }
}

function listFrom(json) {
  const d = json && json.data !== undefined ? json.data : json;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}

function fold(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

async function getOptions() {
  if (!isConfigured()) return { departments: [], categories: [] };
  if (optionsCache && Date.now() - optionsCache.at < CACHE_TTL) return optionsCache.value;
  const [dJson, cJson] = await Promise.all([
    request('/departments?limit=1000'),
    request('/asset-categories?includeInactive=false')
  ]);
  const departments = listFrom(dJson)
    .map(d => ({ id: d.id, code: d.code || '', name: d.name || '', parentId: d.parent_id || null }))
    .filter(d => d.id && d.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const categories = listFrom(cJson)
    .map(c => ({
      id: c.id, code: c.code || '', name: c.name || '', unit: c.unit || '',
      group: c.category_group || '', parentCode: c.parent_code || '',
      trackingType: c.tracking_type || 'individual',
      isDepreciable: c.is_depreciable, usefulLife: c.useful_life_years || c.useful_life || null,
      depreciationRate: c.depreciation_rate ?? null
    }))
    .filter(c => c.id && c.name && c.is_active !== false)
    .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, 'vi'));
  const value = { departments, categories };
  optionsCache = { at: Date.now(), value };
  return value;
}

function mapStatus(status) {
  const s = fold(status);
  if (!s || s.includes('dang su dung')) return 'active';
  if (s.includes('chua su dung')) return 'inactive';
  if (s.includes('hong')) return 'damaged';
  if (s.includes('mat')) return 'lost';
  if (s.includes('thanh ly')) return 'disposed';
  if (s.includes('dieu chuyen')) return 'active';
  return 'active';
}

function buildAssetPayload(asset, opts = {}) {
  const departmentId = Number(asset.qltkDepartmentId || opts.departmentId) || null;
  const categoryId = Number(asset.qltkCategoryId) || null;
  const acceptanceDate = asset.acceptanceDate || opts.acceptanceDate || '';
  const yearInUse = Number(asset.year) ||
    (acceptanceDate ? Number(String(acceptanceDate).slice(0, 4)) : 0) ||
    Number(opts.projectYear) || 0;
  const desc = [
    asset.note,
    opts.projectLabel ? `Dự án: ${opts.projectLabel}` : '',
    opts.packageLabel ? `Gói thầu: ${opts.packageLabel}` : ''
  ].filter(Boolean).join(' | ');
  const payload = {
    name: asset.name,
    category_id: categoryId,
    category_code: asset.qltkCategoryCode || undefined,
    unit: asset.unit || undefined,
    quantity: Number(asset.quantity) || 1,
    purchase_price: Number(asset.amount) || (Number(asset.quantity) || 1) * (Number(asset.unitPrice) || 0),
    current_department_id: departmentId,
    location: asset.location || undefined,
    purchase_date: acceptanceDate || undefined,
    year_in_use: yearInUse || undefined,
    status: mapStatus(asset.status),
    asset_condition: 'good',
    description: desc || undefined,
    is_depreciable: opts.category ? opts.category.isDepreciable !== false : true
  };
  if (opts.category?.usefulLife) payload.useful_life = Number(opts.category.usefulLife);
  if (opts.category?.depreciationRate != null) payload.depreciation_rate = Number(opts.category.depreciationRate);
  Object.keys(payload).forEach(k => { if (payload[k] === undefined || payload[k] === null) delete payload[k]; });
  return payload;
}

async function createAsset(asset, opts = {}) {
  const json = await request('/assets', { method: 'POST', body: buildAssetPayload(asset, opts) });
  const d = json && json.data && typeof json.data === 'object' ? json.data : json;
  return d?.asset || d?.item || d;
}

module.exports = { isConfigured, getOptions, createAsset, buildAssetPayload, mapStatus, BASE_URL };
