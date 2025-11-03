# RAG Preprocessing (PDF + Wikipedia)
Pipeline to turn PDFs and Wikipedia pages into **chunks**, **embeddings**, and a **FAISS** index for RAG.
    Purposes:
- Reads PDFs, extracts text; image-only pages are OCR’d.
- Fetches Wikipedia pages from seed titles (or from a wikitable’s first column).
- Cleans text → splits into chunks (sentences/paragraphs/wiki sections).
- Deduplicates → embeds with SentenceTransformers → builds FAISS index.
- Saves artifacts for reuse.
  Parameters mainly adjusted in base.py and constants.py.
    Output: 
- pages.jsonl – page-level text (PDF/Wiki/OCR).
- chunks.jsonl – final text chunks with metadata.
- embeddings.npy – float32 matrix.
- index.faiss – FAISS inner-product index.
- manifest.json – change tracking for incremental runs.
