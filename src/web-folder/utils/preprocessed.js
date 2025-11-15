import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// This file lives under <project_root>/src/web-folder/utils, so go up 3 levels.
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function findFile(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function normalize(str) {
  return String(str || "").trim();
}

function toSlug(input) {
  return normalize(input)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractIucnStatus(text) {
  if (!text) return null;
  const upper = text.toUpperCase();
  const statuses = ["CR", "EN", "VU", "NT", "LC", "EX", "EW", "DD", "NE"];
  // Look for status code within a short window after the token "IUCN"
  const idx = upper.indexOf("IUCN");
  if (idx >= 0) {
    const win = upper.slice(idx, idx + 120);
    for (const code of statuses) {
      const re = new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`);
      if (re.test(win)) return code;
    }
  }
  // Fallback: scan whole text for a standalone status code (less strict)
  for (const code of statuses) {
    const re = new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`);
    if (re.test(upper)) return code;
  }
  return null;
}

function normalizeIucnField(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  const map = {
    CR: "CR",
    EN: "EN",
    VU: "VU",
    NT: "NT",
    LC: "LC",
    EX: "EX",
    EW: "EW",
    DD: "DD",
    NE: "NE",
  };
  return map[v] || null;
}

let cache = null;

export function loadDocs() {
  if (cache) return cache;
  const candidates = [
    // Prefer freshest pipeline output
    path.resolve(projectRoot, "data", "data_files", "chunks.jsonl"),
    // Legacy/packaged locations
    path.resolve(projectRoot, "src", "web-folder", "public", "assets", "preproccessed_data", "chunks.jsonl"),
    path.resolve(projectRoot, "public", "assets", "preproccessed_data", "chunks.jsonl"),
    path.resolve(projectRoot, "preproccessed_data", "chunks.jsonl"),
    path.resolve(projectRoot, "PreprocessingRAG", "preproccessed_data", "chunks.jsonl"),
  ];
  const src = findFile(candidates);
  if (!src) {
    cache = [];
    return cache;
  }

  const text = fs.readFileSync(src, "utf8");
  const lines = text.split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    const docKey = obj.doc_id || obj.title || obj.id || obj.url;
    if (!docKey) continue;

    let entry = map.get(docKey);
    if (!entry) {
      entry = {
        doc_id: docKey,
        sourceSet: new Set(),
        pagesSet: new Set(),
        chunkIds: [],
        textParts: [],
        image_url: obj.image_url || null,
        url: obj.url || null,
        iucn_status: null,
      };
      map.set(docKey, entry);
    }
    if (obj.source) entry.sourceSet.add(obj.source);
    if (obj.page !== undefined && obj.page !== null) entry.pagesSet.add(obj.page);
    if (obj.id) entry.chunkIds.push(obj.id);
    if (typeof obj.text === "string" && obj.text.trim()) entry.textParts.push(obj.text.trim());
    if (!entry.image_url && obj.image_url) entry.image_url = obj.image_url;
    if (!entry.url && obj.url) entry.url = obj.url;

    // Prefer explicit IUCN fields if present in data (supports common variants)
    const iucnField =
      obj.icun ||
      obj.iucn ||
      obj.iucn_status ||
      obj.IUCN ||
      obj.IUCN_status ||
      obj.iucn_code ||
      obj.iucn_text ||
      obj.iucnStatus ||
      null;
    const normalized = normalizeIucnField(iucnField);
    if (!entry.iucn_status && normalized) entry.iucn_status = normalized;
  }

  const rows = Array.from(map.values()).map((entry) => {
    const combinedText = entry.textParts.join("\n\n");
    const statusFromText = extractIucnStatus(combinedText);
    return {
      doc_id: entry.doc_id,
      slug: toSlug(entry.doc_id),
      source: Array.from(entry.sourceSet),
      pages: Array.from(entry.pagesSet).sort((a, b) => a - b),
      chunk_ids: entry.chunkIds,
      text: combinedText,
      text_preview: combinedText.slice(0, 600),
      image_url: entry.image_url || null,
      url: entry.url || null,
      iucn_status: entry.iucn_status || statusFromText || null,
    };
  });

  cache = rows;
  return cache;
}

export function getDocBySlug(slug) {
  const list = loadDocs();
  const s = String(slug || "").toLowerCase();
  return list.find((d) => d.slug === s) || null;
}

export function mapListItem(doc) {
  return {
    slug: doc.slug,
    commonName: doc.doc_id,
    scientificName: "",
    iucnStatus: doc.iucn_status || "",
    thumbnail: doc.image_url || "",
    summary: doc.text_preview || "",
  };
}
