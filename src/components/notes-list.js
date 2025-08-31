// src/components/notes-list.js
import '../components/md-viewer.js';

export class NotesList extends HTMLElement{
  static get observedAttributes(){ return ['mode']; }

  constructor(){
    super();
    this.mode = this.getAttribute('mode') || 'column'; // 'column' | 'large' | 'list'
    this.items = [];
  }

  connectedCallback(){
    this.mode = this.getAttribute('mode') || this.mode || 'column';
    this.render();
  }

  attributeChangedCallback(name, oldVal, newVal){
    if (name === 'mode' && oldVal !== newVal){
      this.mode = newVal || 'column';
      this.render();
    }
  }

  setMode(mode){
    this.mode = mode || 'column';
    this.setAttribute('mode', this.mode);
    this.render();
  }

  setData({ items = [], mode }){
    if (mode) this.setMode(mode);
    this.items = Array.isArray(items) ? items : [];
    this.render();
  }

  templateActionsRight(n){
    const isColumn = this.mode === 'column';
    // Ẩn hẳn 2 nút khi ColumnMode (không render)
    return `
      <button class="btn" data-act="pin" title="${n.pinned?'Unpin':'Pin'}">${n.pinned?'📌':'📍'}</button>
      <button class="btn" data-act="edit" title="Edit">✏️</button>
      ${isColumn ? '' : '<button class="btn" data-act="edit-tags" title="Edit tags">🏷️</button>'}
      ${isColumn ? '' : '<button class="btn" data-act="duplicate" title="Duplicate">⧉</button>'}
      <button class="btn danger" data-act="delete" title="Delete">🗑️</button>
    `;
  }

  templateCard(n, i){
    const isList = this.mode === 'list';
    return `
      <div class="card" data-id="${n.id}" data-index="${i}">
        ${isList ? `
          <div class="content list" title="Double-click to edit">
            <md-viewer>${n.content_html || ''}</md-viewer>
          </div>
          <div class="row-actions">
            <div class="left">
              <button class="btn handle" draggable="true" title="Drag to reorder" aria-label="Drag">≡</button>
            </div>
            <div class="right">
              ${this.templateActionsRight(n)}
            </div>
          </div>
        ` : `
          <div class="box" title="Double-click to edit">
            <div class="content grid">
              <md-viewer>${n.content_html || ''}</md-viewer>
            </div>
            <div class="footer">
              <div class="left">
                <button class="btn handle" draggable="true" title="Drag to reorder" aria-label="Drag">≡</button>
              </div>
              <div class="right">
                ${this.templateActionsRight(n)}
              </div>
            </div>
          </div>
        `}
      </div>
    `;
  }

