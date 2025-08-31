// src/modules/translator/translator.js
// Bổ sung Collapsible Settings đặt dưới Result (default collapsed)
// Giữ nguyên logic submit, history, tone/audience, prompts loader…

import '../../components/md-viewer.js';
import { generateWithGemini } from '../../services/gemini.service.js';
import { settings } from '../../services/settings.service.js';
import { toast } from '../../components/ui-toast.js';

const PROMPTS_URL = '/src/assets/prompts.txt';

function nowIso(){ return new Date().toISOString(); }

function getState(){
  const st = settings.get();
  st.translator = st.translator || {
    useCustom: false,
    customInstructor: '',
    selectedPresetId: '',
    tone: 'Neutral',
    audience: 'general'
  };
  return st;
}

/** Load prompts with multiline Markdown support (--- separated) + legacy single-line */
async function loadPrompts(){
  try{
    const res = await fetch(PROMPTS_URL);
    if(!res.ok) return [];
    const raw = (await res.text()).replace(/\r/g, '');

    const hasMultiBlocks = /^\s*---\s*$/m.test(raw);
    if (hasMultiBlocks) {
      const lines = raw.split('\n');
      const blocks = [];
      let buf = [];
      for (const line of lines) {
        if (line.trim() === '---') {
          if (buf.some(l => l.trim() !== '')) blocks.push(buf.join('\n'));
          buf = [];
        } else {
          buf.push(line);
        }
      }
      if (buf.some(l => l.trim() !== '')) blocks.push(buf.join('\n'));

      const arr = [];
      for (const b of blocks) {
        const block = b.trim();
        if (!block) continue;
        const blines = block.split('\n');
        let headerIdx = blines.findIndex(l => l.trim() !== '' && !l.trim().startsWith('#'));
        if (headerIdx === -1) continue;
        const header = blines[headerIdx].trim();
        const [idRaw, labelRaw] = header.split('|');
        const id = (idRaw||'').trim();
        const label = ((labelRaw||'').trim()) || id;
        const body = blines.slice(headerIdx+1).join('\n').trim();
        if (id && label && body) arr.push({ id, label, text: body });
      }
      return arr;
    } else {
      return raw.split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .filter(l => !l.startsWith('#'))
        .map(line => {
          const [id, label, ...rest] = line.split('|');
          return { id: (id||'').trim(), label: (label||'').trim() || (id||'').trim(), text: rest.join('|').trim() };
        })
        .filter(p => p.id && p.text);
    }
  }catch(_){ return []; }
}

function renderPresets(select, presets, selectedId){
  select.innerHTML = `<option value="">-- Choose an instructor --</option>` +
    presets.map(p => `<option value="${p.id}" ${p.id===selectedId?'selected':''}>${p.label}</option>`).join('');
}

function buildPrompt({ instructorTemplate, text, tone, audience }){
  const tpl = (instructorTemplate || '').trim();
  if (tpl.includes('{text}') || tpl.includes('{tone}') || tpl.includes('{audience}')) {
    return tpl
      .replaceAll('{text}', text || '')
      .replaceAll('{tone}', tone || '')
      .replaceAll('{audience}', audience || '');
  }
  return `${tpl}\n\n${text}`.trim();
}

function stripTags(html){
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || div.innerText || '').replace(/\s+/g,' ').trim();
}

function updatePresetButtonStates(root, st){
  root.querySelectorAll('.tone').forEach(btn=>{
    const on = (btn.dataset.tone === (st.translator.tone || 'Neutral'));
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  root.querySelectorAll('.audience').forEach(btn=>{
    const on = (btn.dataset.audience === (st.translator.audience || 'general'));
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function historyRow(h){
  return `
    <div class="flex justify-between items-center p-2 rounded mb-2" style="border:1px solid #374151; min-width:0;">
      <div style="min-width:0">
        <div class="text-xs text-sub">${new Date(h.ts).toLocaleString()}</div>
        <div class="summary clamp-2 text-xs"></div>
      </div>
      <div class="flex gap-2" style="flex:0 0 auto">
        <button class="icon-btn sm btn-load" data-id="${h.id}" title="Load" aria-label="Load">
          <svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zM13 4h-2v8H8l4 4 4-4h-3V4z"/></svg>
        </button>
        <button class="icon-btn sm danger" data-id="${h.id}" data-role="delete" title="Delete" aria-label="Delete">
          <svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3v1H4v2h16V4h-5V3H9m1 6v9h2V9h-2m-4 0v9h2V9H6m8 0v9h2V9h-2z"/></svg>
        </button>
      </div>
    </div>
  `;
}

function renderHistoryList(root, container, items){
  if(!container) return;
  if(!items?.length){ container.innerHTML = '<small class="text-sub">No history yet.</small>'; return; }
  container.innerHTML = items.map(historyRow).join('');

  // inject summaries safely
  const rows = Array.from(container.querySelectorAll('.summary'));
  rows.forEach((el, i)=>{
    const h = items[i];
    el.textContent = stripTags(h.output || '');
    el.title = el.textContent;
  });

  // actions
  container.querySelectorAll('.btn-load').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id');
      const item = items.find(x => x.id === id);
      if(!item) return;
      const textEl = root.querySelector('#text');
      const outEl  = root.querySelector('#output');
      if (textEl) textEl.value = item.text || '';
      if (outEl)  outEl.content = item.output || '';
      toast('Loaded from history.');
    });
  });

  container.querySelectorAll('button[data-role="delete"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-id');
      try{
        const { supa } = await import('../../services/supabase.service.js');
        const st = settings.get();
        supa.setConfig(st.supabase);
        await supa.restore();
        if(!supa.user){ toast('Please sign in to manage cloud history.'); return; }
        await supa.historyDelete(id);
        toast('Deleted.');
        const updated = await supa.historyList({ q: root.querySelector('#historySearch')?.value.trim() || '', limit: 50 });
        const box = root.querySelector('#history');
        renderHistoryList(root, box, updated);
      }catch(e){
        console.error(e); toast('Delete failed.');
      }
    });
  });
}

