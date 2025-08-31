
import { settings } from '../../services/settings.service.js';
import { toast } from '../../components/ui-toast.js';

export async function init(root, isOptionsPage=false){
  const st = settings.get();
  const tele = root.querySelector('#ff-tele');
  const dry = root.querySelector('#ff-dry');
  const json = root.querySelector('#json');

  tele.checked = !!st.features?.enableTelemetry;
  dry.checked = !!st.features?.enableDryRunCleaner;

  tele.addEventListener('change', async ()=>{ st.features.enableTelemetry = tele.checked; await settings.save(st); toast('Saved.'); });
  dry.addEventListener('change', async ()=>{ st.features.enableDryRunCleaner = dry.checked; await settings.save(st); toast('Saved.'); });

  root.querySelector('#export').addEventListener('click', async ()=>{ json.value = await settings.export(); json.select(); document.execCommand('copy'); toast('Exported to textarea and copied.'); });
  root.querySelector('#import').addEventListener('click', async ()=>{
    if(!json.value.trim()) return toast('Paste JSON first.');
    try{ await settings.import(json.value); toast('Imported. Reopen popup to see changes.'); }catch(e){ toast('Invalid JSON.'); }
  });
}
