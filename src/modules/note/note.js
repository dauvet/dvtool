// src/modules/note/note.js
import '../../components/rte-editor.js';
import '../../components/tags-bar.js';
import '../../components/notes-list.js';
import '../../components/tag-input.js';
import { notesService } from '../../services/notes.service.js';
import { toast } from '../../components/ui-toast.js';
import { settings } from '../../services/settings.service.js';

function debounce(fn, wait=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }

export async function init(root){
  const $search = root.querySelector('#search');
  const $add = root.querySelector('#add');
  const $toggle = root.querySelector('#toggle');
  const $exportAll = root.querySelector('#exportAll');
  const $tags = root.querySelector('#tags');
  const $list = root.querySelector('#list');

  const $editorModal = root.querySelector('#editorModal');
  const $editor = root.querySelector('#editor');
  const $tagInput = root.querySelector('#tagInput');
  const $exportOne = root.querySelector('#exportOne');
  const $lastUpdate = root.querySelector('#lastUpdate');
  const $closeModal = root.querySelector('#closeModal');
  const $saveNote = root.querySelector('#saveNote');

  const $tagsModal = root.querySelector('#tagsModal');
  const $tagModalInput = root.querySelector('#tagModalInput');
  const $closeTags = root.querySelector('#closeTags');
  const $saveTags = root.querySelector('#saveTags');

  let state = {
    q: '',
    mode: (settings.get().notes?.mode || 'column'), // 'column' | 'large' | 'list'
    activeTag: '',
    notes: [],
    tags: [],
    editingId: null,
    isNew: false,
  };

  function persistUI(){
    const st = settings.get(); st.notes = st.notes || {};
    st.notes.mode = state.mode;
    settings.save(st);
  }

  function openModal(){ $editorModal.style.display = 'flex'; }
  function closeModal(){ $editorModal.style.display = 'none'; }
  function openTagsModal(){ $tagsModal.style.display = 'flex'; }
  function closeTagsModal(){ $tagsModal.style.display = 'none'; }

  async function refreshTagsOptions(){
    state.tags = await notesService.tagsList();
    $tagInput.setOptions(state.tags);
    $tagModalInput.setOptions(state.tags);
  }

  async function refresh(){
    await notesService.sync().catch(()=>{});
    await refreshTagsOptions();
    try{
      const notes = await notesService.list({
        q: state.q,
        tagId: state.activeTag
      });
      state.notes = notes;

      const counts = await notesService.noteTagCounts(notes);
      $tags.setData({
        tags: state.tags,
        active: state.activeTag || 'all',
        counts,
        total: notes.length
      });

      $list.setData({ items: notes, mode: state.mode });
    }catch(e){
      console.error(e);
      toast(e.message || 'Load failed. Sign in first?');
    }
  }

  // realtime search
  const doSearch = debounce(async ()=>{
    state.q = $search.value.trim();
    await refresh();
  }, 250);
  $search.addEventListener('input', doSearch);

  // tag filter bar
  $tags.addEventListener('filter', async (e)=>{
    state.activeTag = e.detail.tagId || '';
    await refresh();
  });

  // toggle layout (cycle 3 modes)
  const modes = ['column','large','list'];
  $toggle.addEventListener('click', ()=>{
    const idx = modes.indexOf(state.mode);
    state.mode = modes[(idx+1)%modes.length];
    $list.setAttribute('mode', state.mode);
    $list.setData({ items: state.notes, mode: state.mode });
    persistUI();
    toast(`Mode: ${state.mode}`);
  });

  // Add new (không auto-save)
  $add.addEventListener('click', ()=>{
    state.isNew = true;
    state.editingId = null;
    $editor.value = '';
    $tagInput.setValue([]);
    $lastUpdate.textContent = '—';
    openModal();
  });

  // Export all
  $exportAll.addEventListener('click', async ()=>{
    try{
      const current = await notesService.list({ q: state.q, tagId: state.activeTag, limit: 9999 });
      await notesService.exportAllZip(current);
    }catch(e){ toast('Export failed.'); }
  });

  // List actions (đã bỏ archive hoàn toàn)
  $list.addEventListener('edit', async (e)=>{
    const id = e.detail.id;
    const target = state.notes.find(n => n.id === id);
    if (!target) return;
    state.isNew = false;
    state.editingId = id;
    $editor.value = target.content_html || '';
    const tagIds = await notesService.getTagsForNote(id);
    const selected = state.tags.filter(t => tagIds.includes(t.id));
    $tagInput.setValue(selected);
    $lastUpdate.textContent = target.updated_at ? new Date(target.updated_at).toLocaleString() : '—';
    openModal();
  });

  $list.addEventListener('duplicate', async (e)=>{
    try{
      const id = e.detail.id;
      const target = state.notes.find(n => n.id === id);
      if (!target) return;
      await notesService.create({ content_html: target.content_html || '', order_index: 0, pinned:false });
      const notes = await notesService.list({ limit: 999 });
      const reordered = notes.map((n, idx)=>({ id: n.id, order_index: idx }));
      await notesService.reorder(reordered);
      await refresh();
      toast('Duplicated.');
    }catch(err){ toast(err.message || 'Duplicate failed.'); }
  });

  $list.addEventListener('delete', async (e)=>{
    if (!confirm('Delete this note?')) return;
    try{ await notesService.remove(e.detail.id); await refresh(); toast('Deleted.'); }
    catch(err){ toast(err.message || 'Delete failed.'); }
  });

  $list.addEventListener('reorder', async (e)=>{
    try{ await notesService.reorder(e.detail.order); await refresh(); }
    catch(err){ toast(err.message || 'Reorder failed.'); }
  });

  $list.addEventListener('edit-tags', async (e)=>{
    const id = e.detail.id;
    const target = state.notes.find(n => n.id === id);
    if (!target) return;
    state.isNew = false;
    state.editingId = id;
    const tagIds = await notesService.getTagsForNote(id);
    const selected = state.tags.filter(t => tagIds.includes(t.id));
    $tagModalInput.setValue(selected);
    openTagsModal();
  });

  $list.addEventListener('pin', async (e)=>{
    try{
      const id = e.detail.id;
      const target = state.notes.find(n => n.id === id);
      await notesService.update({ id, pinned: !target.pinned });
      await refresh();
    }catch(err){ toast('Pin failed.'); }
  });

  // Editor: export single
  $exportOne.addEventListener('click', ()=>{
    const name = state.editingId || 'note';
    notesService.exportOneAs(name, $editor.value || '');
  });

  // Save + tags
  $saveNote.addEventListener('click', async ()=>{
    try{
      let noteId = state.editingId;
      if (state.isNew) {
        const created = await notesService.create({ content_html: $editor.value, order_index: 0 });
        noteId = created.id;
        const notes = await notesService.list({ limit: 999 });
        const reordered = notes.map((n, idx)=>({ id: n.id, order_index: idx }));
        await notesService.reorder(reordered);
      } else {
        await notesService.update({ id: noteId, content_html: $editor.value });
      }

      // Tags: tạo tag nếu chưa có, rồi gán
      const chosen = $tagInput.getValue(); // [{id?, name, color?}]
      const existingByName = new Map(state.tags.map(t=>[t.name.toLowerCase(), t]));
      const tagIds = [];
      for (const t of chosen){
        let id = t.id;
        if (!id) {
          const exist = existingByName.get((t.name||'').toLowerCase());
          if (exist) id = exist.id;
          else {
            const createdTag = await notesService.tagUpsert({ name: t.name, color: t.color || null });
            id = createdTag?.id || id;
          }
        }
        if (id) tagIds.push(id);
      }
      await notesService.setTagsForNote(noteId, tagIds);

      await refresh();
      closeModal();
      toast('Saved.');
    }catch(e){ toast(e.message || 'Save failed.'); }
  });

  // Close editor
  $closeModal.addEventListener('click', ()=> closeModal());
  $editorModal.addEventListener('click', (e)=>{ if (e.target === $editorModal) closeModal(); });

  // Assign Tags modal
  $closeTags.addEventListener('click', closeTagsModal);
  $saveTags.addEventListener('click', async ()=>{
    try{
      if (!state.editingId) { closeTagsModal(); return; }
      const chosen = $tagModalInput.getValue();
      const existingByName = new Map(state.tags.map(t=>[t.name.toLowerCase(), t]));
      const tagIds = [];
      for (const t of chosen){
        let id = t.id;
        if (!id) {
          const exist = existingByName.get((t.name||'').toLowerCase());
          if (exist) id = exist.id;
          else {
            const createdTag = await notesService.tagUpsert({ name: t.name, color: t.color || null });
            id = createdTag?.id || id;
          }
        }
        if (id) tagIds.push(id);
      }
      await notesService.setTagsForNote(state.editingId, tagIds);
      await refresh();
      closeTagsModal();
      toast('Tags updated.');
    }catch(e){ toast(e.message || 'Update tags failed.'); }
  });

  // Initial
  $list.setAttribute('mode', state.mode);
  await refresh();
}
