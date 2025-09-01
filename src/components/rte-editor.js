// src/components/rte-editor.js
// Shadow DOM rich text editor có toolbar.
// Sửa dứt điểm Enter: hard break (đoạn mới) & soft break (ngắt dòng).
// - Enter: đoạn mới (insertParagraph / fallback <br><br>)
// - Shift+Enter hoặc Ctrl/Cmd+Enter: ngắt dòng <br>
// - Trong <pre>: Enter chèn '\n'
// Ngoài ra: word-wrap triệt để, không tràn ngang.

function doCmd(cmd, val = null) {
  try {
    document.execCommand(cmd, false, val);
  } catch {}
}

class RteEditor extends HTMLElement {
  constructor() {
    super();
    this._inited = false;
    this._shadow = this.attachShadow({ mode: 'open' });
    this._value = '';
  }

  connectedCallback() {
    if (this._inited) return;
    this._inited = true;

    const style = document.createElement('style');
    style.textContent = `
      :host{ display:block; max-width:100%; }
      .rte{ border:1px solid #23304a; border-radius:12px; background:#0b1220; overflow:hidden; max-width:100%; }
      .toolbar{
        display:flex; flex-wrap:wrap; gap:6px; padding:8px;
        border-bottom:1px solid #23304a; background:#0d1628;
      }
      .btn{
        width:32px; height:32px; border-radius:8px;
        display:inline-flex; align-items:center; justify-content:center;
        background:#1f2937; border:1px solid #374151; color:#e5e7eb;
        cursor:pointer; padding:0; user-select:none;
      }
      .btn:hover{ filter:brightness(1.05); }
      .btn.active{ border-color:#22d3ee; box-shadow:0 0 0 2px rgba(34,211,238,.15) inset; }

      .editor{
        padding:12px; min-height:160px; outline:none; max-width:100%;
        /* wrap triệt để + giữ xuống dòng người dùng gõ */
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        overflow-x: hidden;
        height: 250px; 
        overflow: auto;
      }

      /* Không cho phần tử con “nở” quá khung */
      .editor, .editor *{ box-sizing:border-box; min-width:0; }

      /* Media co theo khung */
      .editor img, .editor video, .editor canvas, .editor iframe{
        max-width:100%; height:auto; display:block;
      }

      /* Code/Pre vẫn wrap */
      .editor pre, .editor code, .editor kbd, .editor samp{
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        max-width:100%;
      }

      /* Bảng cố định cột */
      .editor table{
        width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse;
      }
      .editor th, .editor td{ word-break: break-word; overflow-wrap:anywhere; }

      .editor a{ word-break:break-word; overflow-wrap:anywhere; }
    `;

    const rte = document.createElement('div');
    rte.className = 'rte';

    // Toolbar
    const tb = document.createElement('div');
    tb.className = 'toolbar';
    tb.innerHTML = `
      <button class="btn" data-cmd="bold" title="Bold"><b>B</b></button>
      <button class="btn" data-cmd="italic" title="Italic"><i>I</i></button>
      <button class="btn" data-cmd="underline" title="Underline"><u>U</u></button>
      <button class="btn" data-cmd="formatBlock" data-val="H1" title="H1">H1</button>
      <button class="btn" data-cmd="formatBlock" data-val="H2" title="H2">H2</button>
      <button class="btn" data-cmd="insertUnorderedList" title="Bullet">•</button>
      <button class="btn" data-cmd="insertOrderedList" title="Numbered">1.</button>
      <button class="btn" data-cmd="formatBlock" data-val="BLOCKQUOTE" title="Quote">❝</button>
      <button class="btn" data-cmd="formatBlock" data-val="PRE" title="Code">{</>}</button>
      <button class="btn" data-action="link" title="Link">🔗</button>
      <button class="btn" data-cmd="undo" title="Undo">↶</button>
      <button class="btn" data-cmd="redo" title="Redo">↷</button>
      <button class="btn" data-action="clear" title="Clear">✕</button>
    `;

    // Editor
    const ed = document.createElement('div');
    ed.className = 'editor';
    ed.contentEditable = 'true';

    // Nếu light DOM có nội dung, dùng làm initial value
    const initialLight = this.innerHTML.trim();
    if (initialLight) {
      this.innerHTML = '';
      this._value = initialLight;
    }
    if (this._value) ed.innerHTML = this._value;

    rte.append(tb, ed);
    this._shadow.append(style, rte);

    // Refs
    this.$editor = ed;
    this.$toolbar = tb;

    // Toolbar events
    this.$toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;

      this.$editor.focus();
      const action = btn.getAttribute('data-action');
      const cmdName = btn.getAttribute('data-cmd');
      const val = btn.getAttribute('data-val');

      if (action === 'link') {
        const url = prompt('Enter URL:');
        if (url) doCmd('createLink', url);
        return;
      }
      if (action === 'clear') {
        this.$editor.innerHTML = '';
        this._value = '';
        this._emit();
        return;
      }
      if (cmdName === 'formatBlock') {
        doCmd('formatBlock', `<${(val || 'P').toUpperCase()}>`);
        return;
      }
      if (cmdName) {
        doCmd(cmdName);
        return;
      }
    });

    // Nhập liệu
    this.$editor.addEventListener('input', () => {
      this._value = this.$editor.innerHTML;
      this._emit();
    });

    // Enter handling: hard/soft/pre
    this.$editor.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;

      const isSoft = e.shiftKey || e.ctrlKey || e.metaKey;
      e.preventDefault(); // chặn hành vi kỳ cục mặc định bạn gặp “chỉ thêm space”

      const sel = document.getSelection(); // Selection hoạt động cả trong shadow
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);

      // Nếu đang ở trong <pre>, chèn \n
      if (this._isInsideTag(range.startContainer, 'PRE')) {
        this._insertTextAtRange(range, '\n');
        return;
      }

      if (isSoft) {
        // Soft break = <br>
        this._insertSoftBreak(range);
      } else {
        // Hard break = đoạn mới
        this._insertHardBreak(range);
      }
    });
  }

  // ---------- Selection helpers ----------
  _isInsideTag(node, tagName) {
    tagName = String(tagName || '').toUpperCase();
    let n = node;
    while (n && n !== this.$editor) {
      if (n.nodeType === 1 && n.nodeName === tagName) return true;
      n = n.parentNode;
    }
    return false;
  }

  _insertTextAtRange(range, text) {
    range.deleteContents();
    const tn = document.createTextNode(text);
    range.insertNode(tn);
    range.setStartAfter(tn);
    range.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // sync value
    this._value = this.$editor.innerHTML;
    this._emit();
  }

  _insertSoftBreak(range) {
    range.deleteContents();
    const br = document.createElement('br');
    range.insertNode(br);
    // Đặt caret sau <br>
    range.setStartAfter(br);
    range.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // sync
    this._value = this.$editor.innerHTML;
    this._emit();
  }

  _insertHardBreak(range) {
    // Thử dùng execCommand trước (nếu trình duyệt hỗ trợ)
    try {
      doCmd('insertParagraph');
      // sync
      this._value = this.$editor.innerHTML;
      this._emit();
      return;
    } catch {}

    // Fallback: chèn <br><br> để tạo khoảng dòng như 1 paragraph
    range.deleteContents();
    const br1 = document.createElement('br');
    const br2 = document.createElement('br');
    range.insertNode(br2);
    range.insertNode(br1);
    // caret sau br2
    range.setStartAfter(br2);
    range.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // sync
    this._value = this.$editor.innerHTML;
    this._emit();
  }

  _emit() {
    this.dispatchEvent(new Event('input'));
    this.dispatchEvent(new Event('change'));
  }

  // ---------- Public API ----------
  set value(html) {
    this._value = html ?? '';
    if (this.$editor) this.$editor.innerHTML = this._value;
  }
  get value() {
    return this.$editor ? this.$editor.innerHTML : (this._value ?? '');
  }
}

customElements.define('rte-editor', RteEditor);
export { RteEditor };
