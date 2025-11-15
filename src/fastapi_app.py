
from typing import Any, Dict, Optional
import os
import sys

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse
import importlib.util

# Ensure project root (which contains `src/`) is on sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))  # .../src
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Load the local rag_pipeline module by file path to avoid conflicts with any
# installed packages named `rag_pipeline`.
RAG_PIPELINE_PATH = os.path.join(CURRENT_DIR, "rag_pipeline", "rag_pipeline.py")
if not os.path.exists(RAG_PIPELINE_PATH):
    raise RuntimeError(f"rag_pipeline.py not found at {RAG_PIPELINE_PATH}")

_spec = importlib.util.spec_from_file_location("local_rag_pipeline", RAG_PIPELINE_PATH)
_rag_module = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_rag_module)
run_rag = _rag_module.run_rag


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message/question")
    top_k: Optional[int] = Field(6, ge=1, le=20, description="Number of contexts to retrieve")
    # Accept arbitrary filters from the UI but not used by the current retriever
    filters: Optional[Dict[str, Any]] = Field(default=None)


class ChatResponse(BaseModel):
    answer: str
    sources: list


app = FastAPI(title="RAG Chat Backend", version="0.1.0")


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


def _handle_chat(req: ChatRequest):
    q = (req.message or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="'message' must not be empty")

    try:
        result = run_rag(q, top_k=req.top_k or 6)
    except Exception as e:
        # Convert internal errors to a 500 with a friendly message
        raise HTTPException(status_code=500, detail=f"RAG error: {e}")

    answer = result.get("answer", "")
    sources = result.get("sources", [])
    # Ensure UTF-8 content type to render Vietnamese diacritics correctly
    return JSONResponse(
        content={"answer": answer, "sources": sources},
        media_type="application/json; charset=utf-8",
    )


# Primary endpoint expected by the UI proxy
@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    return _handle_chat(req)


# Alias to support proxies that end up posting to root and/or send
# non-JSON bodies. This accepts JSON, form, or query string.
@app.post("/")
async def chat_root(req: Request):
    q = ""
    try:
        data = await req.json()
        if isinstance(data, dict):
            q = str(data.get("message") or "").strip()
    except Exception:
        # Try form
        try:
            form = await req.form()
            q = str(form.get("message") or "").strip()
        except Exception:
            pass

    if not q:
        # Fallback to query params
        q = str(req.query_params.get("message") or req.query_params.get("q") or "").strip()

    if not q:
        raise HTTPException(status_code=400, detail="message is required")

    try:
        result = run_rag(q, top_k=6)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG error: {e}")

    return JSONResponse(
        content={"answer": result.get("answer", ""), "sources": result.get("sources", [])},
        media_type="application/json; charset=utf-8",
    )


if __name__ == "__main__":

    import uvicorn

    uvicorn.run("fastapi_app:app", host="127.0.0.1", port=8000, reload=True)
