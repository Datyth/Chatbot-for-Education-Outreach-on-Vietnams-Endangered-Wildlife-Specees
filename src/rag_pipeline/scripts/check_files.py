from pathlib import Path
import json, numpy as np, faiss

DATA_DIR = Path(__file__).parent  # L���y th�� m���c ch��ca file code
print("Files in current directory:", list(DATA_DIR.iterdir()))

# manifest
with open(DATA_DIR / "manifest.json", "r", encoding="utf-8") as f:
    manifest = json.load(f)
print("Manifest params:", manifest.get("params"))

# embeddings
emb = np.load(DATA_DIR / "embeddings.npy")
print("embeddings.npy shape:", emb.shape, "dtype:", emb.dtype)

# chunks sample
print("First 3 lines of chunks.jsonl:")
with open(DATA_DIR / "chunks.jsonl", "r", encoding="utf-8") as f:
    for _ in range(3):
        print(f.readline().strip())

# faiss info
idx = faiss.read_index(str(DATA_DIR / "index.faiss"))
print("FAISS ntotal:", idx.ntotal)
try:
    print("FAISS d:", idx.d)
except Exception:
    print("FAISS index d attribute not available (depends on index type)")

