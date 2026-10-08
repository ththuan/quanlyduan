'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { inflateRawSync } = require('zlib');
const { createHash } = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const PDFDocument = require('pdfkit');
const { listSkills, selectSkill, skillInstructions } = require('./ai-agent-skills');
const { listCapabilities, getCapability, searchCapabilities } = require('./openwork-capabilities');

const HOST = process.env.AI_OFFICE_HOST || '0.0.0.0';
const PORT = Number(process.env.AI_OFFICE_PORT || 8765);
const ROOT = __dirname;
const HTML_FILE = path.join(ROOT, 'quy-trinh-thanh-toan.html');
const FORM_DIR = path.join(ROOT, 'MAU');
const DOSSIER_DIR = path.join(ROOT, 'HO-SO-AI');
const KNOWLEDGE_DIR = path.join(ROOT, 'KHO-TRI-THUC');
const KNOWLEDGE_FILES_DIR = path.join(KNOWLEDGE_DIR, 'TAI-LIEU-GOC');
const KNOWLEDGE_DB_FILE = path.join(KNOWLEDGE_DIR, 'tri-thuc.db');
const AI_CONFIG_FILE = path.join(ROOT, 'ai-config.local.json');
const DEFAULT_AI_CONFIG = {
  provider: 'openai-compatible',
  baseUrl: 'https://cheapkeyai.shop/v1',
  apiMode: 'responses',
  model: 'cheap-5.6-sol',
  apiKey: '',
  webSearch: true
};

const CONTENT_TYPES = {
  '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
    '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip'
};

const KNOWLEDGE_EXTENSIONS = new Set(['.txt', '.md', '.html', '.htm', '.json', '.csv', '.doc', '.docx', '.pdf']);
const MAX_KNOWLEDGE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_KNOWLEDGE_TEXT_LENGTH = 2 * 1024 * 1024;
let knowledgeDb = null;

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function sendError(response, status, message, details) {
  sendJson(response, status, { error: message, details: details || '' });
}

function readJsonBody(request, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Dữ liệu gửi lên quá lớn'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(Object.assign(new Error('Dữ liệu JSON không hợp lệ'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function loadAiConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8'));
    const config = Object.assign({}, DEFAULT_AI_CONFIG, saved || {});
    config.model = DEFAULT_AI_CONFIG.model;
    return config;
  } catch {
    return Object.assign({}, DEFAULT_AI_CONFIG);
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_AI_CONFIG.baseUrl).trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(raw); } catch { throw Object.assign(new Error('Base URL API không hợp lệ'), { statusCode: 400 }); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw Object.assign(new Error('Base URL API phải bắt đầu bằng http:// hoặc https://'), { statusCode: 400 });
  }
  return raw;
}

function normalizeApiMode(value) {
  return value === 'chat-completions' ? 'chat-completions' : 'responses';
}

function publicAiConfig(config) {
  const key = String(config.apiKey || '');
  return {
    provider: config.provider || DEFAULT_AI_CONFIG.provider,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    apiMode: normalizeApiMode(config.apiMode),
    model: config.model || DEFAULT_AI_CONFIG.model,
    hasApiKey: Boolean(key),
    apiKeyHint: key ? '••••' + key.slice(-4) : '',
    webSearch: config.webSearch !== false
  };
}

function saveAiConfig(input) {
  const current = loadAiConfig();
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) current.apiKey = input.apiKey.trim();
  if (input.clearApiKey === true) current.apiKey = '';
  if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) current.baseUrl = normalizeBaseUrl(input.baseUrl);
  if (typeof input.apiMode === 'string') current.apiMode = normalizeApiMode(input.apiMode);
  current.model = DEFAULT_AI_CONFIG.model;
  if (typeof input.webSearch === 'boolean') current.webSearch = input.webSearch;
  fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
  return current;
}

function safeCaseId(value) {
  const id = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
  if (!id) throw Object.assign(new Error('Mã hồ sơ không hợp lệ'), { statusCode: 400 });
  return id;
}

