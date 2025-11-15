const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const chatWidget = document.getElementById("chatWidget");
const chatToggle = document.getElementById("chatToggle");
const chatClose = document.getElementById("chatClose");
const chatSources = document.getElementById("chatSources");

function addMsg(text, role) {
  if (!chatWindow) return;
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setChatOpen(open) {
  if (!chatWidget || !chatToggle) return;
  const isOpen = Boolean(open);
  chatWidget.setAttribute("aria-hidden", isOpen ? "false" : "true");
  chatToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  // Fallback to inline display in case CSS attribute selector isn't applied yet
  try { chatWidget.style.display = isOpen ? "grid" : "none"; } catch {}
  try { localStorage.setItem("chatOpen", isOpen ? "1" : "0"); } catch {}
}

function toggleChat() {
  if (!chatWidget) return;
  const nowHidden = chatWidget.getAttribute("aria-hidden") !== "false";
  setChatOpen(nowHidden);
  if (nowHidden && chatInput) {
    setTimeout(() => chatInput.focus(), 0);
  }
}

function renderSources(sources) {
  if (!chatSources) return;
  const arr = Array.isArray(sources) ? sources.slice(0, 5) : [];
  if (!arr.length) {
    chatSources.hidden = true;
    chatSources.innerHTML = "";
    return;
  }
  chatSources.innerHTML = arr.map((s) => {
    const page = s.page != null ? `p.${s.page}` : "";
    const doc = s.doc_id || "";
    const img = s.image_url ? `<img class=\"chat-source-thumb\" src=\"${s.image_url}\" alt=\"${doc}\" loading=\"lazy\" decoding=\"async\">` : "";
    const slug = (s.doc_id && typeof s.doc_id === "string")
      ? s.doc_id
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      : "";
    const href = slug ? `/animals/${slug}` : "";
    return `
      <div class=\"chat-source-item\">
        ${img}
        <div class=\"chat-source-meta\">
          <div><strong>${doc}</strong> ${page}</div>
          ${href ? `<div><a class="chat-source-link" href="${href}">Xem chi tiết</a></div>` : ""}
        </div>
      </div>
    `;
  }).join("");
  chatSources.hidden = false;
}

async function sendMessage(message) {
  addMsg(message, "user");
  if (sendBtn) {
    sendBtn.disabled = true;
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        filters: { country: "VN" }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const reply = data.answer || "No response received.";
    addMsg(reply, "bot");
    if (data.sources) {
      renderSources(data.sources);
    } else {
      renderSources([]);
    }
  } catch (error) {
    addMsg("The assistant is unavailable. Please check the FastAPI service or proxy.", "bot");
    console.error(error);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }
}

if (chatForm && chatInput) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.value = "";
    sendMessage(message);
  });
}

// init widget
if (chatToggle) {
  chatToggle.addEventListener("click", toggleChat);
  try { setChatOpen(localStorage.getItem("chatOpen") === "1"); } catch { setChatOpen(false); }
}
if (chatClose) {
  chatClose.addEventListener("click", () => setChatOpen(false));
}


// Ensure widget binds after markup loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    const t = document.getElementById('chatToggle');
    const w = document.getElementById('chatWidget');
    const c = document.getElementById('chatClose');
    if (t) {
      t.addEventListener('click', toggleChat);
      try { setChatOpen(localStorage.getItem('chatOpen') === '1'); } catch { setChatOpen(false); }
    }
    if (c) {
      c.addEventListener('click', () => setChatOpen(false));
    }
    // ESC closes when open
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && w && w.getAttribute('aria-hidden') === 'false') {
        setChatOpen(false);
      }
    });
  });
} else {
  const t = document.getElementById('chatToggle');
  const w = document.getElementById('chatWidget');
  const c = document.getElementById('chatClose');
  if (t) {
    t.addEventListener('click', toggleChat);
    try { setChatOpen(localStorage.getItem('chatOpen') === '1'); } catch { setChatOpen(false); }
  }
  if (c) {
    c.addEventListener('click', () => setChatOpen(false));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && w && w.getAttribute('aria-hidden') === 'false') {
      setChatOpen(false);
    }
  });
}
