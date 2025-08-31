
import { storage } from '../lib/util.js';
import { mergeWithSaved } from './config.service.js';
const KEY = 'settings';
export const settings = {
  data: null,
  async init(){
    const saved = await storage.get(KEY);
    this.data = await mergeWithSaved(saved);
    return this.data;
  },
  get(){ return this.data; },
async save(newSettings){
    this.data = newSettings;
    await storage.set(KEY, this.data);
    // Try cloud sync (best-effort)
    try {
      const { supabase } = this.data || {};
      if (supabase?.url && supabase?.anonKey) {
        const mod = await import('./supabase.service.js');
        mod.supa.setConfig(supabase);
        await mod.supa.restore();
        if (mod.supa.user) { await mod.supa.pushSettings(this.data); }
      }
    } catch(e) { console.warn('Cloud sync failed', e); }
    return this.data;
  },
  async reset(){
    await storage.remove(KEY);
    this.data = await this.init();
    return this.data;
  },
  async export(){ return JSON.stringify(this.data, null, 2); },
  async import(json){ const obj = JSON.parse(json); await this.save(obj); return this.data; }
};
