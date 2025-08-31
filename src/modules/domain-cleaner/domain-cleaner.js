
import { tabsService } from '../../services/tabs.service.js';
import { toast } from '../../components/ui-toast.js';
import { confirm } from '../../components/ui-modal.js';
import { settings } from '../../services/settings.service.js';

const send = (type, payload) => new Promise(res => chrome.runtime.sendMessage({type, payload}, res));

export async function init(root){
  const st = settings.get();
  const domInput = root.querySelector('#domain');
  const domSelect = root.querySelector('#domains');
  const out = root.querySelector('#out');

  const all = await tabsService.allDomains();
  domSelect.innerHTML = '<option value="">-- Choose from open tabs --</option>' + all.map(d => `<option>${d}</option>`).join('');

  const active = await tabsService.activeDomain();
  domInput.value = active || '';

  domSelect.addEventListener('change', () => { if(domSelect.value) domInput.value = domSelect.value; });

  root.querySelector('#dry').addEventListener('click', async ()=>{
    const domain = domInput.value.trim();
    if(!domain) return toast('Enter a domain.');
    const resp = await send('CLEAN_DOMAIN', {domain, dryRun: true});
    out.textContent = JSON.stringify(resp?.result || resp, null, 2);
    toast('Dry-run completed.');
  });

  root.querySelector('#clear').addEventListener('click', async ()=>{
    const domain = domInput.value.trim();
    if(!domain) return toast('Enter a domain.');
    const ok = await confirm(`<h3 class="text-lg">Proceed to clear site data?</h3><p class="mt-2">Domain: <b>${domain}</b></p><p class="mt-2 text-sub">This removes cookies and site data for this domain.</p>`);
    if(!ok) return;
    const resp = await send('CLEAN_DOMAIN', {domain, dryRun: !!st.features?.enableDryRunCleaner && false});
    out.textContent = JSON.stringify(resp?.result || resp, null, 2);
    toast('Cleared.');
  });
}
