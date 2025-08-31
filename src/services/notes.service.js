// src/services/notes.service.js
import { settings } from './settings.service.js';

const QUEUE_KEY = 'dvtool_notes_queue';
const CACHE_NOTES_KEY = 'dvtool_notes_cache';
const CACHE_TAGS_KEY = 'dvtool_tags_cache';

async function getStore(key, def = null){
  if (chrome?.storage?.local) {
    const obj = await chrome.storage.local.get([key]);
    return obj?.[key] ?? def;
  }
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
async function setStore(key, val){
  if (chrome?.storage?.local) return chrome.storage.local.set({ [key]: val });
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function isOnline(){ return navigator.onLine; }
function nowIso(){ return new Date().toISOString(); }

// naive HTML -> Markdown (export)
function htmlToMarkdown(html){
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<\/p>\s*<p>/g, '\n\n')
       .replace(/<br\s*\/?>/gi, '\n')
       .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
       .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
       .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
       .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
       .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
       .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
       .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
       .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
       .replace(/<ul[^>]*>|<\/ul>/gi, '')
       .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
       .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (m, c)=>`\n\`\`\`\n${c}\n\`\`\`\n`)
       .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<[^>]+>/g, '');
  return s.trim();
}

// Tiny ZIP builder (STORE)
function str2u8(s){ return new TextEncoder().encode(s); }
function crc32(buf){ let c=~0>>>0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let j=0;j<8;j++) c=(c>>>1) ^ (0xEDB88320 & -(c&1)); } return (~c)>>>0; }
function le32(n){ const b=new Uint8Array(4); new DataView(b.buffer).setUint32(0,n,true); return b; }
function le16(n){ const b=new Uint8Array(2); new DataView(b.buffer).setUint16(0,n,true); return b; }
function concat(...arrs){ let len=0; for(const a of arrs) len+=a.length; const out=new Uint8Array(len); let off=0; for(const a of arrs){ out.set(a,off); off+=a.length; } return out; }
function createZip(files){
  let offset=0; const locals=[], centrals=[];
  for(const f of files){
    const nameU8=str2u8(f.name), data=f.data;
    const size=data.length, crc=crc32(data);
    const local=concat(le32(0x04034b50),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(size),le32(size),le16(nameU8.length),le16(0),nameU8,data);
    locals.push(local);
    const central=concat(le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(size),le32(size),le16(nameU8.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),nameU8);
    centrals.push(central); offset+=local.length;
  }
  const centralDir=concat(...centrals);
  const localAll=concat(...locals);
  const end=concat(le32(0x06054b50),le16(0),le16(0),le16(files.length),le16(files.length),le32(centralDir.length),le32(localAll.length),le16(0));
  return new Blob([localAll, centralDir, end], {type:'application/zip'});
}

