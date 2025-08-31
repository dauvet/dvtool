
export const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
export const deepMerge = (base, override) => {
  if(Array.isArray(base) && Array.isArray(override)) return override.slice();
  if(typeof base === 'object' && typeof override === 'object'){
    const out = {...base};
    for(const [k,v] of Object.entries(override)){
      out[k] = (k in base) ? deepMerge(base[k], v) : v;
    }
    return out;
  }
  return override ?? base;
};
export const storage = {
  async get(key){ const obj = await chrome.storage.local.get([key]); return obj[key]; },
  async set(key, value){ await chrome.storage.local.set({[key]: value}); },
  async remove(key){ await chrome.storage.local.remove([key]); }
};
export const prettyJson = (obj)=> JSON.stringify(obj, null, 2);
export const domainFromUrl = (url) => { try { return new URL(url).hostname.replace(/^www\./,''); } catch{ return ""; } };
export const toOrigins = (domain) => {
  const base = domain.replace(/^\./,'').replace(/\/$/,'').toLowerCase();
  const host = base.replace(/^https?:\/\//,'').replace(/^www\./,'');
  const variants = new Set([host, `www.${host}`]);
  return [...variants].flatMap(h => [`https://${h}`, `http://${h}`]);
};
export const withTry = async (fn, label) => { try { return await fn(); } catch(e){ console.warn(label||'error', e); return {error: String(e)}; } };
