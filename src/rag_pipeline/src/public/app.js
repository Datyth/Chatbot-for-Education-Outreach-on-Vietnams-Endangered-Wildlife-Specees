const newsMock = [
  {
    title: "Generating latest conservation news...",
    label: "Run scripts/build_news_json.js to populate live data.",
    summary: "Once the script completes, this list will refresh automatically."
  }
];

const $id = (id) => document.getElementById(id);
const debounce = (fn, delay = 250) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

let grid;
let newsList;
let searchInput;
let pagination;
let modal;
let modalImgWrap;
let modalImg;
let modalTitle;
let modalMeta;
let modalBody;
let newsLoadPromise = null;\r\nlet chunkLoadPromise = null;\r\nlet chunkCache = null;\r\nlet paragraphLoadPromise = null;\r\nlet paragraphCache = null;

const pageSize = 10;
let filteredDocs = [];
let currentDocs = [];
let currentPage = 1;

function renderGridMessage(text, className = "grid-message") {
  if (!grid) return;
  const cssClass = className || "grid-message";
  const safeText = escapeHtml(String(text || ""));
  grid.innerHTML = `<div class="${cssClass}">${safeText}</div>`;
}

function renderGridLoading(text = "Loading species directory...") {
  renderGridMessage(text, "grid-loading");
}

function renderNews(items) {
  if (!newsList) return;
  newsList.innerHTML = items
    .map((item) => {
      const title = escapeHtml(item.title || "Untitled");
      const label = escapeHtml(item.label || item.time || "");
      const summary = escapeHtml(item.summary || "");
      const href = item.url ? escapeHtml(item.url) : "";

      const article = `
        <article class="newsItem">
          <div class="newsTitle">${title}</div>
          ${label ? `<div class="newsMeta">${label}</div>` : ""}
          ${summary ? `<p class="newsExcerpt">${summary}</p>` : ""}
        </article>`;

      return href
        ? `<a class="newsLink" href="${href}" target="_blank" rel="noopener">${article}</a>`
        : article;
    })
    .join("");
}

