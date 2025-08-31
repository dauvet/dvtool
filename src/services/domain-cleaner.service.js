
import { toOrigins, withTry } from '../lib/util.js';
async function removeCookiesForDomain(domain){
  const cookies = await chrome.cookies.getAll({domain});
  let removed = 0;
  for(const c of cookies){
    const url = `${c.secure ? 'https' : 'http'}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path}`;
    try{ await chrome.cookies.remove({url, name: c.name, storeId: c.storeId}); removed++; }catch(e){}
  }
  return {removed};
}
async function removeSiteDataForOrigins(origins){
  const passes=[{cache:true,cacheStorage:true},{indexedDB:true,localStorage:true,serviceWorkers:true,webSQL:true,fileSystems:true},{cookies:true}];
  let total=0;
  for(const dataToRemove of passes){
    await withTry(async ()=>await chrome.browsingData.remove({origins,since:0},dataToRemove),'browsingData.remove');
    total++;
  }
  return {passes: total};
}
export const cleaner={
  async dryRun(domain){ const origins=toOrigins(domain); const cookies=await chrome.cookies.getAll({domain}); return {domain,origins,cookies:cookies.length,willRemove:['cookies','cache','indexedDB','localStorage','serviceWorkers','cacheStorage','webSQL','fileSystems']}; },
  async clear(domain){ const origins=toOrigins(domain); const ck=await removeCookiesForDomain(domain); const site=await removeSiteDataForOrigins(origins); return {domain,origins,cookiesRemoved:ck.removed,passes:site.passes}; }
};
