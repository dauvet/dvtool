// src/services/gemini.service.js
// Gọi Gemini v1beta (text-only), không CDN. Đọc config từ settings (apiBase, apiKey, model).

import { settings } from './settings.service.js';

function pickTextFromCandidates(resp){
  // Hợp nhất text ở parts[] của ứng viên đầu tiên
  try{
    const c = resp.candidates?.[0];
    if(!c?.content?.parts) return '';
    return c.content.parts.map(p => p.text || '').join('');
  }catch(_){ return ''; }
}

export async function generateWithGemini({ instructor, text, temperature=0.2, maxOutputTokens=2048 }){
  const st = settings.get();
  const base = (st.gemini?.apiBase || 'https://generativelanguage.googleapis.com').replace(/\/$/,'');
  const model = st.gemini?.model || 'gemini-1.5-pro';
  const key = st.gemini?.apiKey;
  if(!key) throw new Error('Gemini API key is missing in Settings.');

  const prompt = `${instructor || ''}\n\n${text || ''}`.trim();
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const json = await resp.json();
  if(!resp.ok){
    throw new Error(json?.error?.message || JSON.stringify(json));
  }
  return {
    prompt, raw: json, text: pickTextFromCandidates(json)
  };
}
