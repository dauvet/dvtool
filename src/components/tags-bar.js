// src/components/tags-bar.js
export class TagsBar extends HTMLElement{
  connectedCallback(){
    this.tags = [];
    this.active = 'all';
    this.counts = {}; // {tag_id: number}
    this.total = 0;   // total visible notes
    this.render();
  }
  setData({ tags = [], active = 'all', counts = {}, total = 0 }){
    this.tags = tags;
    this.active = active || 'all';
    this.counts = counts || {};
    this.total = total || 0;
    this.render();
  }
  render(){
    const countStr = (id)=> (id==='all' ? this.total : (this.counts?.[id] || 0));
    this.innerHTML = `
      <style>
        .wrap{display:flex;flex-wrap:wrap;gap:6px}
        .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#1f2937;border:1px solid #374151;color:#e5e7eb;cursor:pointer;font-size:12px}
        .chip.active{border-color:rgba(34,211,238,.75);box-shadow:0 0 0 2px rgba(34,211,238,.25) inset}
        .count{opacity:.8;font-size:11px}
      </style>
      <div class="wrap">
        <span class="chip ${this.active==='all'?'active':''}" data-id="all">All <span class="count">(${countStr('all')})</span></span>
        ${this.tags.map(t => `
          <span class="chip ${this.active===t.id?'active':''}" data-id="${t.id}">
            ${t.name} <span class="count">(${countStr(t.id)})</span>
          </span>`).join('')}
      </div>
    `;
    this.querySelectorAll('.chip').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const id = ch.getAttribute('data-id');
        this.active = id;
        this.render();
        this.dispatchEvent(new CustomEvent('filter', { detail: { tagId: id==='all'?'':id }}));
      });
    });
  }
}
customElements.define('tags-bar', TagsBar);