export const notesService = {
  async withSupa() {
    const { supa } = await import('./supabase.service.js');
    const cfg = settings.get().supabase;
    supa.setConfig(cfg);
    await supa.restore();
    if (!supa.user) throw new Error('You must sign in to use Notes.');
    return { supa, user_id: supa.user.id };
  },

  // ---------- OFFLINE QUEUE ----------
  async enqueue(op){
    const q = await getStore(QUEUE_KEY, []);
    q.push({ ...op, ts: nowIso() });
    await setStore(QUEUE_KEY, q);
  },
  async sync(){
    if (!isOnline()) return;
    let q = await getStore(QUEUE_KEY, []);
    if (!q.length) return;
    try{
      const { supa, user_id } = await this.withSupa();
      for (const op of q){
        const p = op.payload || {};
        if (op.type === 'create') {
          await supa.client.from('dvtool_notes').insert([{ user_id, ...p }]);
        } else if (op.type === 'update') {
          await supa.client.from('dvtool_notes').update(p.patch).eq('id', p.id).eq('user_id', user_id);
        } else if (op.type === 'delete') {
          await supa.client.from('dvtool_notes').delete().eq('id', p.id).eq('user_id', user_id);
        } else if (op.type === 'reorder') {
          for (const it of p.pairs) {
            await supa.client.from('dvtool_notes')
              .update({ order_index: it.order_index, updated_at: nowIso() })
              .eq('id', it.id).eq('user_id', user_id);
          }
        } else if (op.type === 'setTags') {
          await supa.client.from('dvtool_note_tags').delete().eq('note_id', p.note_id).eq('user_id', user_id);
          if (p.tagIds?.length) {
            await supa.client.from('dvtool_note_tags').insert(p.tagIds.map(t=>({ note_id: p.note_id, tag_id: t, user_id })));
          }
        } else if (op.type === 'tagUpsert') {
          if (p.id) {
            await supa.client.from('dvtool_tags').update({ name: p.name, color: p.color }).eq('id', p.id).eq('user_id', user_id);
          } else {
            await supa.client.from('dvtool_tags').insert([{ user_id, name: p.name, color: p.color }]);
          }
        }
      }
      q = [];
      await setStore(QUEUE_KEY, q);
    }catch(_){ /* keep queue */ }
  },

  async cacheSet({ notes, tags }){
    if (notes) await setStore(CACHE_NOTES_KEY, notes);
    if (tags) await setStore(CACHE_TAGS_KEY, tags);
  },
  async cacheGet(){
    return {
      notes: await getStore(CACHE_NOTES_KEY, []),
      tags: await getStore(CACHE_TAGS_KEY, [])
    };
  },

  // ---------- LIST (đã bỏ archived) ----------
  async list({ q = '', tagId = '', limit = 500 } = {}) {
    try{
      const { supa, user_id } = await this.withSupa();
      let query = supa.client.from('dvtool_notes').select('*').eq('user_id', user_id);
      if (q) query = query.ilike('content_html', `%${q}%`);
      const { data, error } = await query
        .order('pinned', { ascending: false })
        .order('order_index', { ascending: true })
        .limit(limit);
      if (error) throw error;

      let out = data;
      if (tagId) {
        const { data: joins, error: je } = await supa.client
          .from('dvtool_note_tags').select('note_id').eq('user_id', user_id).eq('tag_id', tagId);
        if (je) throw je;
        const set = new Set(joins.map(j => j.note_id));
        out = data.filter(n => set.has(n.id));
      }
      await this.cacheSet({ notes: out });
      return out;
    }catch(_){
      const cache = await this.cacheGet();
      let out = cache.notes;
      if (q) out = out.filter(n => (n.content_html||'').toLowerCase().includes(q.toLowerCase()));
      if (tagId) out = out.filter(n => (n.tagIds||[]).includes(tagId));
      return out;
    }
  },

  // ---------- CRUD ----------
  async create({ content_html = '<p></p>', order_index = 0, pinned=false }) {
    if (!isOnline()) {
      const id = crypto.randomUUID();
      const item = { id, content_html, order_index, updated_at: nowIso(), pinned };
      const cache = await this.cacheGet();
      cache.notes.unshift(item);
      await this.cacheSet({ notes: cache.notes });
      await this.enqueue({ type:'create', payload: item });
      return item;
    }
    const { supa, user_id } = await this.withSupa();
    const { data: inserted, error } = await supa.client
      .from('dvtool_notes')
      .insert([{ user_id, content_html, order_index, pinned }])
      .select('*').single();
    if (error) throw error;
    return inserted;
  },

  async update({ id, content_html, order_index, pinned }) {
    const patch = { updated_at: nowIso() };
    if (content_html != null) patch.content_html = content_html;
    if (order_index != null) patch.order_index = order_index;
    if (pinned != null) patch.pinned = pinned;

    if (!isOnline()) {
      const cache = await this.cacheGet();
      const idx = cache.notes.findIndex(n => n.id === id);
      if (idx >= 0) cache.notes[idx] = { ...cache.notes[idx], ...patch };
      await this.cacheSet({ notes: cache.notes });
      await this.enqueue({ type:'update', payload: { id, patch }});
      return cache.notes[idx];
    }

    const { supa, user_id } = await this.withSupa();
    const { data, error } = await supa.client
      .from('dvtool_notes').update(patch).eq('id', id).eq('user_id', user_id).select('*').single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (!isOnline()) {
      const cache = await this.cacheGet();
      await this.cacheSet({ notes: cache.notes.filter(n => n.id !== id) });
      await this.enqueue({ type:'delete', payload: { id }});
      return;
    }
    const { supa, user_id } = await this.withSupa();
    const { error } = await supa.client.from('dvtool_notes').delete().eq('id', id).eq('user_id', user_id);
    if (error) throw error;
  },

  async reorder(orderPairs) {
    if (!isOnline()) {
      const cache = await this.cacheGet();
      const map = new Map(orderPairs.map(p=>[p.id, p.order_index]));
      cache.notes = cache.notes.map(n => map.has(n.id) ? { ...n, order_index: map.get(n.id) } : n);
      cache.notes.sort((a,b)=> (b.pinned - a.pinned) || (a.order_index - b.order_index));
      await this.cacheSet({ notes: cache.notes });
      await this.enqueue({ type:'reorder', payload: { pairs: orderPairs }});
      return;
    }
    const { supa, user_id } = await this.withSupa();
    for (const p of orderPairs) {
      const { error } = await supa.client
        .from('dvtool_notes')
        .update({ order_index: p.order_index, updated_at: nowIso() })
        .eq('id', p.id).eq('user_id', user_id);
      if (error) throw error;
    }
  },

  // ---------- TAGS ----------
  async tagsList() {
    try{
      const { supa, user_id } = await this.withSupa();
      const { data, error } = await supa.client.from('dvtool_tags').select('*').eq('user_id', user_id).order('name');
      if (error) throw error;
      await this.cacheSet({ tags: data });
      return data;
    }catch(_){
      const cache = await this.cacheGet();
      return cache.tags;
    }
  },

  async tagUpsert({ id, name, color }) {
    if (!isOnline()) {
      await this.enqueue({ type:'tagUpsert', payload: { id, name, color }});
      const tags = await this.tagsList();
      const idx = tags.findIndex(t=>t.id===id);
      if (idx >=0) tags[idx] = { ...tags[idx], name, color };
      else tags.push({ id: id || crypto.randomUUID(), name, color });
      await this.cacheSet({ tags });
      return tags.find(t=>t.id===id) || tags[tags.length-1];
    }
    const { supa, user_id } = await this.withSupa();
    if (id) {
      const { data, error } = await supa.client.from('dvtool_tags').update({ name, color }).eq('id', id).eq('user_id', user_id).select('*').single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supa.client.from('dvtool_tags').insert([{ user_id, name, color }]).select('*').single();
      if (error) throw error;
      return data;
    }
  },

  async setTagsForNote(note_id, tagIds) {
    if (!isOnline()) {
      await this.enqueue({ type:'setTags', payload: { note_id, tagIds }});
      const cache = await this.cacheGet();
      const idx = cache.notes.findIndex(n=>n.id===note_id);
      if (idx>=0) cache.notes[idx] = { ...cache.notes[idx], tagIds: [...tagIds] };
      await this.cacheSet({ notes: cache.notes });
      return;
    }
    const { supa, user_id } = await this.withSupa();
    const { error: dErr } = await supa.client.from('dvtool_note_tags').delete().eq('note_id', note_id).eq('user_id', user_id);
    if (dErr) throw dErr;
    if (tagIds?.length) {
      const { error: iErr } = await supa.client.from('dvtool_note_tags').insert(tagIds.map(t=>({ note_id, tag_id: t, user_id })));
      if (iErr) throw iErr;
    }
  },

  async getTagsForNote(note_id) {
    try{
      const { supa, user_id } = await this.withSupa();
      const { data, error } = await supa.client.from('dvtool_note_tags').select('tag_id').eq('note_id', note_id).eq('user_id', user_id);
      if (error) throw error;
      return data.map(r => r.tag_id);
    }catch(_){
      const cache = await this.cacheGet();
      const n = cache.notes.find(x=>x.id===note_id);
      return n?.tagIds || [];
    }
  },

  async noteTagCounts(notes){
    const noteIds = (notes||[]).map(n=>n.id);
    if (!noteIds.length) return {};
    try{
      const { supa, user_id } = await this.withSupa();
      const { data, error } = await supa.client
        .from('dvtool_note_tags')
        .select('note_id, tag_id')
        .eq('user_id', user_id)
        .in('note_id', noteIds);
      if (error) throw error;
      const counts = {};
      for (const row of data) counts[row.tag_id] = (counts[row.tag_id]||0)+1;
      return counts;
    }catch(_){
      const counts = {};
      for (const n of notes){
        for (const tid of (n.tagIds||[])) counts[tid] = (counts[tid]||0)+1;
      }
      return counts;
    }
  },

  // ---------- EXPORT ----------
  exportOneAs(nameBase, html){
    const htmlBlob = new Blob([html], { type:'text/html' });
    const a1 = document.createElement('a'); a1.href = URL.createObjectURL(htmlBlob); a1.download = `${nameBase}.html`; a1.click();
    const mdBlob = new Blob([htmlToMarkdown(html)], { type:'text/markdown' });
    const a2 = document.createElement('a'); a2.href = URL.createObjectURL(mdBlob); a2.download = `${nameBase}.md`; a2.click();
  },
  async exportAllZip(notes){
    const files = [];
    for (const n of notes){
      const base = (n.id || 'note');
      files.push({ name: `${base}.html`, data: str2u8(n.content_html || '') });
      files.push({ name: `${base}.md`, data: str2u8(htmlToMarkdown(n.content_html || '')) });
    }
    const zipBlob = createZip(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `notes-export-${Date.now()}.zip`;
    a.click();
  }
};

window.addEventListener('online', () => { notesService.sync().catch(()=>{}); });
