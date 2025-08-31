// src/components/md-viewer.js
// Shadow DOM viewer cho HTML/Markdown đã render.
// Bọc chặt CSS để KHÔNG tràn ngang, kể cả chuỗi/URL cực dài, <pre>/<code>/table>…

class MdViewer extends HTMLElement {
  constructor() {
    super();
    this._inited = false;
    this._root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this._inited) return;
    this._inited = true;

    const initialHTML = this.innerHTML; // lấy nội dung ban đầu từ light DOM
    this.innerHTML = '';                // dọn sạch light DOM để tránh render đôi

    const style = document.createElement('style');
    style.textContent = `
      :host{ display:block; max-width:100%; }
      .wrap{
        max-width:100%;
        overflow-x:hidden;              /* chặn scroll ngang */
      }
      /* WRAP TRIỆT ĐỂ ở mọi nơi */
      .wrap, .wrap *{
        box-sizing:border-box;
        min-width:0;
      }
      .content{
        white-space:normal;
        word-break:break-word;
        overflow-wrap:anywhere;
        max-width:100%;
      }

      /* Media co theo khung */
      .content img, .content video, .content canvas, .content iframe{
        max-width:100%; height:auto; display:block;
      }

      /* Code/Pre vẫn wrap */
      .content pre, .content code, .content kbd, .content samp{
        white-space:pre-wrap;
        word-break:break-word;
        overflow-wrap:anywhere;
        max-width:100%;
      }

      /* Bảng không “nở” */
      .content table{
        width:100%;
        max-width:100%;
        table-layout:fixed;
        border-collapse:collapse;
      }
      .content th, .content td{
        word-break:break-word;
        overflow-wrap:anywhere;
      }

      .content a{ word-break:break-word; overflow-wrap:anywhere; }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    this._contentEl = document.createElement('div');
    this._contentEl.className = 'content';
    this._contentEl.innerHTML = initialHTML || '';

    wrap.appendChild(this._contentEl);
    this._root.append(style, wrap);
  }

  // API thuận tiện: mdViewer.content = '<p>...</p>'
  set content(html){
    if (!this._contentEl) this.connectedCallback();
    this._contentEl.innerHTML = html ?? '';
  }
  get content(){
    return this._contentEl ? this._contentEl.innerHTML : '';
  }
}

customElements.define('md-viewer', MdViewer);
export { MdViewer };
