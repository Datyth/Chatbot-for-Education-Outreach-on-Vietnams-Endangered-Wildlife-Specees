# scripts/evaluate_rag_all.py

import json
import re
from pathlib import Path
from typing import List, Dict, Tuple

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

_LLM_MODEL_ID = "Phat-Dat/Llama-3.2-1B-RLHF-DPO"
_llm_model = None
_llm_tokenizer = None

from .rag_config import PROJECT_ROOT, KB_CONFIGS


QA_PATH = PROJECT_ROOT /"scripts"/ "sach_do_dong_vat_vietnam_qa_dataset.json"
OUT_DIR = PROJECT_ROOT / "scripts"/"eval_results"
OUT_DIR.mkdir(exist_ok=True)


# ---------- Load QA dataset ----------

def load_qa_pairs() -> List[Dict]:
    data = json.loads(QA_PATH.read_text(encoding="utf-8"))
    return data["qa_pairs"]


# ---------- Load one KB (one chunking method) ----------

def load_kb(kb_id: str) -> Tuple[faiss.Index, List[Dict], str]:
    cfg = KB_CONFIGS[kb_id]
    base_dir = cfg["base_dir"]

    chunks_path = base_dir / cfg["chunks_file"]
    index_path = base_dir / cfg["index_file"]
    embed_model_name = cfg["embed_model_name"]

    # load chunks
    chunks: List[Dict] = []
    with chunks_path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            chunks.append(json.loads(line))

    # load FAISS index
    index = faiss.read_index(str(index_path))

    return index, chunks, embed_model_name


# ---------- Embedding + retrieval ----------

_embedder_cache: Dict[str, SentenceTransformer] = {}


def get_embedder(model_name: str) -> SentenceTransformer:
    if model_name not in _embedder_cache:
        print(f"[embed] loading model {model_name}")
        _embedder_cache[model_name] = SentenceTransformer(model_name)
    return _embedder_cache[model_name]


def retrieve_topk(
    index: faiss.Index,
    embedder: SentenceTransformer,
    question: str,
    chunks: List[Dict],
    top_k: int = 5,
) -> Tuple[List[Dict], List[float]]:
    q_vec = embedder.encode([question], normalize_embeddings=True)
    q_vec = q_vec.astype("float32")
    D, I = index.search(q_vec, top_k)
    indices = I[0]
    scores = D[0]
    retrieved = [chunks[i] for i in indices]
    return retrieved, scores.tolist()


# ---------- Text normalization + scoring ----------

def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    text = text.strip()
    return text


def exact_match(pred: str, gold: str) -> bool:
    return normalize_text(pred) == normalize_text(gold)


def f1_score(pred: str, gold: str) -> float:
    pred_tokens = normalize_text(pred).split()
    gold_tokens = normalize_text(gold).split()
    if not pred_tokens or not gold_tokens:
        return 0.0
    common = set(pred_tokens) & set(gold_tokens)
    if not common:
        return 0.0
    precision = len(common) / len(pred_tokens)
    recall = len(common) / len(gold_tokens)
    return 2 * precision * recall / (precision + recall)


# ---------- LLM hook (your team plugs model here) ----------
def get_llm():
    """
    Lazy-load the HF model + tokenizer the first time we need it.
    """
    global _llm_model, _llm_tokenizer

    if _llm_model is not None and _llm_tokenizer is not None:
        return _llm_model, _llm_tokenizer

    print(f"[llm] loading model: {_LLM_MODEL_ID}")
    _llm_tokenizer = AutoTokenizer.from_pretrained(_LLM_MODEL_ID)
    _llm_model = AutoModelForCausalLM.from_pretrained(
        _LLM_MODEL_ID,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
    )

    return _llm_model, _llm_tokenizer
def call_llm(question: str, context_chunks: List[Dict]) -> str:
    model, tokenizer = get_llm()

    # Build context from retrieved chunks
    context = "\n\n".join(c.get("text", "") for c in context_chunks)

    # Prompt in Vietnamese, like before
    prompt = f"""Bạn là trợ lý về động vật trong Sách đỏ Việt Nam.

Câu hỏi: {question}

Dưới đây là một số đoạn tài liệu liên quan:

{context}

Hãy trả lời ngắn gọn, chính xác bằng tiếng Việt:"""

    # Tokenize with truncation so we don't exceed max length
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=2048,  # adjust if model has smaller/greater context window
    )

    # Move tensors to the same device as the model
    device = next(model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,   # how long the answer can be
            do_sample=False,      # deterministic (good for eval)
            temperature=0.0,      # ignore sampling randomness
            top_p=1.0,
            eos_token_id=tokenizer.eos_token_id,
        )

    generated = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # The decoded text includes the prompt + answer. Strip the prompt part.
    if generated.startswith(prompt):
        answer = generated[len(prompt):].strip()
    else:
        # Fallback if the model slightly changes the prompt
        answer = generated.strip()

    return answer

# ---------- Evaluate one KB ----------

def evaluate_kb(kb_id: str, top_k: int = 5) -> None:
    print(f"=== Evaluating KB: {kb_id} ===")

    index, chunks, embed_model_name = load_kb(kb_id)
    embedder = get_embedder(embed_model_name)
    qa_pairs = load_qa_pairs()

    results = []
    em_scores = []
    f1_scores = []

    for i, qa in enumerate(qa_pairs):
        q = qa["question"]
        gold = qa["answer"]

        retrieved, scores = retrieve_topk(index, embedder, q, chunks, top_k=top_k)

        try:
            pred = call_llm(q, retrieved)
        except NotImplementedError:
            # temporarily allow eval to run even before LLM is wired
            pred = ""

        em = exact_match(pred, gold)
        f1 = f1_score(pred, gold)

        em_scores.append(1.0 if em else 0.0)
        f1_scores.append(f1)

        results.append(
            {
                "id": i,
                "question": q,
                "gold_answer": gold,
                "model_answer": pred,
                "exact_match": em,
                "f1": f1,
                "retrieved_chunk_ids": [c.get("id") for c in retrieved],
                "retrieved_scores": [float(s) for s in scores],
            }
        )

        print(f"[{kb_id}] {i}/{len(qa_pairs)} → EM={em}, F1={f1:.3f}")

    summary = {
        "kb_id": kb_id,
        "n_questions": len(qa_pairs),
        "exact_match": sum(em_scores) / len(em_scores) if em_scores else 0.0,
        "f1": sum(f1_scores) / len(f1_scores) if f1_scores else 0.0,
    }

    out = {
        "summary": summary,
        "results": results,
    }

    out_path = OUT_DIR / f"{kb_id}.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[{kb_id}] DONE. EM={summary['exact_match']:.3f}, F1={summary['f1']:.3f}")
    print(f"Saved to {out_path}")


# ---------- Main ----------

def main():
    for kb_id in KB_CONFIGS.keys():
        evaluate_kb(kb_id, top_k=5)


if __name__ == "__main__":
    main()
