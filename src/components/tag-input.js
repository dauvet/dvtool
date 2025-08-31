// src/components/tag-input.js
export class TagInput extends HTMLElement{
  connectedCallback(){
    this.items = [];      // all tags: [{id,name,color}]
    this.selected = [];   // selected tags: [{id?,name,color?}]
    this.innerHTML = `
      <style>
        .wrap{display:flex;align-items:center;gap:6px;flex-wrap:wrap;border:1px solid #23304a;border-radius:10px;background:#0b1220;padding:6px}
        .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:#1f2937;border:1px solid #374151;color:#e5e7eb;font-size:12px}
        .pill .x{cursor:pointer;opacity:.8}
        input{flex:1;min-width:140px;background:transparent;border:none;outline:none;color:#e5e7eb;padding:4px}
        .suggest{position:relative}
        .menu{position:absolute;left:0;top:100%;z-index:10;background:#0f172a;border:1px solid #23304a;border-radius:8px;min-width:220px;max-height:220px;overflow:auto}
        .opt{padding:6px 8px;cursor:pointer}
        .opt:hover{background:#111827}
        .dot{width:8px;height:8px;border-radius:999px;display:inline-block;margin-right:6px}
      </style>
      <div class="wrap">
        <div class="tags"></div>
        <div class="suggest">
          <input class="inp" placeholder="Add tags…"/>
          <div class="menu" style="display:none"></div>
        </div>
      </div>
    `;
    this.$tags = this.querySelector('.tags');
    this.$inp = this.querySelector('.inp');
    this.$menu = this.querySelector('.menu');

    this.$inp.addEventListener('input', ()=> this.renderMenu());
    this.$inp.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter'){
        e.preventDefault();
        const txt = this.$inp.value.trim();
        if (!txt) return;
        const match = this.items.find(t => t.name.toLowerCase() === txt.toLowerCase());
        const chosen = match || { name: txt };
        this.addTag(chosen);
        this.$inp.value = '';
        this.hideMenu();
      } else if (e.key === 'Backspace' && !this.$inp.value){
        // remove last
        this.removeTag(this.selected[this.selected.length-1]?.name);
      }
    });
    document.addEventListener('click', (e)=>{
      if (!this.contains(e.target)) this.hideMenu();
    });
    this.render();
  }

  setOptions(tags){ this.items = Array.isArray(tags)? tags: []; this.renderMenu(); }
  setValue(tagObjsOrIds){
    this.selected = (tagObjsOrIds||[]).map(x=>{
      if (typeof x === 'string') return this.items.find(t=>t.id===x) || { name: x };
      return x;
    });
    this.render();
  }
  getValue(){ return this.selected; }

  addTag(t){
    if (!t) return;
    if (this.selected.some(s => (s.id && t.id && s.id===t.id) || s.name.toLowerCase()===t.name.toLowerCase())) return;
    this.selected.push({ id: t.id, name: t.name, color: t.color });
    this.render();
    this.emitChange();
  }
  removeTag(name){
    if (!name) return;
    this.selected = this.selected.filter(s => s.name !== name);
    this.render();
    this.emitChange();
  }

  render(){
    this.$tags.innerHTML = this.selected.map(s=>`
      <span class="pill">
        <span class="dot" style="background:${s.color||'#64748b'}"></span>${s.name}
        <span class="x" title="Remove">✕</span>
      </span>
    `).join('');
    this.$tags.querySelectorAll('.pill .x').forEach((x,i)=>{
      x.addEventListener('click', ()=> this.removeTag(this.selected[i].name));
    });
  }

  renderMenu(){
    const q = this.$inp.value.trim().toLowerCase();
    const opts = this.items
      .filter(t => !this.selected.some(s => (s.id && t.id && s.id===t.id) || s.name.toLowerCase()===t.name.toLowerCase()))
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .slice(0,50);
    if (!opts.length){ this.hideMenu(); return; }
    this.$menu.innerHTML = opts.map(t=>`
      <div class="opt" data-id="${t.id}">
        <span class="dot" style="background:${t.color||'#64748b'}"></span>${t.name}
      </div>
    `).join('');
    this.$menu.style.display = 'block';
    this.$menu.querySelectorAll('.opt').forEach(opt=>{
      opt.addEventListener('click', ()=>{
        const id = opt.getAttribute('data-id');
        const tag = this.items.find(x=>x.id===id);
        this.addTag(tag);
        this.$inp.value = '';
        this.hideMenu();
      });
    });
  }
  hideMenu(){ this.$menu.style.display = 'none'; }

  emitChange(){
    this.dispatchEvent(new CustomEvent('change', { detail: { tags: this.getValue() }}));
  }
}
customElements.define('tag-input', TagInput);
