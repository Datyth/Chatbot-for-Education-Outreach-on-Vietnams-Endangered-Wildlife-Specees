// Dedicated logic for the floating chat widget (bottom-right)
// This file scopes all DOM queries to the widget container so it works
// even if the page also contains an embedded chat section.

(function () {
  function boot() {
    const root = document.getElementById('chatWidget');
    if (!root) return;

    const winEl = root.querySelector('#chatWindow');
    const formEl = root.querySelector('#chatForm');
    const inputEl = root.querySelector('#chatInput');
    const sendBtnEl = root.querySelector('#sendBtn');
    const sourcesEl = root.querySelector('#chatSources');
    const toggleEl = document.getElementById('chatToggle');
    const closeEl = document.getElementById('chatClose');

    function setOpen(open) {
      const isOpen = !!open;
      try { root.setAttribute('aria-hidden', isOpen ? 'false' : 'true'); } catch {}
      try { toggleEl && toggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false'); } catch {}
      try { root.style.display = isOpen ? 'grid' : 'none'; } catch {}
      try { localStorage.setItem('chatOpen', isOpen ? '1' : '0'); } catch {}
    }

  function addMsg(text, role) {
    if (!winEl) return;
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = text;
    winEl.appendChild(el);
    try { winEl.scrollTop = winEl.scrollHeight; } catch {}
  }

  function renderSources(sources) {
    if (!sourcesEl) return;
    const arr = Array.isArray(sources) ? sources.slice(0, 5) : [];
    if (!arr.length) {
      sourcesEl.hidden = true;
      sourcesEl.innerHTML = '';
      return;
    }
    sourcesEl.innerHTML = arr.map((s) => {
      const page = s.page != null ? `p.${s.page}` : '';
      const doc = s.doc_id || '';
      const img = s.image_url ? `<img class=\"chat-source-thumb\" src=\"${s.image_url}\" alt=\"${doc}\" loading=\"lazy\" decoding=\"async\">` : '';
      const slug = (s.doc_id && typeof s.doc_id === 'string')
        ? s.doc_id
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
        : '';
      const href = slug ? `/animals/${slug}` : '';
      return `
        <div class=\"chat-source-item\">
          ${img}
          <div class=\"chat-source-meta\">
            <div><strong>${doc}</strong> ${page}</div>
            ${href ? `<div><a class="chat-source-link" href="${href}">Xem chi tiết</a></div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    sourcesEl.hidden = false;
  }

  async function sendMessage(message) {
    addMsg(message, 'user');
    if (sendBtnEl) sendBtnEl.disabled = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, filters: { country: 'VN' } })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const reply = data.answer || 'No response received.';
      addMsg(reply, 'bot');
      renderSources(data.sources || []);
    } catch (err) {
      console.error(err);
      addMsg('The assistant is unavailable. Please check the FastAPI service or proxy.', 'bot');
    } finally {
      if (sendBtnEl) sendBtnEl.disabled = false;
    }
  }

  if (formEl && inputEl) {
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const message = inputEl.value.trim();
      if (!message) return;
      inputEl.value = '';
      sendMessage(message);
    });
  }

  // Improve focus UX when opening via the floating button
  if (toggleEl) {
    toggleEl.addEventListener('click', (e) => {
      // Always open on widget button click and prevent other handlers
      // from toggling it closed again.
      try { e.preventDefault(); } catch {}
      try { e.stopPropagation(); } catch {}
      try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
      setOpen(true);
      setTimeout(() => { try { inputEl && inputEl.focus(); } catch {} }, 50);
      return false;
    }, { capture: true });
    // Restore previous state
    try { setOpen(localStorage.getItem('chatOpen') === '1'); } catch { setOpen(false); }
  }
  if (closeEl) {
    closeEl.addEventListener('click', (e) => {
      try { e.preventDefault(); } catch {}
      try { e.stopPropagation(); } catch {}
      try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch {}
      setOpen(false);
      return false;
    }, { capture: true });
  }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