function renderChunkCards(list, emptyMessage) {
  if (!grid) return;

  const safeList = Array.isArray(list) ? list : [];
  currentDocs = [...safeList];

  if (!safeList.length) {
    renderGridMessage(emptyMessage || "No documents match your filters.");
    return;
  }

  grid.innerHTML = safeList
    .map((doc, idx) => {
      const titleRaw = doc.doc_id || "Unknown";
      const titleDisplay = escapeHtml(String(titleRaw).toUpperCase());
      const status = escapeHtml(String(doc.iucn_status || "unknown").toUpperCase());
      const imageUrl = doc.image_url ? escapeHtml(doc.image_url) : "";
      const imageBlock = imageUrl
        ? `<div class="doc-card-photo"><img src="${imageUrl}" alt="${escapeHtml(titleRaw)}"></div>`
        : '<div class="doc-card-photo doc-card-photo--empty"><span>No image</span></div>';

      return `
        <article class="doc-card" data-idx="${idx}">
          <div class="doc-card-frame">
            <header class="doc-card-header">${titleDisplay}</header>
            ${imageBlock}
            <footer class="doc-card-footer">
              <span class="doc-card-badge">IUCN: ${status}</span>
            </footer>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll(".doc-card").forEach((card) => {
    const idx = Number(card.dataset.idx);
    const doc = currentDocs[idx];
    if (!doc) return;
    card.addEventListener("click", () => openDocModal(doc));
  });
}

function clearPagination() {
  if (!pagination) return;
  pagination.innerHTML = "";
  pagination.hidden = true;
}

function renderPagination(totalItems) {
  if (!pagination) return;

  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) {
    clearPagination();
    return;
  }

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const buttons = [];
  buttons.push(
    `<button class="page-btn" data-page="prev"${currentPage === 1 ? " disabled" : ""}>&lt; Previous</button>`
  );

  const maxButtons = 5;
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + maxButtons - 1);
  if (end - start + 1 < maxButtons) {
    start = Math.max(1, end - maxButtons + 1);
  }

  for (let page = start; page <= end; page += 1) {
    const activeClass = page === currentPage ? " is-active" : "";
    buttons.push(`<button class="page-btn${activeClass}" data-page="${page}">${page}</button>`);
  }

  buttons.push(
    `<button class="page-btn" data-page="next"${currentPage === totalPages ? " disabled" : ""}>Next &gt;</button>`
  );
  buttons.push(`<span class="pagination-status">Page ${currentPage} of ${totalPages}</span>`);

  pagination.innerHTML = buttons.join("");
  pagination.hidden = false;
}

function renderPage() {
  if (!filteredDocs.length) {
    renderChunkCards([], "No documents match your filters.");
    clearPagination();
    return;
  }

  const totalItems = filteredDocs.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredDocs.slice(start, start + pageSize);

  renderChunkCards(pageItems);
  renderPagination(totalItems);
}

function handlePaginationClick(event) {
  const target = event.target.closest("[data-page]");
  if (!target || target.hasAttribute("disabled")) return;

  const action = target.dataset.page;
  const totalPages = Math.ceil(filteredDocs.length / pageSize) || 1;

  if (action === "prev") {
    if (currentPage > 1) {
      currentPage -= 1;
      renderPage();
    }
    return;
  }

  if (action === "next") {
    if (currentPage < totalPages) {
      currentPage += 1;
      renderPage();
    }
    return;
  }

  const pageNumber = Number(action);
  if (!Number.isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages && pageNumber !== currentPage) {
    currentPage = pageNumber;
    renderPage();
  }
}

async function loadChunks() {
  if (chunkCache) return chunkCache;
  if (!chunkLoadPromise) {
    chunkLoadPromise = fetch("/assets/data/chunks.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch((err) => {
        console.error("Failed to load chunks.json", err);
        return [];
      })
      .then((rows) => {
        chunkCache = rows;
        return chunkCache;
      });
  }
  return chunkLoadPromise;
}

async function loadParagraphs() {
  if (paragraphCache) return paragraphCache;
  if (!paragraphLoadPromise) {
    paragraphLoadPromise = fetch("/assets/data/paragraphs.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((rows) => {
        const map = new Map();
        if (Array.isArray(rows)) {
          rows.forEach((entry) => {
            if (!entry || !entry.doc_id) return;
            const normalizedParagraphs = Array.isArray(entry.paragraphs)
              ? entry.paragraphs
                  .map((para) => {
                    if (para && typeof para === "object") {
                      const textValue = typeof para.text === "string" ? para.text.trim() : String(para.text || "").trim();
                      if (!textValue) return null;
                      return {
                        text: textValue,
                        page: typeof para.page === "number" ? para.page : null,
                      };
                    }
                    const textValue = String(para || "").trim();
                    if (!textValue) return null;
                    return { text: textValue, page: null };
                  })
                  .filter(Boolean)
              : [];
            map.set(entry.doc_id, {
              doc_id: entry.doc_id,
              paragraphs: normalizedParagraphs,
              pages: Array.isArray(entry.pages) ? entry.pages : [],
              url: entry.url || null,
              image_url: entry.image_url || null,
              source: Array.isArray(entry.source) ? entry.source : [],
            });
          });
        }
        paragraphCache = map;
        return map;
      })
      .catch((err) => {
        console.error("Failed to load paragraphs.json", err);
        paragraphCache = new Map();
        return paragraphCache;
      });
  }
  return paragraphLoadPromise;\r\n}\r\n\r\nasync function showDefaultListing() {
  if (!Array.isArray(chunkCache) || !chunkCache.length) {
    renderGridLoading();
  }

  const rows = await loadChunks();
  if (!rows.length) {
    filteredDocs = [];
    currentPage = 1;
    renderChunkCards([], "No data available. Run scripts/build_chunks_json.js first.");
    clearPagination();
    return;
  }

  filteredDocs = [...rows];
  currentPage = 1;
  renderPage();
}

async function applySearch() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  if (query === "") {
    await showDefaultListing();
    return;
  }

  const rows = await loadChunks();
  if (!rows.length) {
    filteredDocs = [];
    currentPage = 1;
    renderChunkCards([], "No data available. Run scripts/build_chunks_json.js first.");
    clearPagination();
    return;
  }

  filteredDocs = rows.filter((item) => {
    const docId = String(item.doc_id || "").toLowerCase();
    const text = String(item.text || item.text_preview || "").toLowerCase();
    return docId.includes(query) || text.includes(query);
  });
  currentPage = 1;

  if (!filteredDocs.length) {
    renderChunkCards([], "No documents match that keyword.");
    clearPagination();
    return;
  }

  renderPage();
}

const applySearchDebounced = debounce(applySearch, 200);

async function loadNews() {
  if (newsLoadPromise) return newsLoadPromise;
  newsLoadPromise = fetch("/assets/data/news.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const list = Array.isArray(data) && data.length ? data : newsMock;
      renderNews(list);
      return list;
    })
    .catch((err) => {
      console.warn("Failed to load news.json", err);
      renderNews(newsMock);
      return newsMock;
    });
  return newsLoadPromise;
}

async function openDocModal(doc) {
  if (!modal || !modalTitle || !modalMeta || !modalBody) return;

  const title = doc.doc_id || "Unknown";
  modalTitle.textContent = title;
  modalMeta.innerHTML = "";
  modalBody.innerHTML = `<p>${escapeHtml("Loading content...")}</p>`;

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  const paragraphMap = await loadParagraphs();
  const paragraphEntry = paragraphMap.get(doc.doc_id);

  const pages = Array.isArray(paragraphEntry?.pages) && paragraphEntry.pages.length
    ? paragraphEntry.pages
    : Array.isArray(doc.pages) && doc.pages.length
      ? [...doc.pages].sort((a, b) => a - b)
      : [];

  const sources = Array.isArray(doc.source) && doc.source.length
    ? doc.source
    : Array.isArray(paragraphEntry?.source) && paragraphEntry.source.length
      ? paragraphEntry.source
      : [];

  const targetUrl = doc.url || paragraphEntry?.url || null;
  const imageUrl = doc.image_url || paragraphEntry?.image_url || null;

  const chips = [];
  const status = String(doc.iucn_status || "unknown").toUpperCase();
  chips.push(`<span class="doc-chip">IUCN: ${escapeHtml(status)}</span>`);

  if (pages.length) {
    const pageLabel =
      pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages[0]}-${pages[pages.length - 1]}`;
    chips.push(`<span class="doc-chip">${escapeHtml(pageLabel)}</span>`);
  }

  if (sources.length) {
    chips.push(`<span class="doc-chip">Source: ${escapeHtml(sources.join(", "))}</span>`);
  }

  if (targetUrl) {
    chips.push(
      `<a class="doc-chip doc-chip--link" href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener">View on Wiki</a>`
    );
  }

  modalMeta.innerHTML = chips.join("");

  if (modalImgWrap && modalImg) {
    if (imageUrl) {
      modalImg.src = imageUrl;
      modalImg.alt = title;
      modalImgWrap.hidden = false;
    } else {
      modalImg.src = "";
      modalImg.alt = "";
      modalImgWrap.hidden = true;
    }
  }

  const paragraphItems = paragraphEntry?.paragraphs || [];
  if (paragraphItems.length) {
    modalBody.innerHTML = paragraphItems
      .map((item) => `<p>${escapeHtml(item.text)}</p>`)
      .join("");
    return;
  }

  const fallbackText = (doc.text || doc.text_preview || "").trim();
  const fallbackParagraphs = fallbackText
    ? fallbackText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  modalBody.innerHTML = fallbackParagraphs.length
    ? fallbackParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
    : `<p>${escapeHtml(fallbackText || "No content available.")}</p>`;
}
function init() {
  grid = $id("grid");
  newsList = $id("newsList");
  searchInput = $id("searchInput");
  pagination = $id("pagination");
  modal = $id("docModal");
  modalImgWrap = $id("docModalImgWrap");
  modalImg = $id("docModalImg");
  modalTitle = $id("docModalTitle");
  modalMeta = $id("docModalMeta");
  modalBody = $id("docModalBody");
  const modalClose = $id("docModalClose");

  renderNews(newsMock);\r\n  showDefaultListing();\r\n  loadNews();\r\n  loadParagraphs();

  if (pagination) {
    pagination.addEventListener("click", handlePaginationClick);
  }
  const searchTrigger = document.querySelector(".search-icon");
  if (searchTrigger) {
    searchTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      applySearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", applySearchDebounced);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applySearch();
      }
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target?.dataset?.close === "true") {
        closeDocModal();
      }
    });
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeDocModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDocModal();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
