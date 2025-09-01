
import { cleaner } from '../services/domain-cleaner.service.js';
import { createOrUpdateAnalyzeMenu, initTranslatorAnalyzeContextMenu } from './translator-analyze.js';

// Tạo menu ngay khi SW khởi chạy
createOrUpdateAnalyzeMenu();

// Tạo lại khi cài/upgrade
chrome.runtime.onInstalled.addListener(() => {
  createOrUpdateAnalyzeMenu();
});

// (Tùy chọn) khi browser khởi động
chrome.runtime.onStartup?.addListener(() => {
  createOrUpdateAnalyzeMenu();
});

// Gắn handler click (đảm bảo chỉ gắn 1 lần)
initTranslatorAnalyzeContextMenu();

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
