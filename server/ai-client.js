'use strict';

// ============================================================
// AI client đa nhà cung cấp (Gemini + API tương thích OpenAI)
// Cấu hình qua biến môi trường:
//   AI_PROVIDER = gemini | openai        (mặc định: gemini)
//   AI_API_KEY  = khóa API
//   AI_BASE_URL = base URL (với openai), ví dụ https://api.openai.com/v1
//   AI_MODEL    = tên model
// Tương thích ngược: GEMINI_API_KEY / GEMINI_MODEL vẫn dùng được.
// ============================================================

function normalizeBase(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  u = u.replace(/\/chat\/completions$/i, '');
  return u;
}

function resolveConfig() {
  const provider = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const aiKey = process.env.AI_API_KEY || '';
  const aiModel = process.env.AI_MODEL || '';
  const aiBase = process.env.AI_BASE_URL || '';

  // openai khi chỉ định rõ, hoặc khi có AI_BASE_URL mà không đặt provider
  if (provider === 'openai' || (!provider && aiBase)) {
    return {
      provider: 'openai',
      apiKey: aiKey,
      baseUrl: normalizeBase(aiBase || 'https://api.openai.com/v1'),
      model: aiModel || 'gpt-4o-mini'
    };
  }
  if (provider === 'gemini') {
    return { provider: 'gemini', apiKey: aiKey || geminiKey, model: aiModel || geminiModel };
  }
  // mặc định Gemini (tương thích ngược)
  return { provider: 'gemini', apiKey: geminiKey || aiKey, model: aiModel || geminiModel };
}

function isConfigured() {
  const c = resolveConfig();
  return Boolean(c.apiKey && c.model && (c.provider === 'gemini' || c.baseUrl));
}

function info() {
  const c = resolveConfig();
  return {
    provider: c.provider,
    model: c.model,
    baseUrl: c.provider === 'openai' ? c.baseUrl : 'generativelanguage.googleapis.com',
    configured: isConfigured()
  };
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && typeof m.text === 'string' && m.text.length)
    .map(m => ({ role: (m.role === 'assistant' || m.role === 'model') ? 'assistant' : 'user', text: m.text }));
}

async function chatGemini(cfg, { system, messages, maxTokens, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`;
  const contents = normalizeMessages(messages).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens, topP: 0.9 }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Lỗi API Gemini (${res.status})`);
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) throw new Error('Không có phản hồi từ AI (Gemini)');
  return text;
}

async function chatOpenAI(cfg, { system, messages, maxTokens, temperature }) {
  const url = `${cfg.baseUrl}/chat/completions`;
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  normalizeMessages(messages).forEach(m => msgs.push({ role: m.role, content: m.text }));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages: msgs, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Lỗi API AI (${res.status})`);
  const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
  if (!text) throw new Error('Không có phản hồi từ AI');
  return text;
}

// opts: { system, messages: [{role:'user'|'assistant', text}], maxTokens, temperature }
async function chat(opts) {
  const cfg = resolveConfig();
  if (!isConfigured()) throw new Error('Chưa cấu hình API AI (AI_API_KEY hoặc GEMINI_API_KEY)');
  const o = {
    system: opts.system || '',
    messages: opts.messages || [],
    maxTokens: opts.maxTokens || 2000,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.3
  };
  if (cfg.provider === 'gemini') return chatGemini(cfg, o);
  return chatOpenAI(cfg, o);
}

module.exports = { chat, isConfigured, info, resolveConfig };
