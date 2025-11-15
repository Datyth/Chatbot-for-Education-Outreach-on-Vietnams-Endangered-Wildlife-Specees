import { Router } from "express";
import {
  getHomeViewModel,
  getAboutViewModel,
  getContactViewModel,
} from "../models/home.model.js";
import {
  getAnimalListViewModel,
  getAnimalDetailViewModel,
} from "../models/animal.model.js";
import { loadDocs, getDocBySlug } from "../utils/preprocessed.js";

const router = Router();

router.get("/", (req, res) => {
  res.render("home", getHomeViewModel());
});

router.get("/animals", (req, res) => {
  res.render("byAnimal", getAnimalListViewModel());
});

router.get("/animals/:slug", (req, res, next) => {
  const viewModel = getAnimalDetailViewModel(req.params.slug);

  if (!viewModel) {
    return next();
  }

  res.render("details", viewModel);
});

router.get("/about", (req, res) => {
  res.render("about", getAboutViewModel());
});

router.get("/contact", (req, res) => {
  res.render("contact", getContactViewModel());
});

// API: paginated + searchable docs from preprocessed JSONL
router.get("/api/docs", (req, res) => {
  const q = (req.query.q || "").toString();
  const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
  const sizeRaw = parseInt(req.query.pageSize || "12", 10) || 12;
  const pageSize = Math.min(Math.max(sizeRaw, 1), 50); // clamp 1..50

  // Facet params
  const statusParam = (req.query.status || "").toString(); // e.g. "CR,EN"
  const hasImageParam = (req.query.hasImage || "").toString(); // "true"|"false"|"1"|"0"
  const sourceParam = (req.query.source || "").toString(); // single value or csv

  // Sort param: name | newest | desc_len
  const sortParam = (req.query.sort || "").toString();

  const docs = loadDocs();

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const parseList = (val) =>
    String(val || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const parseBool = (val) => {
    const v = String(val || "").trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(v)) return true;
    if (["0", "false", "no", "n"].includes(v)) return false;
    return null; // not provided
  };

  let filtered = docs;

  // Text search
  if (q.trim()) {
    const nq = norm(q);
    filtered = filtered.filter((d) => {
      const a = norm(d.doc_id);
      const b = norm(d.text_preview || d.text || "");
      return a.includes(nq) || b.includes(nq);
    });
  }

  // Facet: IUCN status
  const statusList = parseList(statusParam).map((x) => x.toUpperCase());
  if (statusList.length) {
    filtered = filtered.filter((d) => statusList.includes(String(d.iucn_status || "").toUpperCase()));
  }

  // Facet: hasImage
  const hasImage = parseBool(hasImageParam);
  if (hasImage !== null) {
    filtered = filtered.filter((d) => {
      const has = Boolean(d.image_url);
      return hasImage ? has : !has;
    });
  }

  // Facet: source
  const sourceList = parseList(sourceParam).map((x) => norm(x));
  if (sourceList.length) {
    filtered = filtered.filter((d) => {
      const arr = Array.isArray(d.source) ? d.source : [];
      const normed = arr.map((s) => norm(s));
      // match if any requested source appears
      return sourceList.some((s) => normed.includes(s));
    });
  }

  // Sorting
  if (sortParam) {
    const sort = sortParam.toLowerCase();
    if (sort === "name") {
      filtered = filtered.slice().sort((a, b) => String(a.doc_id || "").localeCompare(String(b.doc_id || "")));
    } else if (sort === "desc_len") {
      const len = (d) => (d.text || d.text_preview || "").length;
      filtered = filtered.slice().sort((a, b) => len(b) - len(a)); // longer first
    } else if (sort === "newest") {
      // Approximate: use max numeric chunk id if available; fallback to 0
      const score = (d) => {
        const ids = Array.isArray(d.chunk_ids) ? d.chunk_ids : [];
        let max = 0;
        for (const id of ids) {
          const m = String(id).match(/(\d+)/g);
          if (m) {
            for (const part of m) {
              const n = parseInt(part, 10);
              if (Number.isFinite(n) && n > max) max = n;
            }
          }
        }
        return max;
      };
      filtered = filtered.slice().sort((a, b) => score(b) - score(a));
    }
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((d) => ({
    slug: d.slug,
    doc_id: d.doc_id,
    iucn_status: d.iucn_status || "",
    icun: d.iucn_status || "", // alias for clients expecting 'icun'
    image_url: d.image_url || "",
    text_preview: d.text_preview || "",
    url: d.url || "",
  }));

  res.json({ items, total, page, pageSize });
});

router.get("/api/docs/:slug", (req, res) => {
  const doc = getDocBySlug(req.params.slug);
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    slug: doc.slug,
    doc_id: doc.doc_id,
    iucn_status: doc.iucn_status || "",
    icun: doc.iucn_status || "", // alias for clients expecting 'icun'
    image_url: doc.image_url || "",
    text: doc.text || "",
    text_preview: doc.text_preview || "",
    url: doc.url || "",
    source: Array.isArray(doc.source) ? doc.source : [],
    pages: Array.isArray(doc.pages) ? doc.pages : [],
  });
});
// API: chat -> forward to Python FastAPI RAG backend

export default router;
