"""RAG pipeline using local Transformers model (Phat-Dat/Llama-3.2-1B-RLHF-DPO)."""
import logging
import os
import sys
from typing import Any, Dict, List, Optional

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

_BASE_DIR = os.path.dirname(__file__)
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

from retriever import Retriever  # noqa: E402

LOGGER = logging.getLogger("rag_pipeline")
logging.basicConfig(level=os.getenv("LOGLEVEL", "INFO"))

# ===== Config =====
HF_MODEL_ID = os.getenv("HF_MODEL_ID", "Phat-Dat/Llama-3.2-1B-RLHF-DPO")
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "300"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.3"))
TOP_P = float(os.getenv("TOP_P", "0.95"))
TOP_K = int(os.getenv("TOP_K", "50"))

# singletons
_TOKENIZER: Optional[AutoTokenizer] = None
_MODEL: Optional[AutoModelForCausalLM] = None
_RETRIEVER: Optional[Retriever] = None


def _resolve_data_path(env_var: str, default_filename: str) -> str:
    """Return a valid path for data files with safe fallback.

    - If the env var is set and exists, use it.
    - If the env var is set but missing, fall back to the default under this package.
    - If neither exists, raise a clear error.
    """
    default_path = os.path.join(_BASE_DIR, default_filename)
    env_path = os.getenv(env_var)

    if env_path:
        if os.path.exists(env_path):
            return env_path
        if os.path.exists(default_path):
            LOGGER.warning(
                "%s not found at %s; falling back to %s",
                env_var,
                env_path,
                default_path,
            )
            return default_path
        raise FileNotFoundError(
            f"{env_var} not found: {env_path}. Also missing default: {default_path}"
        )

    # No env var: use default
    return default_path


def _get_device_dtype():
    if torch.cuda.is_available():
        return "cuda", torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    if torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


def _get_model():
    global _TOKENIZER, _MODEL
    if _TOKENIZER is None or _MODEL is None:
        device, dtype = _get_device_dtype()
        LOGGER.info("Loading model %s on %s (dtype=%s)", HF_MODEL_ID, device, dtype)
        _TOKENIZER = AutoTokenizer.from_pretrained(HF_MODEL_ID, use_fast=True)
        _MODEL = AutoModelForCausalLM.from_pretrained(
            HF_MODEL_ID,
            torch_dtype=dtype,
            device_map="auto" if device != "cpu" else None,
        )
        if device == "cpu":
            _MODEL = _MODEL.to(dtype).to(device)
    return _TOKENIZER, _MODEL


def _get_retriever() -> Retriever:
    global _RETRIEVER
    if _RETRIEVER is None:
        faiss_path = _resolve_data_path("FAISS_INDEX", "index.faiss")
        chunks_path = _resolve_data_path("CHUNKS_JSONL", "chunks.jsonl")
        _RETRIEVER = Retriever(faiss_path=faiss_path, chunks_path=chunks_path)
    return _RETRIEVER


def build_messages(contexts: List[str], question: str) -> List[Dict[str, str]]:
    """Tạo messages theo chat template của tokenizer."""
    context_str = "\n\n".join(contexts) if contexts else "Không có ngữ cảnh."
    system_prompt = (
        "Bạn là trợ lý RAG trả lời NGẮN GỌN bằng tiếng Việt và CHỈ dựa trên ngữ cảnh. "
        "Nếu ngữ cảnh không đủ, hãy nói bạn không chắc thay vì suy đoán."
    )
    user_prompt = f"Ngữ cảnh:\n{context_str}\n\nCâu hỏi: {question}\n\nTrả lời:"
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _generate(messages):
    tokenizer, model = _get_model()
    device, _ = _get_device_dtype()

    # Lấy prompt string từ chat template
    prompt_text = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=False,          # <<< lấy string thay vì tensor
    )

    # Tokenize có attention_mask
    inputs = tokenizer(
        prompt_text,
        return_tensors="pt",
        add_special_tokens=False,
    )
    inputs = {k: v.to(model.device if device != "cpu" else device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model.generate(
            **inputs,                         # <<< truyền cả attention_mask
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=True if TEMPERATURE > 0 else False,
            temperature=TEMPERATURE,
            top_p=TOP_P,
            top_k=TOP_K,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
            use_cache=True,
        )

    gen_text = tokenizer.decode(outputs[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
    return gen_text.strip()

def _build_sources(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for r in results:
        out.append(
            {
                "doc_id": r.get("doc_id"),
                "page": r.get("page"),
                "image_url": r.get("image_url"),
                "score": float(r.get("score")) if r.get("score") is not None else None,
                "rerank_score": float(r.get("rerank_score")) if r.get("rerank_score") is not None else None,
                "snippet": (r.get("text") or "")[:300],
            }
        )
    return out


def run_rag(question: str, *, top_k: int = 6) -> Dict[str, Any]:
    q = (question or "").strip()
    if not q:
        raise ValueError("Question must not be empty.")

    retriever = _get_retriever()
    results = retriever.retrieve(q, top_k=max(1, int(top_k)))

    contexts = [r.get("text", "") for r in results if r.get("text")]
    messages = build_messages(contexts, q)

    try:
        answer = _generate(messages)
    except Exception as e:
        LOGGER.exception("Local generation failed: %s", e)
        fallback = contexts[0][:500] + ("..." if contexts and len(contexts[0]) > 500 else "")
        answer = "Không sinh được trả lời do lỗi runtime. Tóm tắt ngữ cảnh gần nhất:\n\n" + (fallback or "Không có ngữ cảnh.")

    return {"answer": answer, "sources": _build_sources(results)}


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]).strip() or "Động vật nào đang bị đe dọa tại Việt Nam?"
    out = run_rag(q)
    print(out["answer"])
