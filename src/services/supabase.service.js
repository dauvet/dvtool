// src/services/supabase.service.js
// Supabase Auth (Google, PKCE) + Cloud Sync (dvtool_*)
// - Singleton client để tránh "Multiple GoTrueClient instances"
// - Thêm CRUD cho dvtool_translator_history

import { createClient } from "../lib/supabase.js";
import { storage } from "../lib/util.js";

const LS_KEY = "supa_session_cache";
const SINGLETON_KEY = "__DVTOOL_SB_CLIENT__";
const SINGLETON_CFG_KEY = "__DVTOOL_SB_CFG__";

function sameCfg(a, b) {
  if (!a || !b) return false;
  return String(a.url || "") === String(b.url || "") &&
         String(a.anonKey || "") === String(b.anonKey || "");
}

function parseAuthCodeFromUrl(redirectedUrl) {
  const url = new URL(redirectedUrl);
  const hashParams = new URLSearchParams(url.hash && url.hash.startsWith("#") ? url.hash.slice(1) : "");
  return hashParams.get("code") || url.searchParams.get("code");
}

function ensureSingletonClient(cfg) {
  const g = globalThis;
  if (!g[SINGLETON_KEY]) {
    if (!cfg?.url || !cfg?.anonKey) {
      throw new Error("Supabase URL / anonKey are missing. Set them in the Settings tab.");
    }
    g[SINGLETON_CFG_KEY] = { url: cfg.url, anonKey: cfg.anonKey };
    g[SINGLETON_KEY] = createClient(cfg.url, cfg.anonKey, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  } else if (!sameCfg(g[SINGLETON_CFG_KEY], cfg)) {
    console.warn("[dvtool] Supabase config changed. Reusing existing client to avoid multiple GoTrueClient instances. Reload popup to apply.");
  }
  return g[SINGLETON_KEY];
}

export const supa = {
  cfg: null,
  session: null,
  user: null,

  setConfig(cfg) {
    this.cfg = cfg;
    ensureSingletonClient(cfg);
  },
  get client() {
    if (!this.cfg) throw new Error("Supabase config not set.");
    return ensureSingletonClient(this.cfg);
  },

  redirectUri() {
    return chrome.identity.getRedirectURL("supabase-callback");
  },

  async loginWithGoogle() {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: this.redirectUri(),
        skipBrowserRedirect: true,
        queryParams: { access_type: "offline", prompt: "consent" }
      }
    });
    if (error) throw error;
    const authUrl = data?.url;
    if (!authUrl) throw new Error("No OAuth URL from Supabase.");

    const redirected = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    const code = parseAuthCodeFromUrl(redirected);
    if (!code) throw new Error("No auth code returned.");

    const { data: exch, error: exchErr } = await this.client.auth.exchangeCodeForSession(code);
    if (exchErr) throw exchErr;

    const session = exch?.session || (await this.client.auth.getSession()).data.session;
    const user = session?.user;
    if (!session || !user) throw new Error("No session after exchange.");

    this.session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at
    };
    this.user = { id: user.id, email: user.email };

    await storage.set(LS_KEY, { session: this.session, user: this.user });
    return { session: this.session, user: this.user };
  },

  async restore() {
    const { data } = await this.client.auth.getSession();
    if (data?.session?.user) {
      this.session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      };
      this.user = { id: data.session.user.id, email: data.session.user.email };
      return this.session;
    }
    const cached = await storage.get(LS_KEY);
    if (cached?.session && cached?.user) {
      this.session = cached.session;
      this.user = cached.user;
      return this.session;
    }
    return null;
  },

  async logout() {
    try { await this.client.auth.signOut(); } catch (_) {}
    this.session = null;
    this.user = null;
    await storage.remove(LS_KEY);
    return true;
  },

  // ============ Settings sync ============
  async pushSettings(settingsObj) {
    if (!this.user?.id) { await this.restore(); if (!this.user?.id) throw new Error("No authenticated user"); }
    const row = { user_id: this.user.id, data: settingsObj, updated_at: new Date().toISOString() };
    const { data, error } = await this.client
      .from("dvtool_settings")
      .upsert([row], { onConflict: "user_id" })
      .select()
      .maybeSingle();
    if (error) throw new Error("pushSettings failed: " + (error.message || JSON.stringify(error)));

    try { await this.client.from("dvtool_settings_log").insert([{ user_id: this.user.id, data: settingsObj }]); } catch (_) {}
    return data || row;
  },

  async pullSettings() {
    if (!this.user?.id) { await this.restore(); if (!this.user?.id) throw new Error("No authenticated user"); }
    const { data, error } = await this.client
      .from("dvtool_settings")
      .select("data, updated_at")
      .eq("user_id", this.user.id)
      .maybeSingle();
    if (error) throw new Error("pullSettings failed: " + (error.message || JSON.stringify(error)));
    return data || null;
  },

  // ============ Translator history (MỚI) ============
  async historyAdd(entry) {
    // entry: { ts, instructor, text, output, model, tone, audience }
    if (!this.user?.id) { await this.restore(); if (!this.user?.id) throw new Error("No authenticated user"); }
    const payload = [{ user_id: this.user.id, ...entry }];
    const { data, error } = await this.client
      .from("dvtool_translator_history")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw new Error("historyAdd failed: " + (error.message || JSON.stringify(error)));
    return data;
  },

  async historyList({ q = "", limit = 50 } = {}) {
    if (!this.user?.id) { await this.restore(); if (!this.user?.id) throw new Error("No authenticated user"); }
    let query = this.client
      .from("dvtool_translator_history")
      .select("id, ts, instructor, text, output, model, tone, audience")
      .eq("user_id", this.user.id)
      .order("ts", { ascending:false })
      .limit(limit);

    if (q) {
      // search in text/output/instructor
      query = query.or(`text.ilike.%${q}%,output.ilike.%${q}%,instructor.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error("historyList failed: " + (error.message || JSON.stringify(error)));
    return data || [];
  },

  async historyDelete(id) {
    if (!this.user?.id) { await this.restore(); if (!this.user?.id) throw new Error("No authenticated user"); }
    const { error } = await this.client
      .from("dvtool_translator_history")
      .delete()
      .eq("id", id)
      .eq("user_id", this.user.id);
    if (error) throw new Error("historyDelete failed: " + (error.message || JSON.stringify(error)));
    return true;
  },

  async historyClear() {
    if (!this.user?.id) { await this.restore(); if (!this.user?.id) throw new Error("No authenticated user"); }
    const { error } = await this.client
      .from("dvtool_translator_history")
      .delete()
      .eq("user_id", this.user.id);
    if (error) throw new Error("historyClear failed: " + (error.message || JSON.stringify(error)));
    return true;
  }
};
