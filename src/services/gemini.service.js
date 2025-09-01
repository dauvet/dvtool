// src/services/gemini.service.js
// ✔ Null-safe ở mọi ngữ cảnh (popup/options, service worker, content script)
// ✔ KHÔNG dùng top-level await (hợp lệ cho MV3 service worker)
// ✔ Ưu tiên: params -> settings module -> chrome.storage.local

let _settingsModPromise = null;

/** Lazy import settings.service.js (không dùng top-level await) */
function getSettingsModulePromise() {
  if (_settingsModPromise) return _settingsModPromise;
  try {
    _settingsModPromise = import('./settings.service.js').catch(() => null);
  } catch (_) {
    _settingsModPromise = Promise.resolve(null);
  }
  return _settingsModPromise;
}

/** Đọc settings từ module (nếu import được) */
async function readSettingsFromModuleSafe() {
  try {
    const mod = await getSettingsModulePromise();
    const s = mod?.settings?.get?.();
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

/** Đọc trực tiếp từ chrome.storage.local (MV3) */
async function readSettingsFromStorageSafe() {
  try {
    const all = await chrome?.storage?.local?.get?.(null);
    // Nhiều repo lưu dưới key 'settings'; nếu không có, trả 'all' luôn
    return all?.settings && typeof all.settings === 'object' ? all.settings : (all || {});
  } catch {
    return {};
  }
}

function mergeGeminiConfig({ prefer, fallback1, fallback2 }) {
  const empty = {
    apiKey: '',
    model: 'gemini-1.5-pro',
    apiBase: 'https://generativelanguage.googleapis.com'
  };

  const pick = (obj) => {
    const g = obj?.gemini || obj || {};
    const apiKey = g.apiKey || g.key || '';
    const model  = g.model  || 'gemini-1.5-pro';
    const apiBase = g.apiBase || g.base || 'https://generativelanguage.googleapis.com';
    return { apiKey, model, apiBase };
  };

  const A = pick(prefer);
  if (A.apiKey) return { ...empty, ...A };

  const B = pick(fallback1);
  if (B.apiKey) return { ...empty, ...B };

  const C = pick(fallback2);
  return { ...empty, ...C };
}

function buildUserPrompt(instructor = '', text = '') {
  const a = (instructor || '').trim();
  const b = (text || '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

function extractText(respJson) {
  const cands = respJson?.candidates;
  if (!Array.isArray(cands) || !cands.length) return '';
  const parts = cands[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map(p => (typeof p?.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof cands[0]?.text === 'string') return cands[0].text.trim();
  return '';
}

/**
 * Gọi Gemini GenerateContent
 * @param {Object} p
 * @param {string} [p.instructor]
 * @param {string} p.text
 * @param {string} [p.model]
 * @param {string} [p.apiKey]
 * @param {string} [p.apiBase]
 * @returns {Promise<{ text: string, raw: any }>}
 */
export async function generateWithGemini(p = {}) {
  const instructor = p.instructor || '';
  const text = p.text || '';

  // 1) Ưu tiên cấu hình truyền vào
  const prefer = {
    gemini: {
      apiKey: p.apiKey,
      model:  p.model,
      apiBase: p.apiBase
    }
  };

  // 2) Từ module settings (nếu dùng được)
  const stMod = await readSettingsFromModuleSafe();

  // 3) Từ chrome.storage.local
  const stStore = await readSettingsFromStorageSafe();

  const { apiKey, model, apiBase } = mergeGeminiConfig({
    prefer,
    fallback1: stMod,
    fallback2: stStore
  });

  if (!apiKey) {
    throw new Error('Gemini API key is missing. Please open Account/Settings and set your Gemini key.');
  }

  const prompt = buildUserPrompt(instructor, text);
  const url = `${apiBase.replace(/\/+$/,'')}/v1beta/models/${encodeURIComponent(model || 'gemini-1.5-pro')}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let err = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      const msg = j?.error?.message || j?.message;
      if (msg) err = `${err}: ${msg}`;
    } catch {}
    throw new Error(err);
  }

  const json = await res.json();
  const outText = extractText(json);
  return { text: outText, raw: json };
}
