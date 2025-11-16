const $id = (id) => document.getElementById(id);
const debounce = (fn, delay = 250) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

let grid;
let pagination;
let searchInput;

let modal;
let modalTitle;
let modalBadges;
let modalSummary;
let modalBody;
let modalImageWrap;
let modalImage;
let modalSourcesSection;
let modalSources;
let modalLink;

const detailCache = new Map();

let currentQuery = "";
let currentPage = 1;
let pageSize = 12;
let totalItems = 0;

// Facets & sort state (driven via query string for now)
let currentStatus = []; // ["CR","EN",...]
let currentHasImage = null; // true | false | null
let currentSource = ""; // string or csv
let currentSort = ""; // "name" | "newest" | "desc_len"

// Filter controls (wired in init)
let filterToggle;
let filtersPanel;
let statusCheckboxes;
let hasImageAny;
let hasImageYes;
let hasImageNo;
let filterSource;
let filterSort;
let filterApplyBtn;
let filterClearBtn;
let filterCloseBtn;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(text, max = 140) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}...`;
}

function renderGridMessage(text, className = "grid-message") {
  if (!grid) return;
  grid.innerHTML = `<div class="${className}">${escapeHtml(text || "")}</div>`;
}

function renderItems(items) {
  if (!grid) return;
  if (!Array.isArray(items) || !items.length) {
    renderGridMessage("No species match the current filters.");
    return;
  }

  grid.innerHTML = items
    .map((doc) => {
      const slug = escapeHtml(doc.slug || "");
      const title = escapeHtml(doc.doc_id || "Unknown species");
      const status = escapeHtml(String(doc.iucn_status || "UNKNOWN").toUpperCase());
      const preview = truncateText(doc.text_preview || "", 140);
      const previewBlock = preview
        ? `<p class="species-card__excerpt">${escapeHtml(preview)}</p>`
        : "";
      const media = doc.image_url
        ? `<img src="${escapeHtml(doc.image_url)}" alt="${title}" loading="lazy" />`
        : `<div class="species-card__placeholder" aria-hidden="true">No image</div>`;

      return `
        <article class="species-card" data-slug="${slug}">
          <div class="species-card__media">
            ${media}
          </div>
          <div class="species-card__content">
            <h2 class="species-card__title">${title}</h2>
            <span class="species-card__badge">IUCN: ${status}</span>
            ${previewBlock}
            <button class="species-card__action" type="button">View full profile</button>
          </div>
        </article>
      `;
    })
    .join("");

  grid.querySelectorAll(".species-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      const slug = card.dataset.slug;
      if (!slug) return;
      openSpeciesModal(slug);
    });
  });
}

function clearPagination() {
  if (!pagination) return;
  pagination.innerHTML = "";
  pagination.hidden = true;
}

function renderPagination(total) {
  if (!pagination) return;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
    const active = page === currentPage ? " is-active" : "";
    buttons.push(`<button class="page-btn${active}" data-page="${page}">${page}</button>`);
  }

  buttons.push(
    `<button class="page-btn" data-page="next"${currentPage === totalPages ? " disabled" : ""}>Next &gt;</button>`
  );
  buttons.push(`<span class="pagination-status">Page ${currentPage} of ${totalPages}</span>`);

  pagination.innerHTML = buttons.join("");
  pagination.hidden = false;
}

async function fetchPage(query, page, size) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page || 1));
  params.set("pageSize", String(size || pageSize));
  if (Array.isArray(currentStatus) && currentStatus.length) {
    params.set("status", currentStatus.join(","));
  }
  if (currentHasImage !== null) {
    params.set("hasImage", currentHasImage ? "true" : "false");
  }
  if (currentSource && String(currentSource).trim()) {
    params.set("source", String(currentSource).trim());
  }
  if (currentSort && String(currentSort).trim()) {
    params.set("sort", String(currentSort).trim());
  }
  const res = await fetch(`/api/docs?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSpeciesDetail(slug) {
  const key = String(slug || "");
  if (!key) throw new Error("Missing species slug");
  if (detailCache.has(key)) {
    return detailCache.get(key);
  }
  const res = await fetch(`/api/docs/${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  detailCache.set(key, data);
  return data;
}

function resetModalContent() {
  if (!modal) return;
  if (modalTitle) modalTitle.textContent = "Loading species...";
  if (modalBadges) modalBadges.innerHTML = "";
  if (modalSummary) {
    modalSummary.textContent = "";
    modalSummary.hidden = true;
  }
  if (modalBody) {
    modalBody.innerHTML = `<p class="species-modal__loading">Loading description...</p>`;
  }
  if (modalImageWrap) {
    modalImageWrap.hidden = true;
  }
  if (modalImage) {
    modalImage.src = "";
    modalImage.alt = "";
  }
  if (modalSources) {
    modalSources.innerHTML = "";
  }
  if (modalSourcesSection) {
    modalSourcesSection.hidden = true;
  }
  if (modalLink) {
    modalLink.href = "#";
    modalLink.hidden = true;
  }
}

async function openSpeciesModal(slug) {
  if (!modal) return;
  resetModalContent();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  try {
    const detail = await fetchSpeciesDetail(slug);
    const title = detail.doc_id || "Unknown species";
    if (modalTitle) modalTitle.textContent = title;

    if (modalBadges) {
      const badges = [];
      const status = String(detail.iucn_status || "UNKNOWN").toUpperCase();
      badges.push(`<span class="species-modal__badge">IUCN: ${escapeHtml(status)}</span>`);
      const pages = Array.isArray(detail.pages)
        ? detail.pages.filter((p) => Number.isFinite(p))
        : [];
      if (pages.length) {
        const first = pages[0];
        const last = pages[pages.length - 1];
        const label = pages.length === 1 ? `Page ${first}` : `Pages ${first}-${last}`;
        badges.push(
          `<span class="species-modal__badge species-modal__badge--subtle">${escapeHtml(label)}</span>`
        );
      }
      modalBadges.innerHTML = badges.join("");
    }

    if (modalSummary) {
      const summary = (detail.text_preview || "").trim();
      if (summary) {
        modalSummary.textContent = summary;
        modalSummary.hidden = false;
      } else {
        modalSummary.textContent = "";
        modalSummary.hidden = true;
      }
    }

    if (modalImageWrap && modalImage) {
      if (detail.image_url) {
        modalImage.src = detail.image_url;
        modalImage.alt = title;
        modalImageWrap.hidden = false;
      } else {
        modalImage.src = "";
        modalImage.alt = "";
        modalImageWrap.hidden = true;
      }
    }

    if (modalBody) {
      const text = (detail.text || "").trim();
      const paragraphs = text
        ? text
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      if (paragraphs.length) {
        modalBody.innerHTML = paragraphs
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join("");
      } else {
        modalBody.innerHTML = `<p class="species-modal__empty">No description available.</p>`;
      }
    }

    if (modalSources && modalSourcesSection) {
      const sources = Array.isArray(detail.source) ? detail.source.filter((src) => src) : [];
      if (sources.length) {
        modalSources.innerHTML = sources.map((src) => `<li>${escapeHtml(src)}</li>`).join("");
        modalSourcesSection.hidden = false;
      } else {
        modalSources.innerHTML = "";
        modalSourcesSection.hidden = true;
      }
    }

    if (modalLink) {
      if (detail.url) {
        modalLink.href = detail.url;
        modalLink.hidden = false;
      } else {
        modalLink.href = "#";
        modalLink.hidden = true;
      }
    }
  } catch (error) {
    console.error(error);
    if (modalBody) {
      modalBody.innerHTML = `<p class="species-modal__error">Failed to load species details. Please try again.</p>`;
    }
    if (modalTitle) modalTitle.textContent = "Unable to load species";
  }
}

function closeSpeciesModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function loadAndRender() {
  try {
    renderGridMessage("Loading species directory...", "grid-loading");
    const data = await fetchPage(currentQuery, currentPage, pageSize);
    totalItems = Number(data.total || 0);
    renderItems(data.items || []);
    renderPagination(totalItems);
    // Reflect state to URL for shareability
    updateUrl();
  } catch (error) {
    console.error(error);
    renderGridMessage("Failed to load species data. Please try again.");
    clearPagination();
  }
}

function handlePaginationClick(event) {
  const target = event.target.closest("[data-page]");
  if (!target || target.hasAttribute("disabled")) return;
  const action = target.dataset.page;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (action === "prev" && currentPage > 1) {
    currentPage -= 1;
    loadAndRender();
    return;
  }

  if (action === "next" && currentPage < totalPages) {
    currentPage += 1;
    loadAndRender();
    return;
  }

  const pageNumber = Number(action);
  if (!Number.isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages && pageNumber !== currentPage) {
    currentPage = pageNumber;
    loadAndRender();
  }
}

const runSearch = () => {
  currentQuery = (searchInput?.value || "").trim();
  currentPage = 1;
  loadAndRender();
};

const applySearchDebounced = debounce(runSearch, 200);

function init() {
  grid = $id("grid");
  pagination = $id("pagination");
  searchInput = $id("searchInput");

  modal = $id("speciesModal");
  modalTitle = $id("speciesModalTitle");
  modalBadges = $id("speciesModalBadges");
  modalSummary = $id("speciesModalSummary");
  modalBody = $id("speciesModalBody");
  modalImageWrap = $id("speciesModalImageWrap");
  modalImage = $id("speciesModalImage");
  modalSourcesSection = $id("speciesModalSourcesSection");
  modalSources = $id("speciesModalSources");
  modalLink = $id("speciesModalLink");

  const closeBtn = $id("speciesModalClose");

  if (pagination) {
    pagination.addEventListener("click", handlePaginationClick);
  }

  const searchTrigger = document.querySelector(".search-icon");
  if (searchTrigger) {
    searchTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      runSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", applySearchDebounced);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target?.dataset?.close === "true") {
        closeSpeciesModal();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeSpeciesModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSpeciesModal();
    }
  });
  // Initialize state from URL
  readStateFromUrl();
  // Wire up filter UI controls
  filterToggle = $id("filterToggle");
  filtersPanel = $id("filtersPanel");
  statusCheckboxes = Array.from(document.querySelectorAll(".filter-status"));
  hasImageAny = $id("imgAny");
  hasImageYes = $id("imgYes");
  hasImageNo = $id("imgNo");
  filterSource = $id("filterSource");
  filterSort = $id("filterSort");
  filterApplyBtn = $id("filterApply");
  filterClearBtn = $id("filterClear");
  filterCloseBtn = $id("filterClose");

  if (filterToggle && filtersPanel) {
    filterToggle.addEventListener("click", () => {
      const hidden = filtersPanel.hasAttribute("hidden");
      if (hidden) {
        syncControlsFromState();
        filtersPanel.removeAttribute("hidden");
      } else {
        filtersPanel.setAttribute("hidden", "true");
      }
    });
  }
  if (filterCloseBtn && filtersPanel) {
    filterCloseBtn.addEventListener("click", () => {
      filtersPanel.setAttribute("hidden", "true");
    });
  }
  if (filterApplyBtn) {
    filterApplyBtn.addEventListener("click", () => {
      readStateFromControls();
      currentPage = 1;
      if (filtersPanel) filtersPanel.setAttribute("hidden", "true");
      loadAndRender();
    });
  }
  if (filterClearBtn) {
    filterClearBtn.addEventListener("click", () => {
      currentStatus = [];
      currentHasImage = null;
      currentSource = "";
      currentSort = "";
      syncControlsFromState();
      currentPage = 1;
      loadAndRender();
    });
  }
  loadAndRender();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function readStateFromUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const q = params.get("q");
  const page = parseInt(params.get("page") || "1", 10);
  const pz = parseInt(params.get("pageSize") || String(pageSize), 10);
  const status = params.get("status");
  const hasImage = params.get("hasImage");
  const source = params.get("source");
  const sort = params.get("sort");

  currentQuery = (q || "").trim();
  if (searchInput) searchInput.value = currentQuery;
  currentPage = Number.isFinite(page) && page > 0 ? page : 1;
  pageSize = Number.isFinite(pz) && pz > 0 ? pz : 12;

  currentStatus = (status || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (hasImage === null || hasImage === undefined || hasImage === "") {
    currentHasImage = null;
  } else {
    const v = String(hasImage).toLowerCase();
    currentHasImage = ["1", "true", "yes", "y"].includes(v)
      ? true
      : ["0", "false", "no", "n"].includes(v)
      ? false
      : null;
  }
  currentSource = (source || "").trim();
  currentSort = (sort || "").trim();
}

function updateUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.set("page", String(currentPage));
  params.set("pageSize", String(pageSize));
  if (currentQuery) params.set("q", currentQuery); else params.delete("q");
  if (Array.isArray(currentStatus) && currentStatus.length) {
    params.set("status", currentStatus.join(","));
  } else params.delete("status");
  if (currentHasImage !== null) {
    params.set("hasImage", currentHasImage ? "true" : "false");
  } else params.delete("hasImage");
  if (currentSource && String(currentSource).trim()) {
    params.set("source", String(currentSource).trim());
  } else params.delete("source");
  if (currentSort && String(currentSort).trim()) {
    params.set("sort", String(currentSort).trim());
  } else params.delete("sort");
  const newUrl = `${url.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}



function syncControlsFromState() {
  if (Array.isArray(statusCheckboxes)) {
    for (const cb of statusCheckboxes) {
      cb.checked = currentStatus.includes(String(cb.value || '').toUpperCase());
    }
  }
  if (hasImageAny && hasImageYes && hasImageNo) {
    if (currentHasImage === true) {
      hasImageYes.checked = true;
    } else if (currentHasImage === false) {
      hasImageNo.checked = true;
    } else {
      hasImageAny.checked = true;
    }
  }
  if (filterSource) filterSource.value = currentSource || '';
  if (filterSort) filterSort.value = currentSort || '';
}

function readStateFromControls() {
  if (Array.isArray(statusCheckboxes)) {
    currentStatus = statusCheckboxes
      .filter((cb) => cb.checked)
      .map((cb) => String(cb.value || '').toUpperCase());
  }
  if (hasImageAny && hasImageYes && hasImageNo) {
    currentHasImage = hasImageYes.checked ? true : hasImageNo.checked ? false : null;
  }
  currentSource = (filterSource?.value || '').trim();
  currentSort = (filterSort?.value || '').trim();
}
