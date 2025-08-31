// src/modules/account/account.js
// Gọn lại Settings (Account + Options) với icon buttons + status nổi bật + last synced

import { settings } from '../../services/settings.service.js';
import { auth } from '../../services/auth.service.js';
import { toast } from '../../components/ui-toast.js';

function setStatus({ email, lastSyncedAt }){
  const status = document.getElementById('authStatus');
  const dot = document.getElementById('authDot');
  const sync = document.getElementById('lastSync');

  if (email) {
    status.textContent = `Signed in as ${email}`;
    dot.classList.remove('off');
  } else {
    status.textContent = 'Not signed in';
    dot.classList.add('off');
  }
  sync.textContent = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : '—';
}

export async function init(root){
  const st = settings.get();

  // ----- Fill inputs (Supabase) -----
  root.querySelector('#sup-url').value    = st.supabase.url || '';
  root.querySelector('#sup-key').value    = st.supabase.anonKey || '';
  root.querySelector('#sup-schema').value = st.supabase.schema || 'public';
  root.querySelector('#sup-table').value  = st.supabase.tableSettings || 'dvtool_settings';
  root.querySelector('#sup-redirect').value = chrome.identity.getRedirectURL('supabase-callback');
  root.querySelector('#sup-project').value  = st.supabase.projectId || '';

  // ----- Fill inputs (Gemini) -----
  root.querySelector('#gm-base').value  = st.gemini.apiBase || 'https://generativelanguage.googleapis.com';
  root.querySelector('#gm-key').value   = st.gemini.apiKey || '';
  root.querySelector('#gm-model').value = st.gemini.model || 'gemini-1.5-pro';

  // ----- Feature flags -----
  const tele = root.querySelector('#ff-tele');
  const dry  = root.querySelector('#ff-dry');
  tele.checked = !!st.features?.enableTelemetry;
  dry.checked  = !!st.features?.enableDryRunCleaner;

  tele.addEventListener('change', async ()=>{
    st.features.enableTelemetry = tele.checked;
    await settings.save(st);
    toast('Saved.');
  });
  dry.addEventListener('change', async ()=>{
    st.features.enableDryRunCleaner = dry.checked;
    await settings.save(st);
    toast('Saved.');
  });

  // ----- Status init -----
  setStatus({ email: null, lastSyncedAt: st.supabase?.lastSyncedAt });

  // ===== Restore session when opening Settings =====
  try {
    const { supa } = await import('../../services/supabase.service.js');
    supa.setConfig(st.supabase);
    await supa.restore();
    if (supa.user?.email) {
      setStatus({ email: supa.user.email, lastSyncedAt: st.supabase?.lastSyncedAt });
    }
  } catch (e) {
    console.warn('Session restore failed:', e);
  }

  // ----- Icon actions -----
  root.querySelector('#save').addEventListener('click', async () => {
    const next = {
      ...st,
      supabase:{
        url:           root.querySelector('#sup-url').value.trim(),
        anonKey:       root.querySelector('#sup-key').value.trim(),
        schema:        root.querySelector('#sup-schema').value.trim() || 'public',
        tableSettings: root.querySelector('#sup-table').value.trim() || 'dvtool_settings',
        authRedirectUrl: chrome.identity.getRedirectURL('supabase-callback'),
        projectId:     root.querySelector('#sup-project').value.trim(),
        lastSyncedAt:  st.supabase?.lastSyncedAt || null
      },
      gemini:{
        apiBase: root.querySelector('#gm-base').value.trim() || 'https://generativelanguage.googleapis.com',
        apiKey:  root.querySelector('#gm-key').value.trim(),
        model:   root.querySelector('#gm-model').value.trim() || 'gemini-1.5-pro'
      }
    };
    await settings.save(next);
    toast('Saved.');
  });

  root.querySelector('#reset').addEventListener('click', async () => {
    await settings.reset();
    toast('Restored defaults. Reopen popup.');
  });

  // Login / Logout
  root.querySelector('#login').addEventListener('click', async () => {
    try{
      const user = await auth.loginWithGoogle(settings.get().supabase);
      setStatus({ email: user?.email, lastSyncedAt: settings.get().supabase?.lastSyncedAt });
      toast('Logged in with Google.');
    }catch(e){
      toast('Login failed. Check console.');
      console.error('Login error', e);
    }
  });

  root.querySelector('#logout').addEventListener('click', async () => {
    try {
      const { supa } = await import('../../services/supabase.service.js');
      supa.setConfig(settings.get().supabase);
      await supa.logout();
    } catch (_) {}
    setStatus({ email: null, lastSyncedAt: settings.get().supabase?.lastSyncedAt });
    toast('Logged out.');
  });

  // Pull / Push (update lastSyncedAt + UI)
  root.querySelector('#pull').addEventListener('click', async () => {
    const { supabase } = settings.get();
    const { supa } = await import('../../services/supabase.service.js');
    try{
      supa.setConfig(supabase);
      await supa.restore();
      if(!supa.user){ toast('Please sign in first.'); return; }
      const remote = await supa.pullSettings(); // {data, updated_at}
      if(remote?.data){
        const merged = { ...remote.data };
        // preserve lastSyncedAt in supabase settings (from server)
        merged.supabase = merged.supabase || {};
        merged.supabase.lastSyncedAt = remote.updated_at || new Date().toISOString();
        await settings.save(merged);
        setStatus({ email: supa.user.email, lastSyncedAt: merged.supabase.lastSyncedAt });
        toast('Pulled settings from cloud.');
      }else{
        toast('No remote settings found.');
      }
    }catch(e){
      console.error(e);
      toast('Pull failed. Check console.');
    }
  });

  root.querySelector('#push').addEventListener('click', async () => {
    const { supabase } = settings.get();
    const { supa } = await import('../../services/supabase.service.js');
    try{
      supa.setConfig(supabase);
      await supa.restore();
      if(!supa.user){ toast('Please sign in first.'); return; }
      const saved = await supa.pushSettings(settings.get());
      // saved.updated_at từ DB
      const st2 = settings.get();
      st2.supabase = { ...(st2.supabase||{}), lastSyncedAt: saved?.updated_at || new Date().toISOString() };
      await settings.save(st2);
      setStatus({ email: supa.user.email, lastSyncedAt: st2.supabase.lastSyncedAt });
      toast('Pushed settings to cloud.');
    }catch(e){
      console.error(e);
      toast('Push failed. Check console.');
    }
  });

  // Export / Import (icon)
  root.querySelector('#export').addEventListener('click', async ()=>{
    const blob = new Blob([JSON.stringify(settings.get(), null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dvtool-settings-${Date.now()}.json`;
    a.click();
  });

  root.querySelector('#import').addEventListener('click', async ()=>{
    try{
      const clip = await navigator.clipboard.readText();
      if(!clip?.trim()){ toast('Clipboard is empty.'); return; }
      await settings.import(clip);
      toast('Imported from clipboard. Save to persist.');
    }catch(e){
      // Fallback: prompt paste
      const text = prompt('Paste settings JSON here:');
      if(!text) return;
      try{ await settings.import(text); toast('Imported. Save to persist.'); }
      catch(err){ toast('Invalid JSON.'); }
    }
  });
}
