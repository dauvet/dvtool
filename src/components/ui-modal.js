
export class UIModal extends HTMLElement{
  connectedCallback(){
    if (this._inited) return;
    this._inited = true;
    this.innerHTML = `<div class="modal-backdrop">
      <div class="modal">
        <div class="content"></div>
        <div class="flex gap-2 mt-3 justify-end">
          <button class="btn secondary" id="cancel">Cancel</button>
          <button class="btn" id="ok">Confirm</button>
        </div>
      </div>
    </div>`;
    this.querySelector('#cancel').addEventListener('click', ()=> this._resolve && this._resolve(false));
    this.querySelector('#ok').addEventListener('click', ()=> this._resolve && this._resolve(true));
    this.addEventListener('click', (e)=>{
      if (e.target && e.target.classList.contains('modal-backdrop')) {
        this._resolve && this._resolve(false);
      }
    });
    this._escHandler = (e)=> { if (e.key === 'Escape') this._resolve && this._resolve(false); };
    document.addEventListener('keydown', this._escHandler);
  }
  ask(html){
    document.body.appendChild(this);
    queueMicrotask(()=>{
      const content = this.querySelector('.content');
      if (content) content.innerHTML = html;
    });
    return new Promise(res => {
      this._resolve = (v) => {
        res(v);
        this.remove();
        document.removeEventListener('keydown', this._escHandler);
      };
    });
  }
}
customElements.define('ui-modal', UIModal);
export async function confirm(html){
  const modal = document.createElement('ui-modal');
  return await modal.ask(html);
}