  render(){
    // :host là grid container, không có wrapper
    const cols =
      this.mode === 'list'  ? '1fr' :
      this.mode === 'large' ? '1fr' :
                              'repeat(2, minmax(0, 1fr))'; // column: 2 cột

    this.style.display = 'grid';
    this.style.gridTemplateColumns = cols;
    this.style.gap = '8px';
    this.style.margin = '0';
    this.style.padding = '0';
    this.style.width = '100%';

    this.innerHTML = `
      <style>
        /* Phòng hờ: nếu có nơi nào vẫn render, CSS này cũng ẩn khi ColumnMode */
        :host([mode="column"]) .btn[data-act="edit-tags"],
        :host([mode="column"]) .btn[data-act="duplicate"] { display:none; }

        /* Card cơ bản */
        .card{
          box-sizing:border-box;
          background:#111827;
          border:1px solid #1f2937;
          border-radius:12px;
          padding:10px;
          position:relative;
          overflow:hidden;
          user-select:text;
          width:100%;
          min-width:0; /* tránh nở ngang trong grid/flex cha */
        }

        /* Drop highlight */
        .card.drop-top::before{content:"";position:absolute;left:0;right:0;top:0;border-top:2px solid #22d3ee}
        .card.drop-bottom::after{content:"";position:absolute;left:0;right:0;bottom:0;border-bottom:2px solid #22d3ee}

        /* Hộp nội dung mặc định */
        .box{ width:100%; gap:8px; }

        /* ColumnMode: vuông, nội dung cuộn trong ô */
        :host([mode="column"]) .box{
          display:flex; flex-direction:column;
          aspect-ratio:1 / 1;
          min-height:180px;
        }
        :host([mode="column"]) .content.grid{
          flex:1; overflow:auto; /* giữ vuông, content dài sẽ cuộn */
        }

        /* LargeMode: chiều cao theo nội dung */
        :host([mode="large"]) .box{
          display:block;
          aspect-ratio:auto;
          min-height:unset;
        }
        :host([mode="large"]) .content.grid{
          overflow:visible; /* hiển thị hết nội dung */
        }

        /* Không tràn ngang nội dung */
        .content{max-width:100%; overflow-y:auto; overflow-x:hidden;}
        .content md-viewer{ display:block; max-width:100%; }

        /* ListMode: tóm tắt 2 dòng */
        .content.list md-viewer{
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .row-actions{display:flex;justify-content:space-between;align-items:center;margin-top:8px}

        .footer{display:flex;justify-content:space-between;align-items:center}
        .btn{
          width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;
          background:#1f2937;border:1px solid #374151;color:#e5e7eb;cursor:pointer;padding:0
        }
        .btn:hover{filter:brightness(1.05)}
        .danger{background:#3b1f20;border-color:#5b3032;color:#fca5a5}
        .handle{cursor:grab}
      </style>
      ${this.items.map((n,i)=> this.templateCard(n,i)).join('')}
    `;

    // Actions
    this.querySelectorAll('.card .btn').forEach(b=>{
      const act = b.getAttribute('data-act');
      if (!act) return;
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const card = b.closest('.card');
        const id = card.getAttribute('data-id');
        this.dispatchEvent(new CustomEvent(act, { detail: { id }}));
      });
    });

    // Double-click content để edit
    this.querySelectorAll('.card .content').forEach(c=>{
      c.addEventListener('dblclick', ()=>{
        const card = c.closest('.card');
        this.dispatchEvent(new CustomEvent('edit', { detail: { id: card.getAttribute('data-id') }}));
      });
    });

    // Drag via handle + drop highlight
    let dragId = null;
    this.querySelectorAll('.handle').forEach(h=>{
      h.addEventListener('dragstart', (e)=>{
        const card = h.closest('.card');
        dragId = card.getAttribute('data-id');
        e.dataTransfer.setData('text/plain', dragId);
        e.dataTransfer.effectAllowed = 'move';
      });
    });

    const clearHighlight = () => {
      this.querySelectorAll('.card').forEach(c => c.classList.remove('drop-top','drop-bottom'));
    };

    this.querySelectorAll('.card').forEach(card=>{
      card.addEventListener('dragover', e=>{
        e.preventDefault();
        clearHighlight();
        const rect = card.getBoundingClientRect();
        const halfway = rect.top + rect.height/2;
        if (e.clientY < halfway) card.classList.add('drop-top');
        else card.classList.add('drop-bottom');
      });
      card.addEventListener('dragleave', ()=> card.classList.remove('drop-top','drop-bottom'));
      card.addEventListener('drop', e=>{
        e.preventDefault();
        const dstId = card.getAttribute('data-id');
        const before = card.classList.contains('drop-top');
        clearHighlight();
        if (!dragId || dragId === dstId) { dragId = null; return; }

        const arr = [...this.items];
        const from = arr.findIndex(n=>n.id===dragId);
        let to = arr.findIndex(n=>n.id===dstId);
        if (!before) to += 1;
        if (from < 0 || to < 0) { dragId = null; return; }

        const [moved] = arr.splice(from,1);
        if (to > from) to -= 1;
        arr.splice(to,0,moved);
        const pairs = arr.map((x, idx)=>({ id: x.id, order_index: idx }));
        this.dispatchEvent(new CustomEvent('reorder', { detail: { order: pairs }}));
        dragId = null;
      });
    });
  }
}
customElements.define('notes-list', NotesList);
