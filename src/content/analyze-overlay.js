// src/content/analyze-overlay.js
// Preload trên mọi trang (manifest.content_scripts).
// 1) Lưu lại selection range + rect tại thời điểm user mở context menu (contextmenu event)
// 2) Khi nhận message SHOW_TRANSLATOR_ANALYSIS, vẽ popup ở vị trí selection (hoặc fallback vị trí chuột)

(function () {
  if (window.__dvtoolAnalyzeOverlayReady) return;
  window.__dvtoolAnalyzeOverlayReady = true;

  let lastMouse = { x: 0, y: 0 };         // Dự phòng khi range mất
  let lastRect = null;                     // DOMRect của selection tại click chuột phải
  let lastRange = null;                    // Range thật (nếu trang không phá selection)
  const POPUP_ID = 'dvtool-translator-popup';

  document.addEventListener('mousemove', (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
  }, true);

  // Cực kỳ quan trọng: bắt sự kiện contextmenu để chụp rect của selection
  document.addEventListener('contextmenu', () => {
    const sel = safeSelection();
    if (sel && sel.rangeCount > 0) {
      lastRange = sel.getRangeAt(0).cloneRange();
      lastRect = lastRange.getBoundingClientRect();
    } else {
      lastRange = null;
      lastRect = null;
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'SHOW_TRANSLATOR_ANALYSIS') {
      showBubble(msg.text || '(empty)');
    }
  });

  function safeSelection() {
    try { return window.getSelection(); } catch { return null; }
  }

  function removeExisting() {
    const old = document.getElementById(POPUP_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function toHTML(text) {
    if (!text) return '';
    // Sanitize tối thiểu: escape <, &, chuyển ** ** -> <strong>, newline -> <br>
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function showBubble(resultText) {
    removeExisting();

    const bubble = document.createElement('div');
    bubble.id = POPUP_ID;
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-live', 'polite');

    // Style
    Object.assign(bubble.style, {
      position: 'absolute',
      background: '#0b1220',
      color: '#e5e7eb',
      padding: '10px 12px',
      border: '1px solid #334155',
      borderRadius: '10px',
      fontSize: '14px',
      lineHeight: '1.45',
      maxWidth: '420px',
      maxHeight: '240px',
      overflowY: 'auto',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      zIndex: 2147483647
    });

    const content = document.createElement('div');
    content.innerHTML = toHTML(resultText);
    bubble.appendChild(content);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '4px',
      right: '8px',
      border: 'none',
      background: 'transparent',
      color: '#94a3b8',
      fontSize: '18px',
      cursor: 'pointer'
    });
    closeBtn.addEventListener('click', removeExisting);
    bubble.appendChild(closeBtn);

    document.documentElement.appendChild(bubble);

    // Tính vị trí: ưu tiên rect của selection tại thời điểm contextmenu.
    let rect = lastRect;
    // Nếu vì trang can thiệp (VD: app SPA), selection có thể mất — fallback: dùng vị trí chuột
    let left, top;
    const vpLeft = window.pageXOffset;
    const vpTop  = window.pageYOffset;
    const vpRight = vpLeft + window.innerWidth;
    const vpBottom = vpTop + window.innerHeight;

    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;

    if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
      left = rect.left + window.pageXOffset;
      top  = rect.top + window.pageYOffset - bh - 8; // đặt trên
      if (top < vpTop + 8) top = (rect.bottom + window.pageYOffset) + 8; // nếu tràn trên -> đặt dưới
    } else {
      // Fallback: đặt quanh chuột
      left = lastMouse.x + window.pageXOffset - Math.min(240, bw / 2);
      top  = lastMouse.y + window.pageYOffset - bh - 12;
      if (top < vpTop + 8) top = lastMouse.y + window.pageYOffset + 12;
    }

    // Căn trong viewport
    if (left + bw > vpRight - 8) left = vpRight - bw - 8;
    if (left < vpLeft + 8)       left = vpLeft + 8;
    if (top + bh > vpBottom - 8) top  = vpBottom - bh - 8;

    bubble.style.left = `${left}px`;
    bubble.style.top  = `${top}px`;

    function onDocDown(e) {
      if (!bubble.contains(e.target)) {
        removeExisting();
        document.removeEventListener('mousedown', onDocDown, true);
      }
    }
    document.addEventListener('mousedown', onDocDown, true);
  }
})();
