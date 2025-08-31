
import { cleaner } from '../services/domain-cleaner.service.js';                     // tạo context menu + handle click

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg?.type === 'CLEAN_DOMAIN'){
    (async () => {
      const { domain, dryRun } = msg.payload || {};
      try{ const result = dryRun ? await cleaner.dryRun(domain) : await cleaner.clear(domain); sendResponse({ ok: true, result }); }
      catch(e){ sendResponse({ ok:false, error: String(e) }); }
    })();
    return true;
  }
});