async function refreshHistoryUI(root, q=''){
  const { supa } = await import('../../services/supabase.service.js');
  const st = settings.get();
  supa.setConfig(st.supabase);
  await supa.restore();

  const list = supa.user ? await supa.historyList({ q, limit: 50 }) : [];
  const box = root.querySelector('#history');
  renderHistoryList(root, box, list);
}

/* debounce helper for realtime search */
function debounce(fn, wait=250){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
}

/* Loading spinner for Submit button (icon-only) */
function spinnerSvg(){
  return `
  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke-width="3" opacity="0.25"></circle>
    <path d="M21 12a9 9 0 0 1-9 9" stroke-width="3">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
    </path>
  </svg>`;
}
function setSubmitting(btn, on=true){
  if(!btn) return;
  if(on){
    if(!btn.dataset._orig) btn.dataset._orig = btn.innerHTML;
    btn.innerHTML = spinnerSvg();
    btn.setAttribute('aria-busy','true');
    btn.disabled = true;
  }else{
    btn.innerHTML = btn.dataset._orig || '';
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

/* Ensure the Result card is visible after rendering output */
function ensureResultVisible(root){
  const card = root.querySelector('.card.result') || root.querySelector('.result');
  if(!card) return;
  card.scrollTop = 0;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function attachHotkeys(root){
  const text = root.querySelector('#text');
  const search = root.querySelector('#historySearch');
  const submit = root.querySelector('#submit');

  if (text) {
    // Enter = submit (textarea), Ctrl+Enter = newline
    text.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter' && ev.ctrlKey) {
        ev.preventDefault();
        const start = text.selectionStart ?? text.value.length;
        const end = text.selectionEnd ?? text.value.length;
        const val = text.value;
        text.value = val.slice(0,start) + '\n' + val.slice(end);
        text.selectionStart = text.selectionEnd = start + 1;
        return;
      }
      if (ev.key === 'Enter' && !ev.ctrlKey && submit) {
        ev.preventDefault();
        submit.click();
      }
    });
  }

  document.addEventListener('keydown', (ev)=>{
    if (!ev.ctrlKey) return;
    if (ev.key === 'l' || ev.key === 'L') {
      ev.preventDefault(); text?.focus(); text?.select();
    } else if (ev.key === 'k' || ev.key === 'K') {
      ev.preventDefault(); search?.focus(); search?.select();
    }
  });
}

