# scripts/rag_eval_config.py

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Adjust these to your actual folder + filenames:
KB_CONFIGS = {
    "sentences": {
        "base_dir": PROJECT_ROOT / "scripts" / "data_files_sentences",
        "chunks_file": "chunks.jsonl",          # e.g. "chunks-sentences-small.jsonl"
        "index_file": "index.faiss",           # e.g. "index-small.faiss"
        "embed_model_name": "intfloat/multilingual-e5-large-instruct",
    },
    "wiki_sections": {
        "base_dir": PROJECT_ROOT / "scripts" / "data_files_wiki_sections",
        "chunks_file": "chunks.jsonl",
        "index_file": "index.faiss",
        "embed_model_name": "intfloat/multilingual-e5-large-instruct",
    },
    "paragraph": {
        "base_dir": PROJECT_ROOT / "scripts" / "data_files_paragraph",
        "chunks_file": "chunks.jsonl",
        "index_file": "index.faiss",
        "embed_model_name": "intfloat/multilingual-e5-large-instruct",
    },
}
