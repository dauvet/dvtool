import '../../components/ui-tabs.js';
import '../../components/ui-modal.js';
import '../../components/ui-toast.js';
import { settings } from '../../services/settings.service.js';
import { tabsService } from '../../services/tabs.service.js';
import { toast } from '../../components/ui-toast.js';

const modules = [
  { id:'domain-cleaner', title:'Domain Cleaner', html:'/src/modules/domain-cleaner/domain-cleaner.html', js:'/src/modules/domain-cleaner/domain-cleaner.js' },
  { id:'translator',     title:'Translator',     html:'/src/modules/translator/translator.html',       js:'/src/modules/translator/translator.js' },
  { id:'note',           title:'Note',           html:'/src/modules/note/note.html',                   js:'/src/modules/note/note.js' },
  { id:'settings',       title:'Settings',       html:'/src/modules/account/account.html',             js:'/src/modules/account/account.js' }
];

async function loadModule(i){
  const m = modules[i];
  const view = document.getElementById('view');
  if(!view) return;
  const html = await (await fetch(m.html)).text();
  view.innerHTML = html;
  const mod = await import(m.js + `?v=${Date.now()}`);
  if (mod && mod.init) await mod.init(view);
}

function setActiveTab(idx){
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  // highlight nút hiện tại (phòng khi web component không tự làm)
  const btns = Array.from(tabs.querySelectorAll('button'));
  btns.forEach((b, i) => b.classList.toggle('active', i === idx));
  tabs.setAttribute('active', String(idx));
}

document.addEventListener('DOMContentLoaded', async () => {
  await settings.init();

  const tabs = document.getElementById('tabs');

  tabs?.addEventListener('change', async (e) => {
    const idx = e.detail.index;
    setActiveTab(idx);
    await loadModule(idx);
    const cur = settings.get();
    cur.ui = cur.ui || {};
    cur.ui.activeTab = idx;
    settings.save(cur); // fire-and-forget
  });

  // Khôi phục tab đã lưu & LOAD NỘI DUNG NGAY
  const st = settings.get();
  const storedIdx = Math.min(Math.max(0, Number(st?.ui?.activeTab ?? 0)), modules.length - 1);
  setActiveTab(storedIdx);
  await loadModule(storedIdx);

  // Hotkeys: Ctrl + [1..N] => chuyển tab chuẩn (phát sự kiện change)
  document.addEventListener('keydown', (ev) => {
    if (!ev.ctrlKey) return;
    const k = ev.key;
    if (!/^[1-9]$/.test(k)) return;
    const idx = Number(k) - 1;
    if (idx >= 0 && idx < modules.length) {
      tabs?.dispatchEvent(new CustomEvent('change', { detail: { index: idx }}));
    }
  });

  // Prefetch Domain Cleaner nếu tab đầu không phải 0
  if (storedIdx !== 0) {
    tabsService.allDomains().catch(()=>{});
  }

  toast('Ready.');
});