function safeRelativeFile(folder, relativeName) {
  const base = path.resolve(folder);
  const resolved = path.resolve(base, String(relativeName || ''));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw Object.assign(new Error('Đường dẫn tệp không hợp lệ'), { statusCode: 400 });
  }
  return resolved;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function getKnowledgeDb() {
  if (knowledgeDb) return knowledgeDb;
  fs.mkdirSync(KNOWLEDGE_FILES_DIR, { recursive: true });
  knowledgeDb = new DatabaseSync(KNOWLEDGE_DB_FILE);
  knowledgeDb.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  knowledgeDb.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL DEFAULT 'upload',
      original_path TEXT NOT NULL DEFAULT '',
      text_length INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
      content,
      document_id UNINDEXED,
      chunk_index UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS knowledge_parent_chunks (
      document_id TEXT NOT NULL,
      parent_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      child_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (document_id, parent_index),
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS knowledge_chunk_map (
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      parent_index INTEGER NOT NULL,
      PRIMARY KEY (document_id, chunk_index),
      FOREIGN KEY (document_id, parent_index) REFERENCES knowledge_parent_chunks(document_id, parent_index) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS knowledge_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'instruction',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 1,
      importance REAL NOT NULL DEFAULT 0.5,
      content_hash TEXT NOT NULL UNIQUE,
      consolidated_batch INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_source ON agent_memories(source_type, source_ref) WHERE source_ref <> '';
    CREATE VIRTUAL TABLE IF NOT EXISTS agent_memories_fts USING fts5(
      title,
      content,
      keywords,
      memory_id UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS memory_consolidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS office_life_state (
      scope TEXT PRIMARY KEY,
      state_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS office_life_events (
      id TEXT PRIMARY KEY,
      day_key TEXT NOT NULL DEFAULT '',
      tick INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'activity',
      actor TEXT NOT NULL DEFAULT '',
      target TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      importance REAL NOT NULL DEFAULT 0.5,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_office_life_events_created ON office_life_events(created_at DESC);
    CREATE TABLE IF NOT EXISTS office_life_memories (
      id TEXT PRIMARY KEY,
      person TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'episodic',
      summary TEXT NOT NULL,
      emotion TEXT NOT NULL DEFAULT 'neutral',
      importance REAL NOT NULL DEFAULT 0.5,
      day_key TEXT NOT NULL DEFAULT '',
      source_event_ids_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_office_life_memories_person ON office_life_memories(person, updated_at DESC);
    CREATE TABLE IF NOT EXISTS office_life_relationships (
      pair_key TEXT PRIMARY KEY,
      person_a TEXT NOT NULL,
      person_b TEXT NOT NULL,
      affinity REAL NOT NULL DEFAULT 50,
      trust REAL NOT NULL DEFAULT 50,
      tension REAL NOT NULL DEFAULT 10,
      last_reason TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS office_life_story_hooks (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      score REAL NOT NULL DEFAULT 0,
      participants_json TEXT NOT NULL DEFAULT '[]',
      causes_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_office_life_hooks_status ON office_life_story_hooks(status, score DESC);
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      due_at TEXT NOT NULL,
      trigger_at TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
      recurrence TEXT NOT NULL DEFAULT 'none',
      lead_minutes INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      character_name TEXT NOT NULL DEFAULT 'AN',
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'manual',
      context_json TEXT NOT NULL DEFAULT '{}',
      last_triggered_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_schedule ON reminders(status, trigger_at);
    CREATE TABLE IF NOT EXISTS reminder_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_id TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      character_name TEXT NOT NULL DEFAULT 'AN',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      deliver_after TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT NOT NULL DEFAULT '',
      acknowledged_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE,
      UNIQUE(reminder_id, scheduled_for)
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_pending ON reminder_deliveries(status, deliver_after);
  `);
  ensureKnowledgeHierarchy(knowledgeDb);
  return knowledgeDb;
}

function parseStoredJson(value, fallback) {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function officeLifeSnapshot() {
  const db = getKnowledgeDb();
  const stateRow = db.prepare('SELECT state_json, updated_at FROM office_life_state WHERE scope = ?').get('main');
  const events = db.prepare('SELECT * FROM office_life_events ORDER BY created_at DESC LIMIT 160').all().map((row) => ({
    id: row.id, dayKey: row.day_key, tick: row.tick, kind: row.kind, actor: row.actor, target: row.target,
    location: row.location, title: row.title, detail: row.detail, importance: row.importance,
    payload: parseStoredJson(row.payload_json, {}), createdAt: row.created_at
  }));
  const memories = db.prepare('SELECT * FROM office_life_memories ORDER BY updated_at DESC LIMIT 220').all().map((row) => ({
    id: row.id, person: row.person, kind: row.kind, summary: row.summary, emotion: row.emotion,
    importance: row.importance, dayKey: row.day_key, sourceEventIds: parseStoredJson(row.source_event_ids_json, []),
    payload: parseStoredJson(row.payload_json, {}), createdAt: row.created_at, updatedAt: row.updated_at
  }));
  const relationships = db.prepare('SELECT * FROM office_life_relationships ORDER BY tension DESC, trust DESC').all().map((row) => ({
    key: row.pair_key, personA: row.person_a, personB: row.person_b, affinity: row.affinity,
    trust: row.trust, tension: row.tension, lastReason: row.last_reason, updatedAt: row.updated_at
  }));
  const hooks = db.prepare("SELECT * FROM office_life_story_hooks WHERE status <> 'archived' ORDER BY score DESC, updated_at DESC LIMIT 80").all().map((row) => ({
    id: row.id, kind: row.kind, title: row.title, status: row.status, score: row.score,
    participants: parseStoredJson(row.participants_json, []), causes: parseStoredJson(row.causes_json, []),
    payload: parseStoredJson(row.payload_json, {}), createdAt: row.created_at, updatedAt: row.updated_at
  }));
  return {
    state: stateRow ? parseStoredJson(stateRow.state_json, null) : null,
    updatedAt: stateRow ? stateRow.updated_at : '', events, memories, relationships, hooks
  };
}

function officeLifeText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function officeLifeNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

const REMINDER_RECURRENCES = new Set(['none', 'daily', 'weekdays', 'weekly', 'monthly']);
const REMINDER_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const REMINDER_CHARACTERS = new Set(['AN', 'HẢI', 'LONG', 'MINH', 'NAM', 'LÂM', 'PHÚC']);

function reminderText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function reminderIso(value, fieldName) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw Object.assign(new Error((fieldName || 'Thời gian') + ' không hợp lệ'), { statusCode: 400 });
  }
  return date.toISOString();
}

function reminderId() {
  return 'rem-' + Date.now().toString(36) + '-' + createHash('sha1').update(String(Math.random()) + process.hrtime.bigint()).digest('hex').slice(0, 8);
}

function reminderRow(row) {
  if (!row) return null;
  return {
    id: row.id, title: row.title, details: row.details, dueAt: row.due_at, triggerAt: row.trigger_at,
    timezone: row.timezone, recurrence: row.recurrence, leadMinutes: row.lead_minutes,
    priority: row.priority, character: row.character_name, status: row.status, source: row.source,
    context: parseStoredJson(row.context_json, {}), lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function reminderDeliveryRow(row) {
  if (!row) return null;
  return {
    id: row.id, reminderId: row.reminder_id, scheduledFor: row.scheduled_for, title: row.title,
    body: row.body, character: row.character_name, priority: row.priority, status: row.status,
    deliverAfter: row.deliver_after, createdAt: row.created_at, deliveredAt: row.delivered_at,
    acknowledgedAt: row.acknowledged_at
  };
}

function reminderTriggerAt(dueAt, leadMinutes) {
  return new Date(new Date(dueAt).getTime() - Math.max(0, Number(leadMinutes) || 0) * 60000).toISOString();
}

function nextReminderDue(dueAt, recurrence) {
  const date = new Date(dueAt);
  if (recurrence === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  else if (recurrence === 'weekdays') {
    do { date.setUTCDate(date.getUTCDate() + 1); }
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  } else if (recurrence === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (recurrence === 'monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString();
}

function listReminders(filters) {
  const clauses = [];
  const values = [];
  const status = reminderText(filters && filters.status, 30);
  if (status && status !== 'all') { clauses.push('status = ?'); values.push(status); }
  if (filters && filters.from) { clauses.push('due_at >= ?'); values.push(reminderIso(filters.from, 'Mốc bắt đầu')); }
  if (filters && filters.to) { clauses.push('due_at <= ?'); values.push(reminderIso(filters.to, 'Mốc kết thúc')); }
  const sql = 'SELECT * FROM reminders' + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') +
    " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, due_at ASC LIMIT 300";
  return getKnowledgeDb().prepare(sql).all(...values).map(reminderRow);
}

function getReminder(id) {
  return reminderRow(getKnowledgeDb().prepare('SELECT * FROM reminders WHERE id = ?').get(reminderText(id, 80)));
}

function createReminder(input) {
  const title = reminderText(input && input.title, 180);
  if (title.length < 2) throw Object.assign(new Error('Hãy nhập nội dung cần nhắc'), { statusCode: 400 });
  const dueAt = reminderIso(input && input.dueAt, 'Thời điểm cần nhắc');
  const leadMinutes = Math.max(0, Math.min(10080, Math.round(Number(input && input.leadMinutes) || 0)));
  const recurrence = REMINDER_RECURRENCES.has(input && input.recurrence) ? input.recurrence : 'none';
  const priority = REMINDER_PRIORITIES.has(input && input.priority) ? input.priority : 'normal';
  const character = REMINDER_CHARACTERS.has(input && input.character) ? input.character : 'AN';
  const id = reminderId();
  const now = new Date().toISOString();
  getKnowledgeDb().prepare(`INSERT INTO reminders
    (id, title, details, due_at, trigger_at, timezone, recurrence, lead_minutes, priority, character_name, status, source, context_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
    .run(id, title, reminderText(input && input.details, 2000), dueAt, reminderTriggerAt(dueAt, leadMinutes),
      reminderText(input && input.timezone, 80) || 'Asia/Bangkok', recurrence, leadMinutes, priority, character,
      reminderText(input && input.source, 40) || 'manual', JSON.stringify(input && input.context && typeof input.context === 'object' ? input.context : {}).slice(0, 12000), now, now);
  runReminderScheduler();
  return getReminder(id);
}

function updateReminder(id, input) {
  const existing = getReminder(id);
  if (!existing) throw Object.assign(new Error('Không tìm thấy lịch nhắc'), { statusCode: 404 });
  const title = input && Object.prototype.hasOwnProperty.call(input, 'title') ? reminderText(input.title, 180) : existing.title;
  if (title.length < 2) throw Object.assign(new Error('Nội dung cần nhắc không hợp lệ'), { statusCode: 400 });
  const dueAt = input && input.dueAt ? reminderIso(input.dueAt, 'Thời điểm cần nhắc') : existing.dueAt;
  const leadMinutes = input && Object.prototype.hasOwnProperty.call(input, 'leadMinutes')
    ? Math.max(0, Math.min(10080, Math.round(Number(input.leadMinutes) || 0))) : existing.leadMinutes;
  const recurrence = input && REMINDER_RECURRENCES.has(input.recurrence) ? input.recurrence : existing.recurrence;
  const priority = input && REMINDER_PRIORITIES.has(input.priority) ? input.priority : existing.priority;
  const character = input && REMINDER_CHARACTERS.has(input.character) ? input.character : existing.character;
  const triggerAt = reminderTriggerAt(dueAt, leadMinutes);
  const requestedStatus = input && ['active', 'completed', 'cancelled', 'notified'].indexOf(input.status) !== -1 ? input.status : '';
  let status = requestedStatus || existing.status;
  if (!requestedStatus && existing.status === 'notified' && new Date(triggerAt).getTime() > Date.now()) status = 'active';
  const now = new Date().toISOString();
  getKnowledgeDb().prepare(`UPDATE reminders SET title = ?, details = ?, due_at = ?, trigger_at = ?, timezone = ?, recurrence = ?,
    lead_minutes = ?, priority = ?, character_name = ?, status = ?, context_json = ?, updated_at = ? WHERE id = ?`)
    .run(title, input && Object.prototype.hasOwnProperty.call(input, 'details') ? reminderText(input.details, 2000) : existing.details,
      dueAt, triggerAt, reminderText(input && input.timezone, 80) || existing.timezone,
      recurrence, leadMinutes, priority, character, status,
      JSON.stringify(input && input.context && typeof input.context === 'object' ? input.context : existing.context).slice(0, 12000), now, existing.id);
  if (existing.status === 'notified' && status === 'active') {
    getKnowledgeDb().prepare("UPDATE reminder_deliveries SET status = 'acknowledged', acknowledged_at = ? WHERE reminder_id = ? AND status IN ('pending', 'snoozed')")
      .run(now, existing.id);
  }
  runReminderScheduler();
  return getReminder(existing.id);
}

function setReminderStatus(id, status) {
  const existing = getReminder(id);
  if (!existing) throw Object.assign(new Error('Không tìm thấy lịch nhắc'), { statusCode: 404 });
  if (status === 'active' && new Date(existing.triggerAt).getTime() <= Date.now()) {
    throw Object.assign(new Error('Hãy sửa lịch sang thời điểm trong tương lai trước khi mở lại'), { statusCode: 400 });
  }
  const now = new Date().toISOString();
  getKnowledgeDb().prepare('UPDATE reminders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, existing.id);
  if (status === 'completed' || status === 'cancelled') {
    getKnowledgeDb().prepare("UPDATE reminder_deliveries SET status = 'acknowledged', acknowledged_at = ? WHERE reminder_id = ? AND status IN ('pending', 'snoozed')").run(now, existing.id);
  }
  return getReminder(existing.id);
}

function runReminderScheduler() {
  try {
    const db = getKnowledgeDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE reminder_deliveries SET status = 'pending' WHERE status = 'snoozed' AND deliver_after <= ?").run(now);
    const due = db.prepare("SELECT * FROM reminders WHERE status = 'active' AND trigger_at <= ? ORDER BY trigger_at ASC LIMIT 80").all(now);
    for (const row of due) {
      db.prepare(`INSERT OR IGNORE INTO reminder_deliveries
        (reminder_id, scheduled_for, title, body, character_name, priority, status, deliver_after, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .run(row.id, row.trigger_at, row.title, row.details, row.character_name, row.priority, now, now);
      if (row.recurrence === 'none') {
        db.prepare("UPDATE reminders SET status = 'notified', last_triggered_at = ?, updated_at = ? WHERE id = ?").run(now, now, row.id);
        continue;
      }
      let nextDue = row.due_at;
      let nextTrigger = row.trigger_at;
      do {
        nextDue = nextReminderDue(nextDue, row.recurrence);
        nextTrigger = reminderTriggerAt(nextDue, row.lead_minutes);
      } while (nextTrigger <= now);
      db.prepare('UPDATE reminders SET due_at = ?, trigger_at = ?, last_triggered_at = ?, updated_at = ? WHERE id = ?')
        .run(nextDue, nextTrigger, now, now, row.id);
    }
    db.prepare("DELETE FROM reminder_deliveries WHERE status = 'acknowledged' AND acknowledged_at <> '' AND acknowledged_at < ?")
      .run(new Date(Date.now() - 90 * 86400000).toISOString());
    return true;
  } catch (error) {
    if (error && (error.code === 'SQLITE_BUSY' || error.errcode === 5 || /database is (?:locked|busy)/i.test(error.message || ''))) return false;
    throw error;
  }
}

function listPendingReminderDeliveries() {
  runReminderScheduler();
  return getKnowledgeDb().prepare("SELECT * FROM reminder_deliveries WHERE status = 'pending' AND deliver_after <= ? ORDER BY deliver_after ASC LIMIT 50")
    .all(new Date().toISOString()).map(reminderDeliveryRow);
}

function acknowledgeReminderDelivery(id) {
  const now = new Date().toISOString();
  const result = getKnowledgeDb().prepare("UPDATE reminder_deliveries SET status = 'acknowledged', delivered_at = CASE WHEN delivered_at = '' THEN ? ELSE delivered_at END, acknowledged_at = ? WHERE id = ?")
    .run(now, now, Number(id));
  if (!result.changes) throw Object.assign(new Error('Không tìm thấy thông báo'), { statusCode: 404 });
  return reminderDeliveryRow(getKnowledgeDb().prepare('SELECT * FROM reminder_deliveries WHERE id = ?').get(Number(id)));
}

function snoozeReminderDelivery(id, minutes) {
  const delay = Math.max(1, Math.min(1440, Math.round(Number(minutes) || 10)));
  const deliverAfter = new Date(Date.now() + delay * 60000).toISOString();
  const result = getKnowledgeDb().prepare("UPDATE reminder_deliveries SET status = 'snoozed', deliver_after = ?, delivered_at = CASE WHEN delivered_at = '' THEN ? ELSE delivered_at END WHERE id = ?")
    .run(deliverAfter, new Date().toISOString(), Number(id));
  if (!result.changes) throw Object.assign(new Error('Không tìm thấy thông báo'), { statusCode: 404 });
  return reminderDeliveryRow(getKnowledgeDb().prepare('SELECT * FROM reminder_deliveries WHERE id = ?').get(Number(id)));
}

function syncOfficeLife(input) {
  const db = getKnowledgeDb();
  const now = new Date().toISOString();
  const state = input && input.state && typeof input.state === 'object' ? input.state : {};
  let stateJson = JSON.stringify(state);
  if (stateJson.length > 900000) {
    const compactState = Object.assign({}, state, {
      events: Array.isArray(state.events) ? state.events.slice(-100) : [],
      memories: Array.isArray(state.memories) ? state.memories.slice(-140) : [],
      hooks: Array.isArray(state.hooks) ? state.hooks.slice(-40) : []
    });
    stateJson = JSON.stringify(compactState);
  }
  if (stateJson.length > 900000) throw Object.assign(new Error('Trạng thái mô phỏng vượt giới hạn lưu trữ'), { statusCode: 413 });
  db.prepare(`INSERT INTO office_life_state (scope, state_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`).run('main', stateJson, now);

  const eventStatement = db.prepare(`INSERT INTO office_life_events
    (id, day_key, tick, kind, actor, target, location, title, detail, importance, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET detail = excluded.detail, importance = excluded.importance, payload_json = excluded.payload_json`);
  for (const event of (Array.isArray(input.events) ? input.events : []).slice(-220)) {
    if (!event || !event.id || !event.title) continue;
    eventStatement.run(
      officeLifeText(event.id, 100), officeLifeText(event.dayKey, 16), Math.max(0, Number(event.tick) || 0),
      officeLifeText(event.kind || 'activity', 40), officeLifeText(event.actor, 30), officeLifeText(event.target, 30),
      officeLifeText(event.location, 40), officeLifeText(event.title, 180), officeLifeText(event.detail, 1200),
      officeLifeNumber(event.importance, .5, 0, 1), JSON.stringify(event.payload || {}).slice(0, 10000),
      officeLifeText(event.createdAt || now, 40)
    );
  }

  const memoryStatement = db.prepare(`INSERT INTO office_life_memories
    (id, person, kind, summary, emotion, importance, day_key, source_event_ids_json, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, emotion = excluded.emotion,
      importance = excluded.importance, source_event_ids_json = excluded.source_event_ids_json,
      payload_json = excluded.payload_json, updated_at = excluded.updated_at`);
  for (const memory of (Array.isArray(input.memories) ? input.memories : []).slice(-300)) {
    if (!memory || !memory.id || !memory.person || !memory.summary) continue;
    memoryStatement.run(
      officeLifeText(memory.id, 110), officeLifeText(memory.person, 30), officeLifeText(memory.kind || 'episodic', 40),
      officeLifeText(memory.summary, 1200), officeLifeText(memory.emotion || 'neutral', 40),
      officeLifeNumber(memory.importance, .5, 0, 1), officeLifeText(memory.dayKey, 16),
      JSON.stringify(Array.isArray(memory.sourceEventIds) ? memory.sourceEventIds.slice(-30) : []).slice(0, 5000),
      JSON.stringify(memory.payload || {}).slice(0, 10000), officeLifeText(memory.createdAt || now, 40), now
    );
  }

  const relationshipStatement = db.prepare(`INSERT INTO office_life_relationships
    (pair_key, person_a, person_b, affinity, trust, tension, last_reason, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pair_key) DO UPDATE SET affinity = excluded.affinity, trust = excluded.trust,
      tension = excluded.tension, last_reason = excluded.last_reason, updated_at = excluded.updated_at`);
  for (const relation of (Array.isArray(input.relationships) ? input.relationships : []).slice(0, 80)) {
    if (!relation || !relation.key) continue;
    relationshipStatement.run(
      officeLifeText(relation.key, 80), officeLifeText(relation.personA, 30), officeLifeText(relation.personB, 30),
      officeLifeNumber(relation.affinity, 50, 0, 100), officeLifeNumber(relation.trust, 50, 0, 100),
      officeLifeNumber(relation.tension, 10, 0, 100), officeLifeText(relation.lastReason, 500), now
    );
  }

  const hookStatement = db.prepare(`INSERT INTO office_life_story_hooks
    (id, kind, title, status, score, participants_json, causes_json, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, score = excluded.score,
      participants_json = excluded.participants_json, causes_json = excluded.causes_json,
      payload_json = excluded.payload_json, updated_at = excluded.updated_at`);
  for (const hook of (Array.isArray(input.hooks) ? input.hooks : []).slice(-100)) {
    if (!hook || !hook.id || !hook.kind) continue;
    hookStatement.run(
      officeLifeText(hook.id, 110), officeLifeText(hook.kind, 50), officeLifeText(hook.title || hook.kind, 180),
      officeLifeText(hook.status || 'open', 30), officeLifeNumber(hook.score, 0, 0, 100),
      JSON.stringify(Array.isArray(hook.participants) ? hook.participants.slice(0, 12) : []).slice(0, 3000),
      JSON.stringify(Array.isArray(hook.causes) ? hook.causes.slice(-30) : []).slice(0, 12000),
      JSON.stringify(hook.payload || {}).slice(0, 12000), officeLifeText(hook.createdAt || now, 40), now
    );
  }

  db.exec(`
    DELETE FROM office_life_events WHERE id NOT IN (SELECT id FROM office_life_events ORDER BY created_at DESC LIMIT 1200);
    DELETE FROM office_life_memories WHERE id NOT IN (SELECT id FROM office_life_memories ORDER BY updated_at DESC LIMIT 1600);
    DELETE FROM office_life_story_hooks WHERE status = 'archived' AND updated_at < datetime('now', '-90 days');
  `);
  return officeLifeSnapshot();
}

function decodeTextEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanExtractedText(value) {
  return decodeTextEntities(value)
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_KNOWLEDGE_TEXT_LENGTH);
}

function htmlToText(value) {
  return cleanExtractedText(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' '));
}

function readZipEntry(buffer, wantedName) {
  let eocd = -1;
  const minimum = Math.max(0, buffer.length - 65557);
  for (let index = buffer.length - 22; index >= minimum; index--) {
    if (buffer.readUInt32LE(index) === 0x06054B50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error('Tệp DOCX không có cấu trúc ZIP hợp lệ');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entryCount && offset + 46 <= buffer.length; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014B50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === wantedName) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034B50) throw new Error('Tệp DOCX bị lỗi phần dữ liệu');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error('Tệp DOCX sử dụng kiểu nén chưa được hỗ trợ');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('Không tìm thấy nội dung văn bản trong tệp DOCX');
}

function docxToText(buffer) {
  const xml = readZipEntry(buffer, 'word/document.xml').toString('utf8');
  return cleanExtractedText(xml
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<\/w:tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((module) => module.default || module);
  }
  return pdfjsPromise;
}

async function pdfToText(buffer) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(buffer);
  const document = await pdfjs.getDocument({ data, disableWorker: true, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  try {
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) pages.push(pageText);
    }
  } finally {
    try { await document.destroy(); } catch {}
  }
  const text = pages.join('\n\n');
  if (text.length < 12) throw Object.assign(new Error('Không trích xuất được nội dung chữ từ tệp PDF'), { statusCode: 422 });
  return cleanExtractedText(text);
}

async function extractKnowledgeText(buffer, extension) {
  if (extension === '.docx') return docxToText(buffer);
  if (extension === '.pdf') return pdfToText(buffer);
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (extension === '.html' || extension === '.htm' || extension === '.doc') return htmlToText(raw);
  if (extension === '.json') {
    try { return cleanExtractedText(JSON.stringify(JSON.parse(raw), null, 2)); }
    catch { return cleanExtractedText(raw); }
  }
  return cleanExtractedText(raw);
}

function splitKnowledgeText(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  const push = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > 1800) {
      push();
      for (let start = 0; start < paragraph.length; start += 1450) chunks.push(paragraph.slice(start, start + 1650));
      continue;
    }
    if (current && current.length + paragraph.length > 1650) push();
    current += (current ? '\n\n' : '') + paragraph;
  }
  push();
  return chunks.length ? chunks : [String(text || '').slice(0, 1650)];
}

function splitTextWindow(text, maxLength, overlap) {
  const value = String(text || '').trim();
  if (!value) return [];
  if (value.length <= maxLength) return [value];
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + maxLength);
    if (end < value.length) {
      const preferred = Math.max(start + Math.floor(maxLength * .62), end - 260);
      const breaks = [value.lastIndexOf('\n\n', end), value.lastIndexOf('\n', end), value.lastIndexOf('. ', end), value.lastIndexOf(' ', end)];
      const boundary = breaks.find((position) => position >= preferred);
      if (typeof boundary === 'number' && boundary > start) end = boundary + (value.slice(boundary, boundary + 2) === '. ' ? 1 : 0);
    }
    const chunk = value.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= value.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function splitKnowledgeHierarchy(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const parents = [];
  let current = '';
  const pushParent = () => {
    const value = current.trim();
    if (value) parents.push(value);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > 4200) {
      pushParent();
      parents.push(...splitTextWindow(paragraph, 3900, 180));
      continue;
    }
    if (current && current.length + paragraph.length + 2 > 3900) pushParent();
    current += (current ? '\n\n' : '') + paragraph;
  }
  pushParent();
  if (!parents.length) parents.push(String(text || '').slice(0, 3900));
  const children = [];
  parents.forEach((parentContent, parentIndex) => {
    splitTextWindow(parentContent, 950, 140).forEach((content) => children.push({ content, parentIndex }));
  });
  return { parents, children };
}

function ensureKnowledgeHierarchy(db) {
  const documents = db.prepare(`SELECT d.id FROM knowledge_documents d
    WHERE NOT EXISTS (SELECT 1 FROM knowledge_parent_chunks p WHERE p.document_id = d.id)`).all();
  const insertParent = db.prepare('INSERT OR IGNORE INTO knowledge_parent_chunks (document_id,parent_index,content,child_count) VALUES (?,?,?,?)');
  const insertMap = db.prepare('INSERT OR REPLACE INTO knowledge_chunk_map (document_id,chunk_index,parent_index) VALUES (?,?,?)');
  for (const document of documents) {
    const rows = db.prepare(`SELECT CAST(chunk_index AS INTEGER) AS chunkIndex, content FROM knowledge_chunks_fts
      WHERE document_id = ? ORDER BY CAST(chunk_index AS INTEGER)`).all(document.id);
    if (!rows.length) continue;
    try {
      db.exec('BEGIN');
      for (let start = 0, parentIndex = 0; start < rows.length; start += 3, parentIndex++) {
        const group = rows.slice(start, start + 3);
        insertParent.run(document.id, parentIndex, group.map((row) => row.content).join('\n\n'), group.length);
        group.forEach((row) => insertMap.run(document.id, row.chunkIndex, parentIndex));
      }
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}

function safeKnowledgeName(value) {
  const name = path.basename(String(value || '').trim()).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').slice(0, 180);
  if (!name) throw Object.assign(new Error('Tên tài liệu không hợp lệ'), { statusCode: 400 });
  return name;
}

async function ingestKnowledgeBuffer(input) {
  const name = safeKnowledgeName(input.name);
  const extension = path.extname(name).toLowerCase();
  if (!KNOWLEDGE_EXTENSIONS.has(extension)) {
    throw Object.assign(new Error('Định dạng chưa hỗ trợ. Hãy dùng TXT, MD, HTML, JSON, CSV, DOC, DOCX hoặc PDF.'), { statusCode: 400 });
  }
  const buffer = Buffer.isBuffer(input.buffer) ? input.buffer : Buffer.from(input.buffer || '');
  if (!buffer.length) throw Object.assign(new Error('Tài liệu không có dữ liệu'), { statusCode: 400 });
  if (buffer.length > MAX_KNOWLEDGE_FILE_BYTES) throw Object.assign(new Error('Tài liệu vượt quá giới hạn 12 MB'), { statusCode: 413 });
  const text = await extractKnowledgeText(buffer, extension);
  if (text.length < 12) throw Object.assign(new Error('Không trích xuất được nội dung chữ từ tài liệu'), { statusCode: 422 });
  const hash = createHash('sha256').update(buffer).digest('hex');
  const db = getKnowledgeDb();
  const existing = db.prepare('SELECT * FROM knowledge_documents WHERE sha256 = ?').get(hash);
  if (existing) return { document: existing, created: false };
  const now = new Date().toISOString();
  const id = 'doc-' + hash.slice(0, 20);
  const storedName = id + extension;
  const storedPath = path.join(KNOWLEDGE_FILES_DIR, storedName);
  const hierarchy = splitKnowledgeHierarchy(text);
  const chunks = hierarchy.children;
  fs.writeFileSync(storedPath, buffer);
  const insertDocument = db.prepare(`INSERT INTO knowledge_documents
    (id,name,stored_name,extension,mime_type,size,sha256,source_type,original_path,text_length,chunk_count,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertChunk = db.prepare('INSERT INTO knowledge_chunks_fts (content,document_id,chunk_index) VALUES (?,?,?)');
  const insertParent = db.prepare('INSERT INTO knowledge_parent_chunks (document_id,parent_index,content,child_count) VALUES (?,?,?,?)');
  const insertMap = db.prepare('INSERT INTO knowledge_chunk_map (document_id,chunk_index,parent_index) VALUES (?,?,?)');
  try {
    db.exec('BEGIN');
    insertDocument.run(id, name, storedName, extension, input.mimeType || CONTENT_TYPES[extension] || '', buffer.length, hash,
      input.sourceType || 'upload', input.originalPath || '', text.length, chunks.length, now, now);
    hierarchy.parents.forEach((parent, parentIndex) => {
      const childCount = chunks.filter((chunk) => chunk.parentIndex === parentIndex).length;
      insertParent.run(id, parentIndex, parent, childCount);
    });
    chunks.forEach((chunk, index) => {
      insertChunk.run(chunk.content, id, index);
      insertMap.run(id, index, chunk.parentIndex);
    });
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    try { fs.unlinkSync(storedPath); } catch {}
    throw error;
  }
  return { document: db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id), created: true };
}

function knowledgeStats() {
  const db = getKnowledgeDb();
  const totals = db.prepare('SELECT COUNT(*) AS documents, COALESCE(SUM(chunk_count),0) AS chunks, COALESCE(SUM(size),0) AS bytes FROM knowledge_documents').get();
  const messages = db.prepare('SELECT COUNT(*) AS messages FROM knowledge_chat').get();
  return Object.assign({ documents: Number(totals.documents), chunks: Number(totals.chunks), bytes: Number(totals.bytes), messages: Number(messages.messages) }, memoryStats());
}

function listKnowledgeDocuments() {
  return getKnowledgeDb().prepare(`SELECT id,name,extension,mime_type,size,source_type,original_path,text_length,chunk_count,created_at,updated_at
    FROM knowledge_documents ORDER BY updated_at DESC LIMIT 150`).all();
}

function knowledgeSearchTerms(value) {
  const stopWords = new Set(['ai','anh','bạn','các','cái','cho','có','của','đang','đến','được','giúp','gì','hãy','hiện','không','là','liên','một','nào','này','những','nội','quan','ra','sao','theo','thì','tôi','trong','từ','và','về','với']);
  const words = (String(value || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length > 1);
  const terms = Array.from(new Set(words.filter((word) => !stopWords.has(word))).values()).slice(0, 16);
  const phrases = [];
  for (let index = 0; index < words.length - 1; index++) {
    if (!stopWords.has(words[index]) && !stopWords.has(words[index + 1])) phrases.push(words[index] + ' ' + words[index + 1]);
  }
  return { terms, phrases: Array.from(new Set(phrases)).slice(0, 10) };
}

function foldKnowledgeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
}

function buildFtsQuery(value) {
  const search = knowledgeSearchTerms(value);
  const expressions = search.phrases.map((phrase) => '"' + phrase.replace(/"/g, '') + '"')
    .concat(search.terms.map((word) => '"' + word.replace(/"/g, '') + '"'));
  return { query: Array.from(new Set(expressions)).join(' OR '), terms: search.terms, phrases: search.phrases };
}

function searchKnowledge(query, limit = 8) {
  const search = buildFtsQuery(query);
  if (!search.query) return [];
  const foldedQuery = foldKnowledgeSearchText(query);
  const wantsForms = foldedQuery.includes('bieu mau') || foldedQuery.includes('mau nao') || foldedQuery.includes('mau ');
  const wantsDossiers = foldedQuery.includes('ho so');
  const db = getKnowledgeDb();
  const rows = db.prepare(`SELECT f.document_id AS documentId, CAST(f.chunk_index AS INTEGER) AS chunkIndex, f.content,
      d.name, d.extension, d.source_type AS sourceType, d.original_path AS originalPath,
      m.parent_index AS parentIndex, p.content AS parentContent, bm25(knowledge_chunks_fts) AS score
    FROM knowledge_chunks_fts AS f JOIN knowledge_documents AS d ON d.id = f.document_id
    LEFT JOIN knowledge_chunk_map AS m ON m.document_id = f.document_id AND m.chunk_index = CAST(f.chunk_index AS INTEGER)
    LEFT JOIN knowledge_parent_chunks AS p ON p.document_id = m.document_id AND p.parent_index = m.parent_index
    WHERE knowledge_chunks_fts MATCH ? ORDER BY score LIMIT 60`).all(search.query);
  return rows.map((row) => {
    const content = foldKnowledgeSearchText(row.content);
    const name = foldKnowledgeSearchText(row.name);
    let relevance = Math.max(0, -Number(row.score || 0));
    for (const term of search.terms) {
      const folded = foldKnowledgeSearchText(term);
      if (content.includes(folded)) relevance += 1.5;
      if (name.includes(folded)) relevance += 1;
    }
    for (const phrase of search.phrases) {
      const folded = foldKnowledgeSearchText(phrase);
      if (content.includes(folded)) relevance += 8;
      if (name.includes(folded)) relevance += 3;
    }
    if (wantsForms && row.sourceType === 'form') relevance += 15;
    if (wantsDossiers && row.sourceType === 'dossier') relevance += 12;
    return Object.assign(row, { relevance });
  }).sort((a, b) => b.relevance - a.relevance).slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
}

function buildAgenticQueryPlan(question, history) {
  const recentUser = (Array.isArray(history) ? history : []).filter((item) => item.role === 'user').slice(-1)[0];
  const folded = foldKnowledgeSearchText(question);
  const variants = [String(question || '').trim()];
  String(question || '').split(/[?;\n]+|\b(?:đồng thời|ngoài ra|và cho tôi biết)\b/iu)
    .map((item) => item.trim()).filter((item) => item.length >= 8).slice(0, 3).forEach((item) => variants.push(item));
  if (/\b(no|do|nay|viec do|noi dung do|ho so do)\b/.test(folded) && recentUser && recentUser.content) {
    variants.unshift(String(recentUser.content).slice(0, 700) + '\n' + question);
  }
  const terms = knowledgeSearchTerms(question).terms;
  if (terms.length) variants.push(terms.join(' '));
  return {
    variants: Array.from(new Set(variants.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 5),
    ambiguous: terms.length < 2 && !(recentUser && recentUser.content),
    multiPart: variants.length > 2
  };
}

function searchKnowledgeAgentic(question, history, limit = 9) {
  const plan = buildAgenticQueryPlan(question, history);
  const merged = new Map();
  let retries = 0;
  plan.variants.forEach((variant, variantIndex) => {
    const rows = searchKnowledge(variant, 14);
    if (variantIndex > 0) retries++;
    rows.forEach((row, rowIndex) => {
      const key = row.documentId + ':' + row.chunkIndex;
      const adjusted = Number(row.relevance || 0) + Math.max(0, 4 - variantIndex) + Math.max(0, 2 - rowIndex * .15);
      const previous = merged.get(key);
      if (!previous || adjusted > previous.relevance) merged.set(key, Object.assign({}, row, { relevance: adjusted, matchedQuery: variant }));
    });
  });
  const matches = Array.from(merged.values()).sort((a, b) => b.relevance - a.relevance)
    .slice(0, Math.max(1, Math.min(18, Number(limit) || 9)));
  return { matches, plan: Object.assign(plan, { retries, weak: !matches.length || Number(matches[0].relevance || 0) < 4 }) };
}

function listKnowledgeChat(limit = 80) {
  const rows = getKnowledgeDb().prepare('SELECT id,role,content,sources_json,created_at FROM knowledge_chat ORDER BY id DESC LIMIT ?').all(Math.max(1, Math.min(200, limit)));
  return rows.reverse().map((row) => ({
    id: row.id, role: row.role, content: row.content, createdAt: row.created_at,
    sources: (() => { try { return JSON.parse(row.sources_json); } catch { return []; } })()
  }));
}

function saveKnowledgeChat(role, content, sources) {
  getKnowledgeDb().prepare('INSERT INTO knowledge_chat (role,content,sources_json,created_at) VALUES (?,?,?,?)')
    .run(role, String(content || ''), JSON.stringify(Array.isArray(sources) ? sources : []), new Date().toISOString());
}

function memoryHash(value) {
  return createHash('sha256').update(foldKnowledgeSearchText(value).replace(/\s+/g, ' ').trim()).digest('hex');
}

function memoryKeywords(value) {
  return knowledgeSearchTerms(value).terms.slice(0, 18).join(' ');
}

function memoryTitle(value, kind) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const prefix = kind === 'case' ? 'Hồ sơ' : (kind === 'preference' ? 'Ưu tiên' : (kind === 'decision' ? 'Quyết định' : 'Chỉ dẫn'));
  return (prefix + ': ' + text).slice(0, 140);
}

function upsertAgentMemory(input) {
  const content = cleanExtractedText(input.content || '');
  if (content.length < 4) throw Object.assign(new Error('Nội dung ghi nhớ quá ngắn'), { statusCode: 400 });
  const allowedKinds = new Set(['instruction', 'preference', 'decision', 'case', 'fact']);
  const kind = allowedKinds.has(input.kind) ? input.kind : 'instruction';
  const sourceType = String(input.sourceType || 'manual').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'manual';
  const sourceRef = String(input.sourceRef || '').trim().slice(0, 180);
  const title = String(input.title || memoryTitle(content, kind)).replace(/\s+/g, ' ').trim().slice(0, 160);
  const keywords = memoryKeywords(title + ' ' + content);
  const hash = memoryHash(content);
  const confidence = Math.max(0, Math.min(1, Number(input.confidence == null ? 1 : input.confidence)));
  const importance = Math.max(0, Math.min(1, Number(input.importance == null ? .6 : input.importance)));
  const db = getKnowledgeDb();
  const existing = sourceRef
    ? db.prepare('SELECT * FROM agent_memories WHERE source_type = ? AND source_ref = ?').get(sourceType, sourceRef)
    : db.prepare('SELECT * FROM agent_memories WHERE content_hash = ?').get(hash);
  const now = new Date().toISOString();
  try {
    db.exec('BEGIN');
    let id;
    if (existing) {
      id = Number(existing.id);
      db.prepare(`UPDATE agent_memories SET kind=?,title=?,content=?,keywords=?,confidence=?,importance=?,content_hash=?,consolidated_batch=NULL,updated_at=? WHERE id=?`)
        .run(kind, title, content, keywords, confidence, importance, hash, now, id);
      db.prepare('DELETE FROM agent_memories_fts WHERE memory_id = ?').run(id);
    } else {
      const duplicate = db.prepare('SELECT id FROM agent_memories WHERE content_hash = ?').get(hash);
      if (duplicate) {
        db.exec('ROLLBACK');
        return { memory: db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(duplicate.id), created: false };
      }
      const result = db.prepare(`INSERT INTO agent_memories
        (kind,title,content,keywords,source_type,source_ref,confidence,importance,content_hash,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(kind, title, content, keywords, sourceType, sourceRef, confidence, importance, hash, now, now);
      id = Number(result.lastInsertRowid);
    }
    db.prepare('INSERT INTO agent_memories_fts (title,content,keywords,memory_id) VALUES (?,?,?,?)').run(title, content, keywords, id);
    db.exec('COMMIT');
    return { memory: db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(id), created: !existing };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function listAgentMemories(limit = 80) {
  return getKnowledgeDb().prepare(`SELECT id,kind,title,content,keywords,source_type,source_ref,confidence,importance,
    consolidated_batch,created_at,updated_at FROM agent_memories ORDER BY importance DESC, updated_at DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, Number(limit) || 80)));
}

function listMemoryConsolidations(limit = 12) {
  return getKnowledgeDb().prepare('SELECT id,title,summary,keywords,source_ids_json,created_at FROM memory_consolidations ORDER BY id DESC LIMIT ?')
    .all(Math.max(1, Math.min(50, Number(limit) || 12))).map((item) => Object.assign(item, {
      sourceIds: (() => { try { return JSON.parse(item.source_ids_json); } catch { return []; } })()
    }));
}

function memoryStats() {
  const db = getKnowledgeDb();
  const totals = db.prepare(`SELECT COUNT(*) AS memories,
    SUM(CASE WHEN consolidated_batch IS NULL THEN 1 ELSE 0 END) AS unconsolidated FROM agent_memories`).get();
  const batches = db.prepare('SELECT COUNT(*) AS consolidations FROM memory_consolidations').get();
  return { memories: Number(totals.memories || 0), unconsolidated: Number(totals.unconsolidated || 0), consolidations: Number(batches.consolidations || 0) };
}

function searchAgentMemories(query, limit = 6) {
  const folded = foldKnowledgeSearchText(query);
  const asksMemory = /\b(nho|ghi nho|so thich|uu tien|quyet dinh|ho so cu)\b/.test(folded);
  const search = buildFtsQuery(query);
  const db = getKnowledgeDb();
  if (!search.query) return asksMemory ? listAgentMemories(limit) : [];
  const rows = db.prepare(`SELECT m.*, bm25(agent_memories_fts) AS score FROM agent_memories_fts f
    JOIN agent_memories m ON m.id = CAST(f.memory_id AS INTEGER)
    WHERE agent_memories_fts MATCH ? ORDER BY score LIMIT 40`).all(search.query);
  return rows.map((row) => {
    const haystack = foldKnowledgeSearchText(row.title + ' ' + row.content + ' ' + row.keywords);
    let relevance = Number(row.importance || 0) * 3 + Number(row.confidence || 0) * 2 + Math.max(0, -Number(row.score || 0));
    search.terms.forEach((term) => { if (haystack.includes(foldKnowledgeSearchText(term))) relevance += 2; });
    search.phrases.forEach((phrase) => { if (haystack.includes(foldKnowledgeSearchText(phrase))) relevance += 5; });
    return Object.assign(row, { relevance });
  }).sort((a, b) => b.relevance - a.relevance).slice(0, Math.max(1, Math.min(12, Number(limit) || 6)));
}

function consolidateAgentMemories(force) {
  const db = getKnowledgeDb();
  const pending = db.prepare(`SELECT * FROM agent_memories WHERE consolidated_batch IS NULL
    ORDER BY importance DESC, updated_at ASC LIMIT 12`).all();
  if (!pending.length || (!force && pending.length < 6)) return { created: false, pending: pending.length };
  const groups = new Map();
  pending.forEach((memory) => {
    if (!groups.has(memory.kind)) groups.set(memory.kind, []);
    groups.get(memory.kind).push(memory);
  });
  const now = new Date().toISOString();
  const created = [];
  try {
    db.exec('BEGIN');
    for (const [kind, memories] of groups) {
      const ids = memories.map((memory) => Number(memory.id));
      const title = kind === 'case' ? 'Tổng hợp hồ sơ đã xử lý' : (kind === 'preference' ? 'Tổng hợp ưu tiên của người dùng' : 'Tổng hợp chỉ dẫn và quyết định');
      const summary = memories.map((memory) => '- ' + memory.title + ': ' + memory.content.slice(0, 320)).join('\n');
      const keywords = Array.from(new Set(memories.flatMap((memory) => String(memory.keywords || '').split(/\s+/)).filter(Boolean))).slice(0, 30).join(' ');
      const result = db.prepare('INSERT INTO memory_consolidations (title,summary,keywords,source_ids_json,created_at) VALUES (?,?,?,?,?)')
        .run(title, summary, keywords, JSON.stringify(ids), now);
      const batchId = Number(result.lastInsertRowid);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE agent_memories SET consolidated_batch = ? WHERE id IN (${placeholders})`).run(batchId, ...ids);
      created.push(batchId);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return { created: true, batches: created.length, memoryCount: pending.length, stats: memoryStats() };
}

function deleteAgentMemory(id) {
  const memoryId = Number(id);
  if (!Number.isInteger(memoryId) || memoryId < 1) throw Object.assign(new Error('Mã ký ức không hợp lệ'), { statusCode: 400 });
  const db = getKnowledgeDb();
  const memory = db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(memoryId);
  if (!memory) throw Object.assign(new Error('Không tìm thấy ký ức'), { statusCode: 404 });
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM agent_memories_fts WHERE memory_id = ?').run(memoryId);
    db.prepare('DELETE FROM agent_memories WHERE id = ?').run(memoryId);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return memory;
}

function captureExplicitMemory(question) {
  const folded = foldKnowledgeSearchText(question);
  if (!/(hay nho|ghi nho|tu nay|mac dinh|luon uu tien|khong duoc phep|quy uoc rang)/.test(folded)) return null;
  const kind = /(uu tien|toi thich)/.test(folded) ? 'preference' : (/(quyet dinh|xac nhan)/.test(folded) ? 'decision' : 'instruction');
  return upsertAgentMemory({
    kind,
    content: question,
    sourceType: 'chat',
    sourceRef: 'chat-' + memoryHash(question).slice(0, 20),
    confidence: 1,
    importance: .85
  });
}

function deleteKnowledgeDocument(id) {
  const db = getKnowledgeDb();
  const document = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id);
  if (!document) throw Object.assign(new Error('Không tìm thấy tài liệu trong Tủ tri thức'), { statusCode: 404 });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM knowledge_chunks_fts WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  try { fs.unlinkSync(path.join(KNOWLEDGE_FILES_DIR, document.stored_name)); } catch {}
  return document;
}

async function scanKnowledgeFolder(folder, sourceType, prefix) {
  const results = { added: 0, skipped: 0, errors: [] };
  if (!fs.existsSync(folder)) return results;
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (KNOWLEDGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
      if (files.length >= 500) return;
    }
  }
  walk(folder);
  for (const filePath of files) {
    try {
      const relative = path.relative(folder, filePath).replace(/\\/g, '/');
      const result = await ingestKnowledgeBuffer({
        name: path.basename(filePath), buffer: fs.readFileSync(filePath), sourceType,
        originalPath: (prefix ? prefix + '/' : '') + relative
      });
      if (result.created) results.added++;
      else results.skipped++;
    } catch (error) {
      results.errors.push(path.basename(filePath) + ': ' + error.message);
    }
  }
  return results;
}

function syncExistingDossierMemories() {
  const result = { processed: 0, errors: [] };
  if (!fs.existsSync(DOSSIER_DIR)) return result;
  const folders = fs.readdirSync(DOSSIER_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).slice(0, 500);
  for (const entry of folders) {
    const metadataPath = path.join(DOSSIER_DIR, entry.name, '00-THONG-TIN-HO-SO.json');
    if (!fs.existsSync(metadataPath)) continue;
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const plan = metadata.aiPlan && typeof metadata.aiPlan === 'object' ? metadata.aiPlan : {};
      const data = metadata.data && typeof metadata.data === 'object' ? metadata.data : {};
      const forms = Array.isArray(metadata.forms) ? metadata.forms : [];
      const content = [
        'Mã hồ sơ: ' + (metadata.caseId || entry.name),
        'Tên hồ sơ: ' + (metadata.title || 'Chưa đặt tên'),
        'Trạng thái: ' + (metadata.status || 'archived'),
        'Yêu cầu: ' + (metadata.request || ''),
        'Tóm tắt: ' + (plan.summary || ''),
        'Đơn vị: ' + (data.unit || 'Chưa xác định'),
        'Giá trị: ' + (data.amount || 'Chưa xác định'),
        'Biểu mẫu: ' + (forms.length ? forms.join(', ') : 'Chưa xác định'),
        'Vấn đề cần xác nhận: ' + ([].concat(plan.exceptions || [], plan.requiredConfirmations || []).join('; ') || 'Không có')
      ].join('\n');
      upsertAgentMemory({
        kind: 'case',
        title: 'Hồ sơ ' + (metadata.caseId || entry.name) + ' · ' + (metadata.title || 'Không tên'),
        content,
        sourceType: 'dossier',
        sourceRef: metadata.caseId || entry.name,
        confidence: .95,
        importance: metadata.status === 'complete' ? .9 : .78
      });
      result.processed++;
    } catch (error) {
      result.errors.push(entry.name + ': ' + error.message);
    }
  }
  consolidateAgentMemories(false);
  return result;
}

async function answerKnowledgeQuestion(question, webSearch) {
  const matches = searchKnowledge(question, 9);
  const sources = [];
  const seen = new Set();
  const context = matches.map((match, index) => {
    if (!seen.has(match.documentId)) {
      seen.add(match.documentId);
      sources.push({
        type: 'local', documentId: match.documentId, title: match.name, chunkIndex: match.chunkIndex,
        sourceType: match.sourceType, originalPath: match.originalPath
      });
    }
    return '[NGUỒN NỘI BỘ ' + (index + 1) + ': ' + match.name + ', đoạn ' + (match.chunkIndex + 1) + ']\n' + match.content;
  }).join('\n\n');
  const history = listKnowledgeChat(10).map((item) => (item.role === 'user' ? 'Người dùng: ' : 'AN: ') + item.content).join('\n');
  const input = 'LỊCH SỬ GẦN ĐÂY:\n' + (history || 'Chưa có.') + '\n\nCÂU HỎI MỚI:\n' + question +
    '\n\nDỮ LIỆU TÌM ĐƯỢC TRONG TỦ TRI THỨC:\n' + (context || 'Không tìm thấy đoạn tài liệu nội bộ phù hợp.');
  const result = await callOpenAI({
    input,
    instructions: 'Bạn là AN, trợ lý hỏi đáp dữ liệu độc lập với quy trình công việc. Trả lời bằng tiếng Việt, rõ ràng và trực tiếp. ' +
      'Ưu tiên tuyệt đối dữ liệu trong Tủ tri thức. Khi dùng dữ liệu nội bộ, ghi tên nguồn trong câu trả lời theo dạng [Nguồn: tên tệp]. ' +
      'Không được bịa dữ liệu hoặc khẳng định đã tìm thấy khi ngữ cảnh không có. Nếu không đủ căn cứ, nói rõ chưa tìm thấy trong Tủ tri thức và đề nghị người dùng thêm tài liệu. ' +
      'Chỉ dùng nguồn web cho thông tin bên ngoài hoặc cập nhật khi được bật; phân biệt rõ nguồn web với tài liệu nội bộ. Không tự tạo quy trình hay hồ sơ.',
    reasoning: 'medium', verbosity: 'medium', webSearch: Boolean(webSearch), searchContextSize: 'medium'
  });
  const webSources = (result.citations || []).map((source) => ({ type: 'web', title: source.title, url: source.url }));
  const allSources = sources.concat(webSources);
  saveKnowledgeChat('user', question, []);
  saveKnowledgeChat('assistant', result.text, allSources);
  return { text: result.text, model: result.model, sources: allSources, matches: matches.length, webSearchUsed: Boolean(webSearch) };
}

async function answerKnowledgeQuestionAgentic(question, webSearch) {
  const historyItems = listKnowledgeChat(10);
  let capturedMemory = null;
  try { capturedMemory = captureExplicitMemory(question); } catch {}
  const retrieval = searchKnowledgeAgentic(question, historyItems, 12);
  const matches = retrieval.matches;
  const sources = [];
  const seenDocuments = new Set();
  const seenParents = new Set();
  const contextParts = [];
  let contextLength = 0;
  for (const match of matches) {
    const parentKey = match.documentId + ':' + (match.parentIndex == null ? 'chunk-' + match.chunkIndex : match.parentIndex);
    if (seenParents.has(parentKey)) continue;
    seenParents.add(parentKey);
    if (!seenDocuments.has(match.documentId)) {
      seenDocuments.add(match.documentId);
      sources.push({
        type: 'local', documentId: match.documentId, title: match.name, chunkIndex: match.chunkIndex,
        parentIndex: match.parentIndex, sourceType: match.sourceType, originalPath: match.originalPath
      });
    }
    const content = String(match.parentContent || match.content || '').slice(0, 5200);
    if (!content || contextLength + content.length > 19000) continue;
    contextLength += content.length;
    contextParts.push('[NGUỒN NỘI BỘ: ' + match.name + ', phần ' + (Number(match.parentIndex == null ? match.chunkIndex : match.parentIndex) + 1) + ']\n' + content);
    if (contextParts.length >= 7) break;
  }

  const memories = searchAgentMemories(question, 6);
  const memoryContext = memories.map((memory) => '[KÝ ỨC ' + memory.id + ' - ' + memory.kind + ']\n' + memory.content).join('\n\n');
  const memorySources = memories.map((memory) => ({ type: 'memory', memoryId: Number(memory.id), title: memory.title, sourceType: memory.source_type, sourceRef: memory.source_ref }));
  const foldedQuestion = foldKnowledgeSearchText(question);
  const asksMemory = /\b(nho|ghi nho|so thich|uu tien|quyet dinh|ho so cu)\b/.test(foldedQuestion);
  const consolidationContext = asksMemory ? listMemoryConsolidations(3).map((item) => '[TỔNG HỢP KÝ ỨC: ' + item.title + ']\n' + item.summary).join('\n\n') : '';
  const history = historyItems.slice(-8).map((item) => (item.role === 'user' ? 'Người dùng: ' : 'AN: ') + String(item.content || '').slice(0, 900)).join('\n');
  const queryPlan = retrieval.plan.variants.map((variant, index) => (index + 1) + '. ' + variant).join('\n');
  const input = 'LỊCH SỬ GẦN ĐÂY:\n' + (history || 'Chưa có.') +
    '\n\nCÂU HỎI MỚI:\n' + question +
    '\n\nKẾ HOẠCH TRUY XUẤT ĐÃ THỰC HIỆN:\n' + queryPlan +
    '\n\nDỮ LIỆU TRONG TỦ TRI THỨC:\n' + (contextParts.join('\n\n') || 'Không tìm thấy phần tài liệu nội bộ phù hợp.') +
    '\n\nKÝ ỨC DÀI HẠN CÓ LIÊN QUAN:\n' + (memoryContext || 'Không có ký ức phù hợp.') +
    (consolidationContext ? '\n\nCÁC BẢN TỔNG HỢP KÝ ỨC:\n' + consolidationContext : '') +
    '\n\nTRẠNG THÁI TRUY XUẤT: ' + (retrieval.plan.weak ? 'Kết quả nội bộ còn yếu hoặc chưa đủ.' : 'Có dữ liệu nội bộ phù hợp.') +
    (retrieval.plan.ambiguous ? ' Câu hỏi có thể chưa đủ rõ.' : '');
  const result = await callOpenAI({
    input,
    instructions: 'Bạn là AN, trợ lý dữ liệu của văn phòng AI. Hãy suy luận theo thứ tự: làm rõ ý hỏi từ lịch sử, đối chiếu Tủ tri thức, đối chiếu ký ức dài hạn, rồi mới dùng web nếu được bật. ' +
      'Tài liệu nội bộ là nguồn căn cứ; ký ức chỉ phản ánh sở thích, chỉ dẫn, quyết định hoặc hồ sơ trước đây và không được xem là quy định pháp lý. ' +
      'Khi dùng tài liệu, dẫn [Nguồn: tên tệp]. Khi dùng ký ức, dẫn [Ký ức: tiêu đề]. Không bịa dữ liệu. Nếu kết quả yếu hoặc câu hỏi mơ hồ, nói rõ phần chưa chắc và hỏi đúng một câu để làm rõ. ' +
      'Phân biệt rõ dữ liệu web với dữ liệu nội bộ. Không tự tạo hồ sơ hoặc tuyên bố đã thực hiện hành động ngoài đời thực.',
    reasoning: 'medium', verbosity: 'medium', webSearch: Boolean(webSearch), searchContextSize: 'medium'
  });
  const webSources = (result.citations || []).map((source) => ({ type: 'web', title: source.title, url: source.url }));
  const allSources = sources.concat(memorySources, webSources);
  saveKnowledgeChat('user', question, []);
  saveKnowledgeChat('assistant', result.text, allSources);
  const consolidation = consolidateAgentMemories(false);
  return {
    text: result.text,
    model: result.model,
    sources: allSources,
    matches: matches.length,
    memoryMatches: memories.length,
    memoryCaptured: Boolean(capturedMemory),
    memoryStats: memoryStats(),
    memories: listAgentMemories(100),
    webSearchUsed: Boolean(webSearch),
    retrieval: {
      queryCount: retrieval.plan.variants.length,
      retries: retrieval.plan.retries,
      parentSections: contextParts.length,
      weak: retrieval.plan.weak,
      ambiguous: retrieval.plan.ambiguous
    },
    consolidation
  };
}

function wordDocument(title, body) {
  return '\ufeff<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeHtml(title) +
    '</title><style>body{font-family:"Times New Roman",serif;font-size:14pt;line-height:1.55;margin:2cm;color:#111}' +
    'h1{text-align:center;font-size:18pt}h2{font-size:15pt;margin-top:20px}table{width:100%;border-collapse:collapse}' +
    'td,th{border:1px solid #555;padding:7px;vertical-align:top}th{font-weight:bold}li{margin-bottom:6px}' +
    '.note{border:1px solid #555;padding:10px}.source{font-size:12pt;word-break:break-all}</style></head><body>' + body + '</body></html>';
}

function listToHtml(items) {
  const values = Array.isArray(items) ? items : [];
  return values.length ? '<ol>' + values.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ol>' : '<p>Không có.</p>';
}

const PDF_FONT_CANDIDATES = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'times.ttf'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'segoeui.ttf')
];
let pdfFontPath = null;
let pdfFontResolved = false;

function resolvePdfFontPath() {
  if (!pdfFontResolved) {
    pdfFontResolved = true;
    for (const candidate of PDF_FONT_CANDIDATES) {
      if (fs.existsSync(candidate)) { pdfFontPath = candidate; break; }
    }
  }
  return pdfFontPath;
}

function buildPdf(title, blocks) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const fontPath = resolvePdfFontPath();
  if (fontPath) doc.registerFont('VN', fontPath);
  const fontName = fontPath ? 'VN' : 'Helvetica';
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  function ensureSpace(needed) {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
  }

  function drawTitle(text) {
    ensureSpace(60);
    doc.font(fontName).fontSize(15).fillColor('#111');
    doc.text(String(text || ''), { align: 'center' });
    doc.moveDown(0.7);
  }

  function drawHeading(text) {
    ensureSpace(44);
    doc.font(fontName).fontSize(12.5).fillColor('#111');
    doc.text(String(text || ''));
    doc.moveDown(0.4);
  }

  function drawParagraph(text) {
    doc.font(fontName).fontSize(11).fillColor('#111');
    doc.text(String(text == null ? '' : text), { align: 'left' });
    doc.moveDown(0.4);
  }

  function drawList(items) {
    const values = Array.isArray(items) ? items : [];
    if (!values.length) { drawParagraph('Không có.'); return; }
    doc.font(fontName).fontSize(11).fillColor('#111');
    values.forEach((item, index) => {
      ensureSpace(20);
      doc.text((index + 1) + '. ' + String(item == null ? '' : item), { indent: 16 });
    });
    doc.moveDown(0.4);
  }

  function drawNote(text) {
    ensureSpace(40);
    const value = String(text == null ? '' : text);
    if (!value) return;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const height = doc.heightOfString(value, { width: width - 20 }) + 16;
    ensureSpace(Math.min(height, 200));
    const x = doc.x;
    const y = doc.y;
    doc.rect(x, y, width, height).strokeColor('#555').lineWidth(0.5).stroke();
    doc.font(fontName).fontSize(10.5).fillColor('#333').text(value, x + 10, y + 8, { width: width - 20 });
    doc.y = y + height + 8;
    doc.x = x;
  }

  function drawTable(rows) {
    const values = Array.isArray(rows) ? rows : [];
    if (!values.length) return;
    const colCount = Math.max(1, ...values.map((row) => (Array.isArray(row) ? row.length : 1)));
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidths = [];
    if (colCount === 2) {
      colWidths[0] = Math.floor(usableWidth * 0.3);
      colWidths[1] = usableWidth - colWidths[0];
    } else {
      const width = Math.floor(usableWidth / colCount);
      for (let index = 0; index < colCount; index++) colWidths[index] = width;
    }
    const pad = 6;
    const lineHeight = 14;

    function renderRow(cells) {
      const texts = cells.map((cell) => String(cell == null ? '' : cell));
      const heights = texts.map((text, col) => {
        const innerWidth = Math.max(10, colWidths[col] - pad * 2);
        return Math.max(lineHeight, doc.font(fontName).fontSize(11).heightOfString(text, { width: innerWidth }) + pad * 2);
      });
      const rowHeight = Math.max(...heights);
      ensureSpace(Math.min(rowHeight, 260));
      const startX = doc.x;
      const y = doc.y;
      let x = startX;
      for (let col = 0; col < colCount; col++) {
        doc.rect(x, y, colWidths[col], rowHeight).strokeColor('#777').lineWidth(0.5).stroke();
        doc.font(fontName).fontSize(11).fillColor(col === 0 && colCount === 2 ? '#111' : '#111');
        doc.text(texts[col], x + pad, y + pad, { width: Math.max(10, colWidths[col] - pad * 2) });
        x += colWidths[col];
      }
      doc.x = startX;
      doc.y = y + rowHeight;
    }

    values.forEach((row) => renderRow(Array.isArray(row) ? row : [row]));
    doc.moveDown(0.4);
  }

  doc.font(fontName).fontSize(11).fillColor('#111');
  drawTitle(title);
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block) continue;
    switch (block.kind) {
      case 'h1': drawTitle(block.text); break;
      case 'h2': drawHeading(block.text); break;
      case 'p': drawParagraph(block.text); break;
      case 'list': drawList(block.items); break;
      case 'table': drawTable(block.rows); break;
      case 'note': drawNote(block.text); break;
      default: drawParagraph(block.text); break;
    }
  }
  doc.end();
  return done;
}

function dossierPdfBlocks(input, plan, data, forms, tasks) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  return [
    { kind: 'h1', text: 'BỘ HỒ SƠ AI - ' + (input.caseId || '') },
    {
      kind: 'table', rows: [
        ['Yêu cầu', input.request],
        ['Tên hồ sơ', input.title || plan.title],
        ['Tóm tắt AI', plan.summary || ''],
        ['Giá trị dự kiến', data.amount || ''],
        ['Đơn vị đề nghị', data.unit || ''],
        ['Mô hình AI', input.model || '']
      ]
    },
    { kind: 'h2', text: 'Biểu mẫu dự kiến' },
    { kind: 'list', items: forms.map((code) => 'Mẫu ' + code + '.QT.MSSC') },
    { kind: 'h2', text: 'Quy trình xử lý' },
    { kind: 'list', items: taskList.map((task) => (task.title || '') + ': ' + (task.detail || '') + ' (' + (task.owner === 'human' ? 'Cần người xác nhận' : 'AI thực hiện') + ')') },
    { kind: 'h2', text: 'Nội dung cần xác nhận' },
    { kind: 'list', items: plan.requiredConfirmations },
    { kind: 'note', text: 'AI chuẩn bị và rà soát hồ sơ. Chữ ký, phê duyệt pháp lý, nghiệm thu thực tế và giao dịch ngân hàng/Kho bạc vẫn phải do người có thẩm quyền thực hiện.' }
  ];
}

function buildClientReportPdf(body) {
  const title = String(body.title || 'BÁO CÁO').slice(0, 200);
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 40).map((row) => (Array.isArray(row)
    ? row.slice(0, 4).map((cell) => String(cell == null ? '' : cell).slice(0, 2000))
    : [String(row == null ? '' : row).slice(0, 2000)])) : [];
  const sections = Array.isArray(body.sections) ? body.sections.slice(0, 20).map((section) => ({
    heading: String(section && section.heading || '').slice(0, 200),
    items: (Array.isArray(section && section.items) ? section.items : []).slice(0, 60).map((item) => String(item == null ? '' : item).slice(0, 2000))
  })) : [];
  const note = String(body.note || '').slice(0, 4000);
  const blocks = [{ kind: 'h1', text: title }, { kind: 'table', rows }];
  sections.forEach((section) => {
    if (section.heading) blocks.push({ kind: 'h2', text: section.heading });
    if (section.items.length) blocks.push({ kind: 'list', items: section.items });
  });
  if (note) blocks.push({ kind: 'note', text: note });
  return buildPdf(title, blocks);
}

function extractOpenAIText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text) return payload.output_text;
  const chunks = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (item.type !== 'message') continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n');
}

function extractOpenAICitations(payload) {
  const found = [];
  const seen = new Set();
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (item.type === 'message') {
      for (const part of Array.isArray(item.content) ? item.content : []) {
        for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
          if (annotation.type === 'url_citation' && annotation.url && !seen.has(annotation.url)) {
            seen.add(annotation.url);
            found.push({ title: annotation.title || annotation.url, url: annotation.url });
          }
        }
      }
    }
    if (item.type === 'web_search_call' && item.action && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        if (source.url && !seen.has(source.url)) {
          seen.add(source.url);
          found.push({ title: source.title || source.url, url: source.url });
        }
      }
    }
  }
  return found;
}

function aiAnalysisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      kind: { type: 'string', enum: ['purchase', 'repair', 'advance', 'payment'] },
      amount: { type: 'number' },
      quantity: { type: 'number' },
      unit: { type: 'string' },
      invoiceCount: { type: 'integer' },
      noThreeQuotes: { type: 'boolean' },
      noTreasuryControl: { type: 'boolean' },
      selfProduced: { type: 'boolean' },
      urgent: { type: 'boolean' },
      confidence: { type: 'number' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
      summary: { type: 'string' },
      missing: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } },
      fieldEvidence: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string' },
            value: { type: 'string' },
            source: { type: 'string' },
            confidence: { type: 'number' },
            note: { type: 'string' }
          },
          required: ['field', 'value', 'source', 'confidence', 'note']
        }
      },
      recommendedForms: { type: 'array', items: { type: 'string' } },
      quoteFindings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            item: { type: 'string' },
            vendor: { type: 'string' },
            price: { type: 'string' },
            unit: { type: 'string' },
            url: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['item', 'vendor', 'price', 'unit', 'url', 'note']
        }
      },
      exceptions: { type: 'array', items: { type: 'string' } },
      requiredConfirmations: { type: 'array', items: { type: 'string' } },
      nextQuestion: { type: 'string' }
    },
    required: [
      'title', 'kind', 'amount', 'quantity', 'unit', 'invoiceCount', 'noThreeQuotes',
      'noTreasuryControl', 'selfProduced', 'urgent', 'confidence', 'riskLevel', 'summary',
      'missing', 'assumptions', 'fieldEvidence', 'recommendedForms',
      'quoteFindings', 'exceptions', 'requiredConfirmations', 'nextQuestion'
    ]
  };
}

function officeLifeDialogueSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      lines: {
        type: 'array', minItems: 10, maxItems: 18,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            person: { type: 'string', enum: ['AN', 'HẢI', 'LONG', 'MINH', 'NAM', 'LÂM', 'PHÚC'] },
            text: { type: 'string' }
          },
          required: ['person', 'text']
        }
      }
    },
    required: ['title', 'summary', 'lines']
  };
}

async function callOpenAI(options) {
  const config = loadAiConfig();
  if (!config.apiKey) throw Object.assign(new Error('Chưa cấu hình OpenAI API key'), { statusCode: 400 });

  const apiMode = normalizeApiMode(config.apiMode);
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const requestBody = apiMode === 'chat-completions' ? {
    model: config.model || DEFAULT_AI_CONFIG.model,
    messages: [
      { role: 'system', content: options.instructions || '' },
      { role: 'user', content: options.input || '' }
    ],
    reasoning_effort: options.reasoning || 'medium'
  } : {
    model: config.model || DEFAULT_AI_CONFIG.model,
    input: options.input,
    instructions: options.instructions,
    reasoning: { effort: options.reasoning || 'medium' },
    store: false,
    text: { verbosity: options.verbosity || 'medium' }
  };

  if (options.schema) {
    if (apiMode === 'chat-completions') {
      requestBody.response_format = {
        type: 'json_schema',
        json_schema: { name: options.schemaName || 'structured_result', strict: true, schema: options.schema }
      };
    } else {
      requestBody.text.format = {
        type: 'json_schema',
        name: options.schemaName || 'structured_result',
        strict: true,
        schema: options.schema
      };
    }
  }
  if (apiMode === 'responses' && options.webSearch && config.webSearch !== false) {
    requestBody.tools = [{ type: 'web_search', search_context_size: options.searchContextSize || 'medium' }];
    requestBody.include = ['web_search_call.action.sources'];
  }
  if (options.maxOutputTokens) requestBody[apiMode === 'chat-completions' ? 'max_completion_tokens' : 'max_output_tokens'] = options.maxOutputTokens;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 180000);
  let apiResponse;
  try {
    apiResponse = await fetch(baseUrl + (apiMode === 'chat-completions' ? '/chat/completions' : '/responses'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    const message = error.name === 'AbortError' ? 'API phản hồi quá thời gian chờ' : 'Không kết nối được API';
    throw Object.assign(new Error(message), { statusCode: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const raw = await apiResponse.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }
  if (!apiResponse.ok) {
    const apiMessage = payload && payload.error && payload.error.message ? payload.error.message : 'API trả về lỗi ' + apiResponse.status;
    throw Object.assign(new Error(apiMessage), { statusCode: apiResponse.status === 401 ? 401 : 502 });
  }

  const text = apiMode === 'chat-completions'
    ? (((payload.choices || [])[0] || {}).message || {}).content || ''
    : extractOpenAIText(payload);
  return {
    responseId: payload.id || '',
    model: config.model || DEFAULT_AI_CONFIG.model,
    upstreamModel: payload.model || '',
    text,
    citations: apiMode === 'responses' ? extractOpenAICitations(payload) : [],
    raw: payload
  };
}

function quoteTable(plan) {
  const quotes = plan && Array.isArray(plan.quoteFindings) ? plan.quoteFindings : [];
  if (!quotes.length) return '<p>Chưa có nguồn giá trực tuyến đủ căn cứ. Cần bổ sung báo giá thực tế hoặc tiếp tục trao đổi với AI.</p>';
  return '<table><thead><tr><th>Hàng hóa/dịch vụ</th><th>Nhà cung cấp</th><th>Giá</th><th>Đơn vị</th><th>Nguồn</th><th>Ghi chú</th></tr></thead><tbody>' +
    quotes.map((quote) => '<tr><td>' + escapeHtml(quote.item) + '</td><td>' + escapeHtml(quote.vendor) +
      '</td><td>' + escapeHtml(quote.price) + '</td><td>' + escapeHtml(quote.unit) + '</td><td class="source">' +
      escapeHtml(quote.url) + '</td><td>' + escapeHtml(quote.note) + '</td></tr>').join('') + '</tbody></table>';
}

function citationHtml(citations) {
  const values = Array.isArray(citations) ? citations : [];
  return values.length ? '<ol>' + values.map((source) => '<li><b>' + escapeHtml(source.title) + '</b><br><span class="source">' +
    escapeHtml(source.url) + '</span></li>').join('') + '</ol>' : '<p>Không có nguồn web được trích dẫn.</p>';
}

function listDossierFiles(folder, caseId) {
  const files = [];
  function walk(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, relative);
      else files.push({
        name: relative,
        size: fs.statSync(full).size,
        url: '/api/dossier-file?id=' + encodeURIComponent(caseId) + '&name=' + encodeURIComponent(relative)
      });
    }
  }
  if (fs.existsSync(folder)) walk(folder, '');
  return files.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

async function writeDossier(input) {
  const caseId = safeCaseId(input.caseId);
  const folder = path.join(DOSSIER_DIR, caseId);
  const formFolder = path.join(folder, 'BIEU-MAU');
  if (fs.existsSync(formFolder)) fs.rmSync(formFolder, { recursive: true, force: true });
  fs.mkdirSync(formFolder, { recursive: true });

  const plan = input.aiPlan && typeof input.aiPlan === 'object' ? input.aiPlan : {};
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const forms = Array.isArray(input.forms) ? input.forms.map(String).filter((code) => /^\d{2}$/.test(code)) : [];
  const citations = Array.isArray(input.citations) ? input.citations : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const events = Array.isArray(input.events) ? input.events.slice(0, 160) : [];

  const metadata = {
    caseId,
    title: input.title || plan.title || '',
    request: input.request || '',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: input.status || 'processing',
    revisionNumber: Number(input.revisionNumber || 1),
    revisionHistory: Array.isArray(input.revisionHistory) ? input.revisionHistory.slice(0, 30) : [],
    model: input.model || '',
    webSearchUsed: Boolean(input.webSearchUsed),
    data,
    forms,
    tasks,
    aiPlan: plan,
    citations,
    events
  };
  fs.writeFileSync(path.join(folder, '00-THONG-TIN-HO-SO.json'), JSON.stringify(metadata, null, 2), 'utf8');
  const revisionFolder = path.join(folder, 'PHIEN-BAN');
  fs.mkdirSync(revisionFolder, { recursive: true });
  fs.writeFileSync(path.join(revisionFolder, 'PHIEN-BAN-' + String(metadata.revisionNumber).padStart(2, '0') + '.json'), JSON.stringify(metadata, null, 2), 'utf8');

  const taskHtml = tasks.length ? '<ol>' + tasks.map((task) => '<li><b>' + escapeHtml(task.title) + ':</b> ' +
    escapeHtml(task.detail) + ' (' + escapeHtml(task.owner === 'human' ? 'Cần người xác nhận' : 'AI thực hiện') + ')</li>').join('') + '</ol>' : '<p>Chưa có.</p>';
  const formHtml = forms.length ? '<ol>' + forms.map((code) => '<li>Mẫu ' + escapeHtml(code) + '.QT.MSSC</li>').join('') + '</ol>' : '<p>Chưa xác định.</p>';
  const reportBody = '<h1>BỘ HỒ SƠ AI - ' + escapeHtml(caseId) + '</h1>' +
    '<table><tr><td><b>Yêu cầu</b></td><td>' + escapeHtml(input.request) + '</td></tr>' +
    '<tr><td><b>Tên hồ sơ</b></td><td>' + escapeHtml(input.title || plan.title) + '</td></tr>' +
    '<tr><td><b>Tóm tắt AI</b></td><td>' + escapeHtml(plan.summary || '') + '</td></tr>' +
    '<tr><td><b>Giá trị dự kiến</b></td><td>' + escapeHtml(data.amount || '') + '</td></tr>' +
    '<tr><td><b>Đơn vị đề nghị</b></td><td>' + escapeHtml(data.unit || '') + '</td></tr>' +
    '<tr><td><b>Mô hình AI</b></td><td>' + escapeHtml(input.model || '') + '</td></tr></table>' +
    '<h2>Biểu mẫu dự kiến</h2>' + formHtml + '<h2>Quy trình xử lý</h2>' + taskHtml +
    '<h2>Nội dung cần xác nhận</h2>' + listToHtml(plan.requiredConfirmations) +
    '<p class="note"><b>Lưu ý:</b> AI chuẩn bị và rà soát hồ sơ. Chữ ký, phê duyệt pháp lý, nghiệm thu thực tế và giao dịch ngân hàng/Kho bạc vẫn phải do người có thẩm quyền thực hiện.</p>';
  fs.writeFileSync(path.join(folder, '01-BAO-CAO-TONG-HOP-AI.doc'), wordDocument('Báo cáo tổng hợp AI', reportBody), 'utf8');

  const quotesBody = '<h1>RÀ SOÁT BÁO GIÁ VÀ NGUỒN THAM KHẢO</h1><p>Thời điểm tạo: ' +
    escapeHtml(new Date().toLocaleString('vi-VN')) + '</p>' + quoteTable(plan) + '<h2>Nguồn web được trích dẫn</h2>' + citationHtml(citations) +
    '<p class="note">Giá trên không gian mạng chỉ là nguồn tham khảo. Cần đối chiếu cấu hình, thuế, vận chuyển, bảo hành, thời điểm báo giá và hồ sơ báo giá chính thức.</p>';
  fs.writeFileSync(path.join(folder, '02-RA-SOAT-BAO-GIA-VA-NGUON.doc'), wordDocument('Rà soát báo giá', quotesBody), 'utf8');

  const exceptionBody = '<h1>VẤN ĐỀ ĐẶC THÙ VÀ NỘI DUNG CẦN TRAO ĐỔI</h1><h2>Điểm đặc thù</h2>' +
    listToHtml(plan.exceptions) + '<h2>Nội dung cần xác nhận</h2>' + listToHtml(plan.requiredConfirmations) +
    '<h2>Câu hỏi tiếp theo của AI</h2><p>' + escapeHtml(plan.nextQuestion || 'Không có.') + '</p>';
  fs.writeFileSync(path.join(folder, '03-VAN-DE-DAC-THU-VA-CAN-XAC-NHAN.doc'), wordDocument('Vấn đề đặc thù', exceptionBody), 'utf8');

  const eventBody = '<h1>NHẬT KÝ XỬ LÝ HỒ SƠ</h1>' + (events.length ? events.map((event, index) => '<h2>' +
    escapeHtml(String(index + 1) + '. ' + (event.type || 'Hệ thống')) + '</h2><p>' + escapeHtml(event.message || '') + '</p><p><i>' +
    escapeHtml(event.createdAt || '') + '</i></p>').join('') : '<p>Chưa có sự kiện.</p>');
  fs.writeFileSync(path.join(folder, '05-NHAT-KY-XU-LY-HO-SO.doc'), wordDocument('Nhật ký xử lý hồ sơ', eventBody), 'utf8');

  try {
    fs.writeFileSync(path.join(folder, '01-BAO-CAO-TONG-HOP-AI.pdf'),
      await buildPdf('Báo cáo tổng hợp AI', dossierPdfBlocks(input, plan, data, forms, tasks)));
    const quotes = Array.isArray(plan.quoteFindings) ? plan.quoteFindings : [];
    const quoteItems = quotes.length ? quotes.map((quote) => (quote.item || '') + ' (' + (quote.vendor || '') + ')\n' +
      'Giá: ' + (quote.price || '') + ' · Đơn vị: ' + (quote.unit || '') + '\nNguồn: ' + (quote.url || '') +
      (quote.note ? '\nGhi chú: ' + quote.note : '')) : [];
    const citationItems = citations.map((source) => (source.title || '') + (source.url ? ' — ' + source.url : ''));
    fs.writeFileSync(path.join(folder, '02-RA-SOAT-BAO-GIA-VA-NGUON.pdf'), await buildPdf('Rà soát báo giá', [
      { kind: 'h1', text: 'RÀ SOÁT BÁO GIÁ VÀ NGUỒN THAM KHẢO' },
      { kind: 'p', text: 'Thời điểm tạo: ' + new Date().toLocaleString('vi-VN') },
      { kind: 'h2', text: 'Kết quả rà soát báo giá' },
      { kind: 'list', items: quoteItems },
      { kind: 'h2', text: 'Nguồn web được trích dẫn' },
      { kind: 'list', items: citationItems },
      { kind: 'note', text: 'Giá trên không gian mạng chỉ là nguồn tham khảo. Cần đối chiếu cấu hình, thuế, vận chuyển, bảo hành, thời điểm báo giá và hồ sơ báo giá chính thức.' }
    ]));
    fs.writeFileSync(path.join(folder, '03-VAN-DE-DAC-THU-VA-CAN-XAC-NHAN.pdf'), await buildPdf('Vấn đề đặc thù', [
      { kind: 'h1', text: 'VẤN ĐỀ ĐẶC THÙ VÀ NỘI DUNG CẦN TRAO ĐỔI' },
      { kind: 'h2', text: 'Điểm đặc thù' },
      { kind: 'list', items: plan.exceptions },
      { kind: 'h2', text: 'Nội dung cần xác nhận' },
      { kind: 'list', items: plan.requiredConfirmations },
      { kind: 'h2', text: 'Câu hỏi tiếp theo của AI' },
      { kind: 'p', text: plan.nextQuestion || 'Không có.' }
    ]));
    fs.writeFileSync(path.join(folder, '05-NHAT-KY-XU-LY-HO-SO.pdf'), await buildPdf('Nhật ký xử lý hồ sơ', [
      { kind: 'h1', text: 'NHẬT KÝ XỬ LÝ HỒ SƠ' },
      { kind: 'list', items: events.map((event) => (event.createdAt || '') + ' · ' + (event.type || 'Hệ thống') + ': ' + (event.message || '')) }
    ]));
  } catch (error) {
    console.warn('Không tạo được bản PDF cho bộ hồ sơ:', error.message);
  }

  fs.writeFileSync(path.join(folder, 'HUONG-DAN.txt'),
    'BỘ HỒ SƠ: ' + caseId + '\r\n\r\n' +
    '1. Mở các file .doc bằng Microsoft Word hoặc file .pdf để kiểm tra và chỉnh sửa.\r\n' +
    '2. Thư mục BIEU-MAU chứa bản sao các mẫu Word được đề xuất.\r\n' +
    '3. Đối chiếu nguồn báo giá, văn bản pháp lý và thông tin thực tế trước khi ký.\r\n' +
    '4. Chữ ký, phê duyệt, nghiệm thu và thanh toán thực tế không được AI tự thực hiện.\r\n', 'utf8');

  for (const code of forms) {
    const source = path.join(FORM_DIR, 'Mẫu ' + code + '.QT.MSSC.docx');
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(formFolder, path.basename(source)));
  }

  try {
    const caseMemory = [
      'Mã hồ sơ: ' + caseId,
      'Tên hồ sơ: ' + (metadata.title || 'Chưa đặt tên'),
      'Trạng thái: ' + metadata.status,
      'Yêu cầu: ' + (metadata.request || ''),
      'Tóm tắt: ' + (plan.summary || ''),
      'Đơn vị: ' + (data.unit || 'Chưa xác định'),
      'Giá trị: ' + (data.amount || 'Chưa xác định'),
      'Biểu mẫu: ' + (forms.length ? forms.join(', ') : 'Chưa xác định'),
      'Vấn đề cần xác nhận: ' + ([].concat(plan.exceptions || [], plan.requiredConfirmations || []).join('; ') || 'Không có')
    ].join('\n');
    upsertAgentMemory({
      kind: 'case',
      title: 'Hồ sơ ' + caseId + ' · ' + (metadata.title || 'Không tên'),
      content: caseMemory,
      sourceType: 'dossier',
      sourceRef: caseId,
      confidence: .95,
      importance: metadata.status === 'complete' ? .9 : .72
    });
    consolidateAgentMemories(false);
  } catch (error) {
    console.warn('Không cập nhật được ký ức hồ sơ:', error.message);
  }

  return {
    caseId,
    folderPath: folder,
    files: listDossierFiles(folder, caseId),
    downloadUrl: 'api/dossiers/' + encodeURIComponent(caseId) + '/download'
  };
}

async function writeInteraction(caseId, interactions) {
  const safeId = safeCaseId(caseId);
  const folder = path.join(DOSSIER_DIR, safeId);
  if (!fs.existsSync(folder)) throw Object.assign(new Error('Không tìm thấy thư mục hồ sơ'), { statusCode: 404 });
  const values = Array.isArray(interactions) ? interactions : [];
  const rows = values.map((item, index) =>
    '<h2>Lượt ' + (index + 1) + '</h2><p><b>Bạn:</b> ' + escapeHtml(item.question) + '</p><p><b>AI:</b> ' +
    escapeHtml(item.answer) + '</p>' + citationHtml(item.citations)).join('');
  fs.writeFileSync(path.join(folder, '04-TRAO-DOI-TIEP-VOI-AI.doc'), wordDocument('Trao đổi tiếp với AI', '<h1>LỊCH SỬ TRAO ĐỔI AI</h1>' + rows), 'utf8');
  try {
    const items = values.map((item, index) => {
      const citationsText = (Array.isArray(item.citations) ? item.citations : [])
        .map((source) => source.url || source.title || '').filter(Boolean).join('; ');
      return 'Lượt ' + (index + 1) + ' — Bạn: ' + (item.question || '') + ' · AI: ' + (item.answer || '') +
        (citationsText ? ' · Nguồn: ' + citationsText : '');
    });
    fs.writeFileSync(path.join(folder, '04-TRAO-DOI-TIEP-VOI-AI.pdf'),
      await buildPdf('Trao đổi tiếp với AI', [{ kind: 'h1', text: 'LỊCH SỬ TRAO ĐỔI AI' }, { kind: 'list', items }]));
  } catch (error) {
    console.warn('Không tạo được bản PDF trao đổi:', error.message);
  }
  return { caseId: safeId, files: listDossierFiles(folder, safeId), downloadUrl: 'api/dossiers/' + encodeURIComponent(safeId) + '/download' };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xFFFFFFFF;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xFF] ^ (value >>> 8);
  return (value ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31),
    date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
  };
}

function buildZip(folder) {
  const entries = [];
  function walk(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = (prefix ? prefix + '/' : '') + entry.name;
      if (entry.isDirectory()) walk(full, relative);
      else entries.push({ name: relative.replace(/\\/g, '/'), data: fs.readFileSync(full), date: fs.statSync(full).mtime });
    }
  }
  walk(folder, '');

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const stamp = dosDateTime(entry.date);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuffer, end]);
}

function sendDownload(response, fileName, content, contentType) {
  response.writeHead(200, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Length': content.length,
    'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(fileName),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(content);
}

async function handleApi(request, response, requestUrl) {
  const pathname = requestUrl.pathname;

  if (pathname === '/api/status' && request.method === 'GET') {
    sendJson(response, 200, { app: 'van-phong-ai-local', ready: true, port: PORT, ai: publicAiConfig(loadAiConfig()) });
    return true;
  }

  if (pathname === '/api/reminders') {
    if (request.method === 'GET') {
      sendJson(response, 200, {
        reminders: listReminders({
          status: requestUrl.searchParams.get('status') || 'all',
          from: requestUrl.searchParams.get('from') || '',
          to: requestUrl.searchParams.get('to') || ''
        }),
        notifications: listPendingReminderDeliveries()
      });
    } else if (request.method === 'POST') {
      sendJson(response, 201, { reminder: createReminder(await readJsonBody(request)), notifications: listPendingReminderDeliveries() });
    } else sendError(response, 405, 'Method not allowed');
    return true;
  }

  if (pathname === '/api/reminders/notifications' && request.method === 'GET') {
    sendJson(response, 200, { notifications: listPendingReminderDeliveries() });
    return true;
  }

  const reminderNotificationMatch = pathname.match(/^\/api\/reminders\/notifications\/(\d+)\/(acknowledge|snooze)$/);
  if (reminderNotificationMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    const delivery = reminderNotificationMatch[2] === 'snooze'
      ? snoozeReminderDelivery(reminderNotificationMatch[1], body.minutes)
      : acknowledgeReminderDelivery(reminderNotificationMatch[1]);
    sendJson(response, 200, { delivery, notifications: listPendingReminderDeliveries() });
    return true;
  }

  const reminderMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
  if (reminderMatch) {
    const id = decodeURIComponent(reminderMatch[1]);
    if (request.method === 'GET') {
      const reminder = getReminder(id);
      if (!reminder) throw Object.assign(new Error('Không tìm thấy lịch nhắc'), { statusCode: 404 });
      sendJson(response, 200, { reminder });
    } else if (request.method === 'PATCH') {
      sendJson(response, 200, { reminder: updateReminder(id, await readJsonBody(request)) });
    } else if (request.method === 'DELETE') {
      sendJson(response, 200, { reminder: setReminderStatus(id, 'cancelled') });
    } else sendError(response, 405, 'Method not allowed');
    return true;
  }

  const reminderActionMatch = pathname.match(/^\/api\/reminders\/([^/]+)\/(complete|activate|cancel)$/);
  if (reminderActionMatch && request.method === 'POST') {
    const statuses = { complete: 'completed', activate: 'active', cancel: 'cancelled' };
    sendJson(response, 200, { reminder: setReminderStatus(decodeURIComponent(reminderActionMatch[1]), statuses[reminderActionMatch[2]]) });
    return true;
  }

  if (pathname === '/api/ai/config') {
    if (request.method === 'GET') sendJson(response, 200, publicAiConfig(loadAiConfig()));
    else if (request.method === 'POST') sendJson(response, 200, publicAiConfig(saveAiConfig(await readJsonBody(request))));
    else sendError(response, 405, 'Method not allowed');
    return true;
  }

  if (pathname === '/api/ai/skills' && request.method === 'GET') {
    sendJson(response, 200, { source: 'alirezarezvani/claude-skills', skills: listSkills() });
    return true;
  }

  if (pathname === '/api/openwork/capabilities' && request.method === 'GET') {
    const query = requestUrl.searchParams.get('query') || requestUrl.searchParams.get('q') || '';
    const limit = requestUrl.searchParams.get('limit') || 20;
    sendJson(response, 200, { protocol: 'openwork-local-v1', capabilities: query ? searchCapabilities(query, limit) : listCapabilities() });
    return true;
  }

  if (pathname === '/api/openwork/capabilities/execute' && request.method === 'POST') {
    const envelope = await readJsonBody(request);
    const name = String(envelope.name || envelope.capability || '').trim();
    const capability = getCapability(name);
    if (!capability) throw Object.assign(new Error('Capability khong ton tai hoac chua duoc cap quyen'), { statusCode: 404 });
    const input = envelope.input && typeof envelope.input === 'object' ? envelope.input : envelope.arguments && typeof envelope.arguments === 'object' ? envelope.arguments : envelope;
    if (capability.effects.confirmation && input.confirm !== true) {
      sendJson(response, 409, { ok: false, confirmationRequired: true, capability: name, message: 'Capability nay can confirm: true truoc khi tao du lieu.' });
      return true;
    }
    let result;
    if (name === 'skills.list') {
      result = { skills: listSkills() };
    } else if (name === 'knowledge.search') {
      const query = String(input.query || '').trim();
      if (query.length < 2) throw Object.assign(new Error('query phai co it nhat 2 ky tu'), { statusCode: 400 });
      result = { query, results: searchKnowledge(query, Math.max(1, Math.min(50, Number(input.limit) || 15))) };
    } else if (name === 'knowledge.ask') {
      const question = String(input.question || '').trim();
      if (question.length < 2) throw Object.assign(new Error('question phai co it nhat 2 ky tu'), { statusCode: 400 });
      result = await answerKnowledgeQuestionAgentic(question, Boolean(input.webSearch));
    } else if (name === 'reminders.list') {
      result = { reminders: listReminders({ status: input.status || 'all', from: input.from || '', to: input.to || '' }), notifications: listPendingReminderDeliveries() };
    } else if (name === 'reminders.create') {
      result = { reminder: createReminder(input), notifications: listPendingReminderDeliveries() };
    } else if (name === 'dossier.create_draft') {
      result = await writeDossier(input);
    } else {
      throw Object.assign(new Error('Capability chua co bo xu ly'), { statusCode: 501 });
    }
    sendJson(response, 200, { ok: true, capability: name, result });
    return true;
  }

  if (pathname === '/api/office-life' && request.method === 'GET') {
    sendJson(response, 200, officeLifeSnapshot());
    return true;
  }

  if (pathname === '/api/office-life/sync' && request.method === 'POST') {
    sendJson(response, 200, syncOfficeLife(await readJsonBody(request, 2 * 1024 * 1024)));
    return true;
  }

  if (pathname === '/api/office-life/dialogue' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const hook = body && body.hook && typeof body.hook === 'object' ? body.hook : {};
    const participants = Array.isArray(hook.participants) ? hook.participants.slice(0, 7) : [];
    if (!hook.kind || participants.length < 2) throw Object.assign(new Error('Mầm câu chuyện chưa đủ ngữ cảnh'), { statusCode: 400 });
    const result = await callOpenAI({
      input: JSON.stringify({
        kind: officeLifeText(hook.kind, 50), title: officeLifeText(hook.title, 180),
        participants, causes: Array.isArray(hook.causes) ? hook.causes.slice(-12) : [],
        relationships: body.relationships || [], people: body.people || {}, office: body.office || {}
      }),
      instructions: 'Viết một cảnh hội thoại văn phòng có diễn biến đầy đủ từ 10 đến 18 lượt thoại. Chỉ dùng các nhân vật được cung cấp. Cảnh phải có: mở vấn đề, hỏi để làm rõ, trao đổi dữ liệu, ít nhất một ý kiến phản biện hoặc rủi ro, phân công việc tiếp theo và kết luận. Các nhân vật phải phản hồi trực tiếp ý vừa được nói, không tạo chuỗi phát biểu độc lập. Mỗi lượt chỉ 1-2 câu ngắn, tự nhiên và bám sát nguyên nhân, trạng thái, quan hệ, ký ức cùng công việc trong JSON. Không tự tạo quyết định pháp lý; không tuyên bố AI hay nhân viên đã ký, phê duyệt, nghiệm thu, chuyển tiền hoặc thanh toán. Với các bước này chỉ được nói đang chuẩn bị hoặc chờ người có thẩm quyền. Chỉ trả về cấu trúc JSON yêu cầu.',
      reasoning: 'low', verbosity: 'low', maxOutputTokens: 1800, timeoutMs: 60000,
      schema: officeLifeDialogueSchema(), schemaName: 'office_life_scene'
    });
    let scene;
    try { scene = JSON.parse(result.text); }
    catch { throw Object.assign(new Error('AI trả về cảnh văn phòng không đúng cấu trúc'), { statusCode: 502 }); }
    sendJson(response, 200, { scene, model: result.model, responseId: result.responseId });
    return true;
  }

  if (pathname === '/api/ai/test' && request.method === 'POST') {
    const result = await callOpenAI({
      input: 'Trả lời đúng một từ: OK',
      instructions: 'Bạn là phép thử kết nối API. Chỉ trả lời OK.',
      reasoning: 'none',
      verbosity: 'low',
      maxOutputTokens: 32,
      timeoutMs: 60000
    });
    sendJson(response, 200, { ok: true, model: result.model, text: result.text });
    return true;
  }

  if (pathname === '/api/knowledge/status' && request.method === 'GET') {
    sendJson(response, 200, {
      stats: Object.assign(knowledgeStats(), memoryStats()),
      documents: listKnowledgeDocuments(),
      memories: listAgentMemories(100),
      consolidations: listMemoryConsolidations(12),
      supportedExtensions: Array.from(KNOWLEDGE_EXTENSIONS)
    });
    return true;
  }

  if (pathname === '/api/memory' && request.method === 'GET') {
    sendJson(response, 200, { stats: memoryStats(), memories: listAgentMemories(150), consolidations: listMemoryConsolidations(20) });
    return true;
  }

  if (pathname === '/api/memory' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const result = upsertAgentMemory({
      kind: body.kind,
      title: body.title,
      content: body.content,
      sourceType: 'manual',
      sourceRef: body.sourceRef || '',
      confidence: 1,
      importance: body.importance == null ? .75 : body.importance
    });
    sendJson(response, result.created ? 201 : 200, { created: result.created, memory: result.memory, stats: memoryStats(), memories: listAgentMemories(100) });
    return true;
  }

  if (pathname === '/api/memory/consolidate' && request.method === 'POST') {
    const result = consolidateAgentMemories(true);
    sendJson(response, 200, Object.assign({}, result, { stats: memoryStats(), memories: listAgentMemories(100), consolidations: listMemoryConsolidations(12) }));
    return true;
  }

  const memoryDeleteMatch = pathname.match(/^\/api\/memory\/(\d+)$/);
  if (memoryDeleteMatch && request.method === 'DELETE') {
    deleteAgentMemory(memoryDeleteMatch[1]);
    sendJson(response, 200, { deleted: true, stats: memoryStats(), memories: listAgentMemories(100), consolidations: listMemoryConsolidations(12) });
    return true;
  }

  if (pathname === '/api/knowledge/documents' && request.method === 'POST') {
    const body = await readJsonBody(request, 18 * 1024 * 1024);
    let buffer;
    try { buffer = Buffer.from(String(body.data || ''), 'base64'); }
    catch { throw Object.assign(new Error('Dữ liệu tài liệu không hợp lệ'), { statusCode: 400 }); }
    const result = await ingestKnowledgeBuffer({ name: body.name, mimeType: body.mimeType, buffer, sourceType: 'upload' });
    sendJson(response, result.created ? 201 : 200, { created: result.created, document: result.document, stats: knowledgeStats() });
    return true;
  }

  if (pathname === '/api/knowledge/sync' && request.method === 'POST') {
    const dossier = await scanKnowledgeFolder(DOSSIER_DIR, 'dossier', 'HO-SO-AI');
    const forms = await scanKnowledgeFolder(FORM_DIR, 'form', 'MAU');
    const memories = syncExistingDossierMemories();
    sendJson(response, 200, {
      added: dossier.added + forms.added,
      skipped: dossier.skipped + forms.skipped,
      errors: dossier.errors.concat(forms.errors).slice(0, 30),
      stats: knowledgeStats(), documents: listKnowledgeDocuments(), memories
    });
    return true;
  }

  if (pathname === '/api/knowledge/search' && request.method === 'GET') {
    const query = String(requestUrl.searchParams.get('q') || '').trim();
    sendJson(response, 200, { query, results: query ? searchKnowledge(query, 15) : [] });
    return true;
  }

  if (pathname === '/api/knowledge/chat' && request.method === 'GET') {
    sendJson(response, 200, { messages: listKnowledgeChat(120) });
    return true;
  }

  if (pathname === '/api/knowledge/chat' && request.method === 'DELETE') {
    getKnowledgeDb().exec('DELETE FROM knowledge_chat');
    sendJson(response, 200, { cleared: true });
    return true;
  }

  if (pathname === '/api/knowledge/ask' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const question = String(body.question || '').trim();
    if (question.length < 2) throw Object.assign(new Error('Hãy nhập câu hỏi cần tra cứu'), { statusCode: 400 });
    sendJson(response, 200, await answerKnowledgeQuestionAgentic(question, body.webSearch));
    return true;
  }

  const knowledgeDocumentMatch = pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/(open|delete)$/);
  if (knowledgeDocumentMatch) {
    const id = String(knowledgeDocumentMatch[1] || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const action = knowledgeDocumentMatch[2];
    const document = getKnowledgeDb().prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id);
    if (!document) throw Object.assign(new Error('Không tìm thấy tài liệu trong Tủ tri thức'), { statusCode: 404 });
    if (action === 'open' && request.method === 'POST') {
      const filePath = path.join(KNOWLEDGE_FILES_DIR, document.stored_name);
      const child = spawn('explorer.exe', [filePath], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      sendJson(response, 200, { opened: true, document: { id: document.id, name: document.name } });
      return true;
    }
    if (action === 'delete' && request.method === 'DELETE') {
      deleteKnowledgeDocument(id);
      sendJson(response, 200, { deleted: true, stats: knowledgeStats(), documents: listKnowledgeDocuments() });
      return true;
    }
    sendError(response, 405, 'Method not allowed');
    return true;
  }

  if (pathname === '/api/ai/respond' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const mode = body.mode === 'followup' ? 'followup' : 'analyze';
    const selectedSkill = selectSkill(body.input, body.skillId);
    const baseInstructions = mode === 'analyze'
      ? 'Vai trò: AI Agent nghiệp vụ mua sắm, sửa chữa, tạm ứng và thanh toán của trường. Mục tiêu: xử lý yêu cầu đầu cuối trên hồ sơ số; bóc tách dữ liệu, xác định biểu mẫu, lập quy trình, rà soát báo giá trên web khi được bật và nêu rõ nguồn. Không bịa giá, nhà cung cấp, căn cứ hay tình trạng pháp lý. Tách rõ việc AI có thể chuẩn bị với chữ ký, phê duyệt, nghiệm thu thực tế và giao dịch ngân hàng/Kho bạc phải do người có thẩm quyền thực hiện. Chỉ đưa vào exceptions những vấn đề thực sự cần người dùng quyết định. Nếu thiếu dữ liệu, đặt một câu hỏi ngắn ở nextQuestion. confidence là độ tin cậy tổng thể từ 0 đến 1; riskLevel phản ánh rủi ro nếu tiếp tục với dữ liệu hiện có. Ghi mọi dữ liệu thiếu vào missing và mọi suy luận chưa có chứng cứ trực tiếp vào assumptions. fieldEvidence phải giải thích nguồn của từng trường quan trọng như kind, amount, quantity, unit và recommendedForms; source chỉ được là request, rule, knowledge, web hoặc assumption. Không đánh dấu confidence cao cho trường lấy từ assumption.'
      : 'Bạn là AI Agent đang tiếp tục xử lý một hồ sơ hành chính. Trả lời bằng tiếng Việt, trực tiếp và có căn cứ. Chủ động đề xuất bước tiếp theo, dùng web search khi cần dữ liệu thị trường mới. Không tuyên bố đã ký, phê duyệt, nghiệm thu hoặc thanh toán thay con người.';
    const result = await callOpenAI({
      input: body.input || '',
      instructions: skillInstructions(selectedSkill, mode) + ' ' + baseInstructions,
      reasoning: mode === 'analyze' ? 'medium' : 'medium',
      verbosity: 'medium',
      schema: mode === 'analyze' ? aiAnalysisSchema() : null,
      schemaName: 'dossier_analysis',
      webSearch: Boolean(body.webSearch),
      searchContextSize: 'medium'
    });
    let structured = null;
    if (mode === 'analyze') {
      try { structured = JSON.parse(result.text); }
      catch { throw Object.assign(new Error('AI trả về dữ liệu hồ sơ không đúng cấu trúc'), { statusCode: 502 }); }
    }
    sendJson(response, 200, {
      responseId: result.responseId,
      model: result.model,
      text: result.text,
      structured,
      citations: result.citations,
      webSearchUsed: Boolean(body.webSearch),
      skill: { id: selectedSkill.id, name: selectedSkill.name, source: selectedSkill.source, policy: selectedSkill.policy }
    });
    return true;
  }

  if (pathname === '/api/dossiers' && request.method === 'POST') {
    sendJson(response, 201, await writeDossier(await readJsonBody(request)));
    return true;
  }

  if (pathname === '/api/dossiers/report' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const caseId = safeCaseId(body.caseId || 'ho-so');
    sendDownload(response, caseId + '-bao-cao-ho-so.pdf', await buildClientReportPdf(body), 'application/pdf');
    return true;
  }

  if (pathname === '/api/dossier-file' && (request.method === 'GET' || request.method === 'HEAD')) {
    const caseId = safeCaseId(requestUrl.searchParams.get('id'));
    const folder = path.join(DOSSIER_DIR, caseId);
    const filePath = safeRelativeFile(folder, requestUrl.searchParams.get('name'));
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw Object.assign(new Error('Không tìm thấy tệp hồ sơ'), { statusCode: 404 });
    const content = fs.readFileSync(filePath);
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Content-Length': content.length });
      response.end();
    } else sendDownload(response, path.basename(filePath), content, CONTENT_TYPES[path.extname(filePath).toLowerCase()]);
    return true;
  }

  const dossierMatch = pathname.match(/^\/api\/dossiers\/([^/]+)\/(download|open|interaction)$/);
  if (dossierMatch) {
    const caseId = safeCaseId(decodeURIComponent(dossierMatch[1]));
    const action = dossierMatch[2];
    const folder = path.join(DOSSIER_DIR, caseId);
    if (!fs.existsSync(folder)) throw Object.assign(new Error('Không tìm thấy thư mục hồ sơ'), { statusCode: 404 });
    if (action === 'download' && request.method === 'GET') {
      sendDownload(response, caseId + '.zip', buildZip(folder), 'application/zip');
      return true;
    }
    if (action === 'open' && request.method === 'POST') {
      const child = spawn('explorer.exe', [folder], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      sendJson(response, 200, { opened: true, folderPath: folder });
      return true;
    }
    if (action === 'interaction' && request.method === 'POST') {
      const body = await readJsonBody(request);
      sendJson(response, 200, await writeInteraction(caseId, body.interactions));
      return true;
    }
    sendError(response, 405, 'Method not allowed');
    return true;
  }

  return false;
}

function serveForm(request, response, pathname) {
  let fileName;
  try { fileName = path.basename(decodeURIComponent(pathname)); }
  catch { sendError(response, 400, 'Đường dẫn biểu mẫu không hợp lệ'); return; }
  const filePath = path.join(FORM_DIR, fileName);
  const extension = path.extname(filePath).toLowerCase();
  if (!CONTENT_TYPES[extension] || !fs.existsSync(filePath)) { sendError(response, 404, 'Không tìm thấy biểu mẫu'); return; }
  const content = fs.readFileSync(filePath);
  if (request.method === 'HEAD') {
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extension], 'Content-Length': content.length });
    response.end();
  } else sendDownload(response, fileName, content, CONTENT_TYPES[extension]);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://' + HOST + ':' + PORT);
  try {
    if (requestUrl.pathname.startsWith('/api/')) {
      if (await handleApi(request, response, requestUrl)) return;
      sendError(response, 404, 'API not found');
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendError(response, 405, 'Method not allowed');
      return;
    }
    if (requestUrl.pathname === '/favicon.ico') {
      response.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
      response.end();
      return;
    }
    if (requestUrl.pathname.startsWith('/MAU/')) {
      serveForm(request, response, requestUrl.pathname);
      return;
    }
    if (requestUrl.pathname === '/pixel-office-engine.js') {
      const assetPath = path.join(ROOT, 'pixel-office-engine.js');
      if (!fs.existsSync(assetPath)) { sendError(response, 404, 'Không tìm thấy pixel engine'); return; }
      const content = fs.readFileSync(assetPath);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.js'],
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(content);
      return;
    }
    if (requestUrl.pathname === '/pixel-world-engine.js') {
      const assetPath = path.join(ROOT, 'pixel-world-engine.js');
      if (!fs.existsSync(assetPath)) { sendError(response, 404, 'Không tìm thấy pixel world engine'); return; }
      const content = fs.readFileSync(assetPath);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.js'],
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(content);
      return;
    }
    if (requestUrl.pathname === '/office-narrative-catalog.js') {
      const assetPath = path.join(ROOT, 'office-narrative-catalog.js');
      if (!fs.existsSync(assetPath)) { sendError(response, 404, 'Không tìm thấy catalog câu chuyện'); return; }
      const content = fs.readFileSync(assetPath);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.js'],
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(content);
      return;
    }
    if (requestUrl.pathname === '/office-life-simulator.js') {
      const assetPath = path.join(ROOT, 'office-life-simulator.js');
      if (!fs.existsSync(assetPath)) { sendError(response, 404, 'Không tìm thấy engine đời sống văn phòng'); return; }
      const content = fs.readFileSync(assetPath);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.js'],
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(content);
      return;
    }
    if (requestUrl.pathname === '/reminder-core.js') {
      const assetPath = path.join(ROOT, 'reminder-core.js');
      if (!fs.existsSync(assetPath)) { sendError(response, 404, 'Không tìm thấy lõi lịch nhắc'); return; }
      const content = fs.readFileSync(assetPath);
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES['.js'],
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(content);
      return;
    }
    if (requestUrl.pathname !== '/' && requestUrl.pathname !== '/quy-trinh-thanh-toan.html') {
      sendError(response, 404, 'Not found');
      return;
    }
    const content = fs.readFileSync(HTML_FILE);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': content.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else response.end(content);
  } catch (error) {
    if (!response.headersSent) sendError(response, error.statusCode || 500, error.message || 'Lỗi máy chủ local');
    else response.end();
  }
});

server.listen(PORT, HOST, () => {
  fs.mkdirSync(DOSSIER_DIR, { recursive: true });
  getKnowledgeDb();
  runReminderScheduler();
  const reminderScheduler = setInterval(runReminderScheduler, 5000);
  if (typeof reminderScheduler.unref === 'function') reminderScheduler.unref();
  syncExistingDossierMemories();
  const url = 'http://' + HOST + ':' + PORT + '/quy-trinh-thanh-toan.html#van-phong-ai';
  console.log('Văn phòng AI local đang chạy tại:');
  console.log(url);
  console.log('Giữ cửa sổ này mở. Nhấn Ctrl+C để dừng.');
  if (process.env.AI_OFFICE_NO_OPEN !== '1') {
    const child = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error('Cổng ' + PORT + ' đang được sử dụng. Hãy đóng phiên Văn phòng AI cũ rồi mở lại.');
  else console.error(error.message);
  process.exitCode = 1;
});