export async function init(root){
  const st = getState();

  // Collapsible wiring (default collapsed)
  const advToggle = root.querySelector('#advToggle');
  const advPanel  = root.querySelector('#advPanel');
  const chev      = advToggle?.querySelector('.chev');
  if (advPanel) advPanel.style.display = 'none';
  advToggle?.addEventListener('click', ()=>{
    const open = advPanel.style.display !== 'none';
    advPanel.style.display = open ? 'none' : 'block';
    chev?.classList.toggle('rot', !open);
  });

  const presetSel     = root.querySelector('#preset');
  const reloadPrompts = root.querySelector('#reloadPrompts');
  const useCustom     = root.querySelector('#useCustom');
  const custom        = root.querySelector('#custom');
  const textEl        = root.querySelector('#text');
  const submitBtn     = root.querySelector('#submit');
  const clearBtn      = root.querySelector('#clear');
  const copyOutBtn    = root.querySelector('#copyOut');
  const outputEl      = root.querySelector('#output');
  const exportBtn     = root.querySelector('#exportHistory');
  const clearAllBtn   = root.querySelector('#clearHistory');
  const historySearch = root.querySelector('#historySearch');
  const historyClearX = root.querySelector('#historyClearX');

  // Tone & Audience chips
  root.querySelectorAll('.tone').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      st.translator.tone = btn.dataset.tone;
      await settings.save(st);
      updatePresetButtonStates(root, st);
      toast(`Tone: ${st.translator.tone}`);
    });
  });
  root.querySelectorAll('.audience').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      st.translator.audience = btn.dataset.audience;
      await settings.save(st);
      updatePresetButtonStates(root, st);
      toast(`Audience: ${st.translator.audience}`);
    });
  });
  updatePresetButtonStates(root, st);

  // Load prompts
  let presets = await loadPrompts();
  if (presetSel) renderPresets(presetSel, presets, st.translator.selectedPresetId);

  // Restore custom template
  if (useCustom) useCustom.checked = !!st.translator.useCustom;
  if (custom)    custom.value = st.translator.customInstructor || '';
  const syncCustomVisibility = ()=> { if (custom) custom.style.display = (useCustom && useCustom.checked) ? 'block' : 'none'; };
  syncCustomVisibility();

  useCustom?.addEventListener('change', async ()=>{
    st.translator.useCustom = !!useCustom.checked;
    await settings.save(st);
    syncCustomVisibility();
  });

  presetSel?.addEventListener('change', async ()=>{
    st.translator.selectedPresetId = presetSel.value;
    await settings.save(st);
  });

  reloadPrompts?.addEventListener('click', async ()=>{
    presets = await loadPrompts();
    if (presetSel) renderPresets(presetSel, presets, st.translator.selectedPresetId);
    toast('Prompts reloaded.');
  });

  custom?.addEventListener('input', async ()=>{
    st.translator.customInstructor = custom.value;
    await settings.save(st);
  });

  clearBtn?.addEventListener('click', ()=>{
    if (textEl)   textEl.value = '';
    if (outputEl) outputEl.content = '';
  });

  copyOutBtn?.addEventListener('click', ()=>{
    if (!outputEl) return;
    const plain = outputEl.textContent || '';
    navigator.clipboard.writeText(plain).then(()=> toast('Copied.'));
  });

  exportBtn?.addEventListener('click', async ()=>{
    try{
      const { supa } = await import('../../services/supabase.service.js');
      const cfg = settings.get().supabase;
      supa.setConfig(cfg); await supa.restore();
      const list = supa.user ? await supa.historyList({ q: historySearch?.value.trim() || '', limit: 500 }) : [];
      const blob = new Blob([JSON.stringify(list, null, 2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `translator-history-${Date.now()}.json`;
      a.click();
    }catch(e){
      console.error(e); toast('Export failed.');
    }
  });

  clearAllBtn?.addEventListener('click', async ()=>{
    try{
      const { supa } = await import('../../services/supabase.service.js');
      const cfg = settings.get().supabase;
      supa.setConfig(cfg); await supa.restore();
      if(!supa.user){ toast('Please sign in first.'); return; }
      await supa.historyClear();
      await refreshHistoryUI(root, historySearch?.value.trim() || '');
      toast('History cleared.');
    }catch(e){
      console.error(e); toast('Clear failed.');
    }
  });

  // Realtime search (debounced)
  const doSearch = debounce(async ()=>{
    await refreshHistoryUI(root, historySearch?.value.trim() || '');
  }, 250);
  historySearch?.addEventListener('input', doSearch);

  historyClearX?.addEventListener('click', async ()=>{
    if (historySearch) historySearch.value = '';
    await refreshHistoryUI(root, '');
    historySearch?.focus();
  });

  // Initial history
  await refreshHistoryUI(root, '');

  // Submit
  submitBtn?.addEventListener('click', async ()=>{
    const instructorTemplate = (st.translator.useCustom && custom)
      ? (custom.value || '')
      : (presets.find(p => p.id === (presetSel?.value || ''))?.text || '');

    const mainText = (textEl?.value || '').trim();
    if(!mainText){ toast('Nhập văn bản trước.'); return; }

    setSubmitting(submitBtn, true);

    try{
      const tone = st.translator.tone || 'Neutral';
      const audience = st.translator.audience || 'general';
      const prompt = buildPrompt({ instructorTemplate, text: mainText, tone, audience });

      const { text: out } = await generateWithGemini({ instructor: '', text: prompt });

      if (outputEl) outputEl.content = out || '(empty response)';

      // đảm bảo Result luôn hiện ra
      await new Promise(r => requestAnimationFrame(r));
      ensureResultVisible(root);

      // Save history (cloud)
      try{
        const { supa } = await import('../../services/supabase.service.js');
        supa.setConfig(settings.get().supabase);
        await supa.restore();
        if (supa.user) {
          await supa.historyAdd({
            ts: nowIso(),
            instructor: instructorTemplate || '',
            text: mainText,
            output: out || '',
            model: (settings.get().gemini?.model || 'gemini-1.5-pro'),
            tone, audience
          });
          await refreshHistoryUI(root, historySearch?.value.trim() || '');
        } else {
          toast('Not signed in: output shown but not saved to cloud.');
        }
      }catch(e){
        console.warn('Save history failed:', e);
      }

    }catch(e){
      if (outputEl) outputEl.content = `**Error:** ${e.message || e}`;
      await new Promise(r => requestAnimationFrame(r));
      ensureResultVisible(root);
    }finally{
      setSubmitting(submitBtn, false);
    }
  });

  // Hotkeys
  attachHotkeys(root);
}
