import json
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from sentence_transformers import CrossEncoder
from protonx import ProtonX
import os 

class Retriever:
    def __init__(self,
                 faiss_path="index.faiss",
                 chunks_path="chunks.jsonl",
                 embed_model_name="all-MiniLM-L6-v2",
                 use_rerank=True, rerank_model="cross-encoder/ms-marco-MiniLM-L-6-v2"):
        
        self.use_rerank = use_rerank
        if use_rerank:
            self.reranker = CrossEncoder(rerank_model)

        # load sentence-transformer
        self.embedder = SentenceTransformer(embed_model_name)
        # load faiss
        self.index = faiss.read_index(faiss_path)
        self.ntotal = self.index.ntotal
        self.dim = self.index.d
        # load chunks metadata
        self.id2doc = {}
        with open(chunks_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                j = json.loads(line)
                doc_id = int(j.get("id").replace("chunk_", "")) if "chunk_" in j.get("id") else int(i)
                self.id2doc[doc_id] = {
                    "text": j.get("text", ""),
                    "doc_id": j.get("doc_id", ""),
                    "source": j.get("source", ""),
                    "page": j.get("page", ""),
                    "image_url": j.get("image_url", None)
                }

        # reranker
        self.use_rerank = use_rerank
        if use_rerank:
            self.reranker = CrossEncoder(rerank_model)

    def embed_query(self, query: str):
        vec = self.embedder.encode(query, convert_to_numpy=True)
        vec = vec.astype("float32").reshape(1, -1)  # đảm bảo 2D
        faiss.normalize_L2(vec)  # chuẩn hóa
        return vec


    def retrieve(self, query: str, top_k: int = 5):
        qv = self.embed_query(query)
        D, I = self.index.search(qv, top_k)
        results = []
        for score, idx in zip(D[0], I[0]):
            if idx < 0:
                continue
            doc = self.id2doc.get(int(idx), {"text": "", "doc_id": ""})
            results.append({
                "id": int(idx),
                "score": float(score),
                "text": doc["text"],
                "doc_id": doc["doc_id"],
                "page": doc.get("page"),
                "image_url": doc.get("image_url")
            })

        if self.use_rerank and results:
            pairs = [[query, r["text"]] for r in results]
            scores = self.reranker.predict(pairs)
            for r, s in zip(results, scores):
                r["rerank_score"] = float(s)
            results = sorted(results, key=lambda x: x["rerank_score"], reverse=True)

        return results

