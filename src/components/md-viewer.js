// src/components/md-viewer.js
// Markdown viewer (no deps) + backward-compat:
// - Supports .content property (preferred)
// - Also reads from light DOM (innerHTML/textContent) and 'content' attribute
// - Watches light DOM changes to keep in sync (for code using innerHTML later)

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function safeUrl(u = '') {
  try {
    const url = String(u).trim();
    if (!url) return '#';
    if (/^(https?:|mailto:)/i.test(url)) return esc(url);
    return '#';
  } catch { return '#'; }
}

function mdToHtml(md = '') {
  let src = md.replace(/\r\n?/g, '\n');

  const fenceTokens = [];
  src = src.replace(/```([a-z0-9\-\_\+\.]*)\n([\s\S]*?)```/gi, (_, lang, code) => {
    const idx = fenceTokens.push({ lang: (lang || '').trim().toLowerCase(), code }) - 1;
    return `\u0000FENCE${idx}\u0000`;
  });

  const blocks = src.split(/\n{2,}/);
  const outBlocks = blocks.map(block => {
    if (/\|/.test(block) && /\n\|?[\s:-]+\|/.test(block)) return renderTableBlock(block);
    const h = block.match(/^(#{1,6})\s+(.+)$/m);
    if (h && block.trim().startsWith(h[0])) {
      return block
        .split('\n')
        .map(line => {
          const m = line.match(/^(#{1,6})\s+(.+)$/);
          if (m) {
            const level = m[1].length;
            return `<h${level}>${renderInline(m[2])}</h${level}>`;
          }
          return `<p>${renderInline(line)}</p>`;
        })
        .join('\n');
    }
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(block.trim())) return `<hr>`;
    if (/^\s*>\s?/.test(block)) {
      const cleaned = block.split('\n').map(l => l.replace(/^\s*>\s?/, '')).join('\n');
      return `<blockquote>${renderParagraphs(cleaned)}</blockquote>`;
    }
    if (/^\s*([*\-+]\s+|\d+\.\s+)/.test(block)) return renderListBlock(block);
    return renderParagraphs(block);
  });

  let html = outBlocks.join('\n');
  html = html.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => {
    const { lang, code } = fenceTokens[Number(i)] || { lang: '', code: '' };
    return `<pre class="code"><code data-lang="${esc(lang)}">${esc(code)}</code></pre>`;
  });
  return html;
}

function renderParagraphs(text) {
  const lines = text.split('\n');
  const html = lines.map(l => renderInline(l)).join('<br>');
  return `<p>${html}</p>`;
}
function renderInline(s) {
  if (!s) return '';
  let x = esc(s);
  x = x.replace(/!\[([^\]]*?)\]\((.*?)\)/g, (_, alt, url) =>
    `<img alt="${esc(alt)}" src="${safeUrl(url)}">`
  );
  x = x.replace(/\[([^\]]*?)\]\((.*?)\)/g, (_, text, url) =>
    `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`
  );
  x = x.replace(/`([^`]+?)`/g, (_, code) => `<code class="inline">${esc(code)}</code>`);
  x = x.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  x = x.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).]|$)/g, '$1<em>$2</em>');
  x = x.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  return x;
}
function renderListBlock(block) {
  const lines = block.split('\n');
  const isOrdered = /^\s*\d+\.\s+/.test(lines[0]);
  const tag = isOrdered ? 'ol' : 'ul';
  const items = [];
  let buf = [];
  function pushItem() {
    if (!buf.length) return;
    items.push(`<li>${renderParagraphs(buf.join('\n'))}</li>`);
    buf = [];
  }
  for (const raw of lines) {
    const m = raw.match(/^\s*(\d+\.\s+|[*\-+]\s+)(.*)$/);
    if (m) { pushItem(); buf.push(m[2] || ''); } else { buf.push(raw); }
  }
  pushItem();
  return `<${tag}>${items.join('')}</${tag}>`;
}
function renderTableBlock(block) {
  const lines = block.split('\n').filter(Boolean);
  if (lines.length < 2) return renderParagraphs(block);
  const header = lines[0].split('|').map(s => s.trim());
  const sep = lines[1];
  if (!/\|?[\s:-]+\|/.test(sep)) return renderParagraphs(block);
  const rows = lines.slice(2).map(line => line.split('|').map(s => s.trim()));
  const th = header.map(h => `<th>${renderInline(h)}</th>`).join('');
  const trs = rows.map(cols => `<tr>${cols.map(c => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

export class MdViewer extends HTMLElement {
  static get observedAttributes() { return ['content']; }

  constructor() {
    super();
    this._md = '';
    this._obs = null;

    this.attachShadow({ mode: 'open' });
    this._root = document.createElement('div');
    this._root.className = 'md-root';

    const style = document.createElement('style');
    style.textContent = `
      .md-root { color: inherit; font: inherit; }
      .md-root h1,.md-root h2,.md-root h3,.md-root h4,.md-root h5,.md-root h6{ margin:.6em 0 .3em; line-height:1.25;}
      .md-root p{ margin:.4em 0; }
      .md-root a{ color:#7dd3fc; text-decoration: underline; word-break: break-word; }
      .md-root code.inline{ padding:0 4px; border-radius:4px; background:#0d2230; border:1px solid #1f3647; }
      .md-root pre.code{ background:#0b1b23; border:1px solid #1f3647; padding:10px; border-radius:10px; overflow:auto; }
      .md-root pre.code code{ white-space:pre; display:block; }
      .md-root ul,.md-root ol{ padding-left:1.25em; margin:.4em 0; }
      .md-root blockquote{ margin:.6em 0; padding:.4em .8em; border-left:3px solid #335; background:#0b1220; border-radius:6px; }
      .md-root hr{ border:0; border-top:1px solid #223046; margin:.8em 0; }
      .md-root table{ border-collapse: collapse; margin:.5em 0; overflow:auto; display:block; }
      .md-root table th,.md-root table td{ border:1px solid #233549; padding:6px 8px; vertical-align:top; }
      .md-root img{ max-width:100%; height:auto; border-radius:6px; }

      /* Scrollbar nice inside shadow */
      .md-root{
        scrollbar-width: thin;
        scrollbar-color: var(--sb-thumb, #263348) transparent;
      }
      .md-root::-webkit-scrollbar{
        width: var(--sb-size, 8px);
        height: var(--sb-size, 8px);
      }
      .md-root::-webkit-scrollbar-thumb{
        background: var(--sb-thumb, #263348);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: content-box;
      }
      .md-root::-webkit-scrollbar-thumb:hover{
        background: var(--sb-thumb-hover, #2f415a);
        border: 2px solid transparent;
        background-clip: content-box;
      }
      .md-root pre.code::-webkit-scrollbar{ width: var(--sb-size, 8px); height: var(--sb-size, 8px); }
      .md-root pre.code::-webkit-scrollbar-thumb{
        background: var(--sb-thumb, #263348);
        border-radius:999px; border:2px solid transparent; background-clip:content-box;
      }
      .md-root pre.code::-webkit-scrollbar-thumb:hover{
        background: var(--sb-thumb-hover, #2f415a);
        border:2px solid transparent; background-clip:content-box;
      }
    `;
    this.shadowRoot.append(style, this._root);
  }

  set content(v) {
    this._md = (v == null ? '' : String(v));
    this.render();
  }
  get content() { return this._md; }

  attributeChangedCallback(name, _old, val) {
    if (name === 'content') {
      this.content = val || '';
    }
  }

  connectedCallback() {
    // Backward-compat init:
    // Priority: attribute 'content' > .content (if already set) > light DOM (innerHTML/textContent)
    const attr = this.getAttribute('content');
    if (attr != null && attr !== '') {
      this.content = String(attr);
    } else if (!this._md && (this.innerHTML || '').trim()) {
      // Use light DOM as initial markdown (don't clear light DOM to avoid fighting other code)
      this.content = this.innerHTML;
    }
    this.render();

    // Observe light DOM changes — if external code sets innerHTML later, sync to .content
    if (!this._obs) {
      this._obs = new MutationObserver(() => {
        // Only react if caller is using light DOM (not our own shadow)
        const md = (this.innerHTML || '').trim();
        if (md && md !== this._md) {
          this._md = md; // avoid double render() loops
          this.render();
        }
      });
      this._obs.observe(this, { childList: true, characterData: true, subtree: true });
    }
  }

  disconnectedCallback() {
    if (this._obs) { this._obs.disconnect(); this._obs = null; }
  }

  render() {
    try {
      this._root.innerHTML = mdToHtml(this._md || '');
    } catch (e) {
      this._root.innerHTML = `<pre class="code"><code>${esc(this._md || '')}</code></pre>`;
    }
  }
}

// Define safely (avoid double-define in HMR environments)
if (!customElements.get('md-viewer')) {
  customElements.define('md-viewer', MdViewer);
}
