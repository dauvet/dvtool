// src/background/translator-analyze.js
// Fallback: nếu selectedAnalyzePresetId trống -> dùng selectedPresetId.
// Nếu settings service có cache, vẫn đọc trực tiếp chrome.storage.local làm dự phòng.

import { settings } from '../services/settings.service.js';
import { generateWithGemini } from '../services/gemini.service.js';

const MENU_ID = 'dvtool-translator-analyze';
const PROMPTS_URL = chrome.runtime.getURL('src/assets/prompts.txt');

let _clickBound = false;

export function createOrUpdateAnalyzeMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      { id: MENU_ID, title: 'Translator Analyze', contexts: ['selection'] },
      () => { /* ignore lastError */ }
    );
  });
}

export function initTranslatorAnalyzeContextMenu() {
  if (_clickBound) return;
  _clickBound = true;

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab || !tab.id) return;
    try {
      await handleAnalyzeClick(info, tab);
    } catch (e) {
      console.error('[DVTool] Analyze click error:', e);
      await safeSend(tab.id, { type: 'SHOW_TRANSLATOR_ANALYSIS', text: `**Error:** ${e?.message || e}` });
    }
  });
}

async function handleAnalyzeClick(info, tab) {
  const selectedText = (info && info.selectionText) ? info.selectionText.trim() : '';
  if (!selectedText) {
    await safeSend(tab.id, { type: 'SHOW_TRANSLATOR_ANALYSIS', text: '**Error:** No selected text.' });
    return;
  }

  console.log('[DVTool] Analyze selected text:', selectedText.slice(0, 100));

  // 1) cố lấy qua settings service
  let st = {};
  try { st = await settings.get(); } catch { st = {}; }

  // 2) nếu vẫn thiếu, đọc trực tiếp storage (dự phòng nếu service cache)
  if (!st || !st.translator) {
    try {
      const all = await chrome.storage?.local.get(null);
      st = all?.settings || all || {};
    } catch {}
  }

  const tone = st?.translator?.tone || 'Neutral';
  const audience = st?.translator?.audience || 'general';

  // FIX: fallback về selectedPresetId nếu selectedAnalyzePresetId rỗng
  let analyzePresetId = st?.translator?.selectedAnalyzePresetId;
  if (!analyzePresetId) analyzePresetId = st?.translator?.selectedPresetId;

  if (!analyzePresetId) {
    await safeSend(tab.id, {
      type: 'SHOW_TRANSLATOR_ANALYSIS',
      text: '**Error:** No Analyze Preset selected. Open Translator → Prompt Settings → Analyze Preset.'
    });
    return;
  }

  const presets = await loadPresetsSafe();
  const preset = presets.find(p => p.id === analyzePresetId);
  const instructorTemplate = preset?.text || '';

  const finalPrompt = buildPrompt(instructorTemplate, selectedText, tone, audience);
  console.log('[DVTool] Final prompt:', finalPrompt);

  let resultText = '';
  try {
    const { text: outText } = await generateWithGemini({ instructor: '', text: finalPrompt });
    resultText = (outText && outText.trim()) || '(empty response)';
    console.log('[DVTool] Analyze result:', resultText);
  } catch (e) {
    console.log('[DVTool] Analyze error:', e);
    resultText = `**handleAnalyzeClick Error:** ${e?.message || e}`;
  }

  await safeSend(tab.id, { type: 'SHOW_TRANSLATOR_ANALYSIS', text: resultText });
}

async function loadPresetsSafe() {
  try {
    const res = await fetch(PROMPTS_URL);
    if (!res.ok) return [];
    const raw = (await res.text()).replace(/\r/g, '');
    return parsePrompts(raw);
  } catch {
    return [];
  }
}

function parsePrompts(raw) {
  const blocks = raw.split(/\n-{3,}\n/g);
  const presets = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    const lines = block.split('\n');
    let header = (lines[0] || '').trim();
    let id = '';
    let label = '';
    if (header.includes('|')) {
      const [hid, hlabel] = header.split('|');
      id = (hid || '').trim();
      label = (hlabel || '').trim();
    } else {
      label = header;
      id = label
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .slice(0, 50) || `preset-${i + 1}`;
    }
    const text = lines.slice(1).join('\n').trim();
    presets.push({ id, label, text });
  }
  return presets;
}

function buildPrompt(instructorTemplate, mainText, tone = 'Neutral', audience = 'general') {
  if (!instructorTemplate) return (mainText || '').trim();
  const hasVars =
    instructorTemplate.includes('{text}') ||
    instructorTemplate.includes('{tone}') ||
    instructorTemplate.includes('{audience}');
  if (hasVars) {
    return instructorTemplate
      .replaceAll('{text}', mainText || '')
      .replaceAll('{tone}', tone || 'Neutral')
      .replaceAll('{audience}', audience || 'general')
      .trim();
  }
  return `${instructorTemplate}\n\n${mainText || ''}`.trim();
}

async function safeSend(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    await new Promise(r => setTimeout(r, 120));
    try { await chrome.tabs.sendMessage(tabId, payload); } catch {}
  }
}
