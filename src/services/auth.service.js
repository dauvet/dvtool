
import { supa } from './supabase.service.js';
export const auth = {
  async loginWithGoogle(cfg){ supa.setConfig(cfg); await supa.restore(); const result=await supa.loginWithGoogle(); return result.user; },
  async logout(cfg){ supa.setConfig(cfg); await supa.logout(); return true; },
  async me(){ return supa.user; }
};
