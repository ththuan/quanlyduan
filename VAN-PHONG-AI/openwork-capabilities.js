'use strict';

// Local, bounded analogue of OpenWork's capability discovery contract.
// This registry describes what the office agent may expose; execution remains
// in the local server so policy and confirmation gates cannot be bypassed.
const CAPABILITIES = [
  {
    name: 'knowledge.search',
    title: 'Tim kiem Tu tri thuc',
    description: 'Tim cac doan tai lieu noi bo theo tu khoa va tra ve nguon.',
    triggers: ['tra cuu', 'tim tai lieu', 'tu tri thuc', 'bao gia', 'can cu', 'search', 'knowledge'],
    input: { query: 'string', limit: 'number?' },
    effects: { data: 'read', external: false, confirmation: false },
  },
  {
    name: 'knowledge.ask',
    title: 'Hoi dap co nguon',
    description: 'Dat cau hoi cho RAG local va nhan cau tra loi kem nguon.',
    triggers: ['hoi dap', 'giai thich tai lieu', 'can cu', 'bao gia', 'knowledge ask'],
    input: { question: 'string', webSearch: 'boolean?' },
    effects: { data: 'read', external: false, confirmation: false },
  },
  {
    name: 'skills.list',
    title: 'Danh sach skill runtime',
    description: 'Xem cac skill AI da duoc cap quyen trong Van phong AI.',
    triggers: ['skill', 'capability', 'quyen agent'],
    input: {},
    effects: { data: 'read', external: false, confirmation: false },
  },
  {
    name: 'reminders.list',
    title: 'Xem lich nhac',
    description: 'Lay cac lich nhac va notification dang cho.',
    triggers: ['lich nhac', 'nhac viec', 'reminder', 'deadline'],
    input: { status: 'string?', from: 'string?', to: 'string?' },
    effects: { data: 'read', external: false, confirmation: false },
  },
  {
    name: 'reminders.create',
    title: 'Tao lich nhac',
    description: 'Tao lich nhac local sau khi nguoi dung xac nhan ro rang.',
    triggers: ['tao lich nhac', 'dat nhac viec', 'schedule reminder'],
    input: { title: 'string', dueAt: 'ISO datetime', details: 'string?', leadMinutes: 'number?', confirm: 'boolean' },
    effects: { data: 'write', external: false, confirmation: true },
  },
  {
    name: 'dossier.create_draft',
    title: 'Tao bo ho so ban nhap',
    description: 'Tao thu muc ho so va cac tai lieu ban nhap, khong phat hanh ra ben ngoai.',
    triggers: ['tao ho so', 'bo ho so', 'dossier', 'xuat ban nhap'],
    input: { caseId: 'string', request: 'object', confirm: 'boolean' },
    effects: { data: 'write', external: false, confirmation: true },
  },
];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function listCapabilities() {
  return CAPABILITIES.map((item) => Object.assign({}, item));
}

function getCapability(name) {
  return CAPABILITIES.find((item) => item.name === String(name || '').trim()) || null;
}

function searchCapabilities(query, limit = 20) {
  const text = normalize(query);
  const scored = CAPABILITIES.map((item) => {
    const searchable = item.triggers.concat([item.name, item.title, item.description]);
    const score = searchable.reduce((sum, trigger) => sum + (text.includes(normalize(trigger)) ? 1 : 0), 0);
    return { capability: item, score };
  }).filter((item) => item.score > 0 || !text)
    .sort((left, right) => right.score - left.score || left.capability.name.localeCompare(right.capability.name));
  return scored.slice(0, Math.max(1, Math.min(50, Number(limit) || 20))).map((item) => Object.assign({ score: item.score }, item.capability));
}

module.exports = { listCapabilities, getCapability, searchCapabilities };
