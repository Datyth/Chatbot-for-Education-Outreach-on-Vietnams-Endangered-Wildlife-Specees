import json
import os
from typing import Any, Dict, List, Optional

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from sentence_transformers import CrossEncoder


class Retriever:
    """
    Simple FAISS + SentenceTransformer retriever.
    - Tải index FAISS và danh sách chunks (JSONL).
    - Tính embedding cho truy vấn, search top_k.
    - (Optional) Rerank bằng CrossEncoder.
    """

    def __init__(
        self,
        faiss_path: str = "index.faiss",
        chunks_path: str = "chunks.jsonl",
        embed_model_name: str = "all-MiniLM-L6-v2",
        use_rerank: bool = True,
        rerank_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
    ) -> None:
        if not os.path.exists(faiss_path):
            raise FileNotFoundError(f"FAISS index not found: {faiss_path}")
        if not os.path.exists(chunks_path):
            raise FileNotFoundError(f"Chunks file not found: {chunks_path}")

        self.index = faiss.read_index(faiss_path)
        self.chunks = self._load_jsonl(chunks_path)

        # sentence-transformers embedder
        device = "cpu"
        self.embedder = SentenceTransformer(embed_model_name, device=device)

        self.use_rerank = use_rerank
        self.reranker: Optional[CrossEncoder] = None
        if self.use_rerank:
            self.reranker = CrossEncoder(rerank_model)

    @staticmethod
    def _load_jsonl(path: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    out.append(obj)
                except Exception:
                    # Bỏ qua dòng xấu thay vì vỡ toàn bộ
                    continue
        return out

    def embed_query(self, query: str) -> np.ndarray:
        vec = self.embedder.encode(query, convert_to_numpy=True)
        vec = vec.astype("float32").reshape(1, -1)  # đảm bảo 2D
        faiss.normalize_L2(vec)  # chuẩn hóa L2 cho cosine similarity
        return vec

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not query:
            return []

        qv = self.embed_query(query)
        # FAISS search
        D, I = self.index.search(qv, max(1, int(top_k)))
        idxs = I[0].tolist()
        scores = D[0].tolist()

        results: List[Dict[str, Any]] = []
        for score, idx in zip(scores, idxs):
            if idx < 0 or idx >= len(self.chunks):
                continue
            doc = self.chunks[idx]
            results.append(
                {
                    "text": doc.get("text", ""),
                    "doc_id": doc.get("doc_id"),
                    "page": doc.get("page"),
                    "image_url": doc.get("image_url"),
                    "score": float(score),
                    "idx": int(idx),
                }
            )

        # (Optional) Cross-Encoder re-ranking
        if self.use_rerank and self.reranker is not None and results:
            pairs = [[query, r["text"]] for r in results]
            ce_scores = self.reranker.predict(pairs)
            for r, s in zip(results, ce_scores):
                r["rerank_score"] = float(s)
            results = sorted(
                results,
                key=lambda x: (x.get("rerank_score", -1e9), x.get("score", -1e9)),
                reverse=True,
            )

        return results
