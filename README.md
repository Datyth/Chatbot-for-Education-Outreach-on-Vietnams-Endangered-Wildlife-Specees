REDLIST VN – RAG Web App for Vietnam’s Endangered Wildlife

A small web application that helps users browse endangered wildlife in Vietnam and ask questions (in Vietnamese or English)
using a Retrieval‑Augmented Generation (RAG) chatbot with cited sources.

---

## 1. Overview

- **Web app:** Node.js + Express + Handlebars (views under `src/views`, static files in `src/public`).
- **Chat (RAG):** Python + FastAPI backend (`src/fastapi_app.py`) calling the local RAG pipeline in `rag_pipeline/`.
- **Data sources (for browsing UI):** preprocessed JSONL files in `src/public/assets/preproccessed_data/`.
- **Data sources (for RAG):** FAISS index + chunks JSONL in `rag_pipeline/`.

The Express server proxies `POST /api/chat` to the FastAPI backend (`POST /chat`), which runs the RAG pipeline and
returns an `answer` plus `sources` used for citations.

---

## 2. Requirements

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- `pip` and (recommended) a virtual environment (`venv` or `conda`)

The RAG backend downloads models on first run (Hugging Face + sentence-transformers), so an internet connection is
required the first time.

---

## 3. Set up the RAG backend (FastAPI)

> Bước này là bắt buộc nếu bạn muốn chatbot hoạt động. Phần còn lại của website (danh sách động vật, trang chi tiết)
> vẫn có thể chạy được mà không cần backend RAG.

### 3.1. Tạo và kích hoạt môi trường ảo

```bash
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate
```

### 3.2. Cài đặt thư viện Python

Tối thiểu để chạy pipeline hiện tại:

```bash
pip install fastapi "uvicorn[standard]" torch transformers \
    sentence-transformers faiss-cpu
```

Tuỳ chọn / khuyến nghị thêm:

```bash
pip install httpx huggingface_hub
# pip install langchain  # nếu bạn muốn dùng thêm LangChain
```

### 3.3. Chạy FastAPI

Từ thư mục gốc project, chạy:

```bash
python -m uvicorn src.fastapi_app:app --host 127.0.0.1 --port 8000 --reload
```

FastAPI sẽ chạy tại `http://127.0.0.1:8000` với:

- `GET /health` – health check đơn giản (`{"status": "ok"}`).
- `POST /chat` – endpoint chính được web app sử dụng.

Body gửi lên (ví dụ):

```json
{
  "message": "Câu hỏi của bạn",
  "top_k": 6,
  "filters": { "country": "VN" }
}
```

Response nhận về:

```json
{
  "answer": "…",
  "sources": [
    { "doc_id": "…", "page": 1, "image_url": "…", "score": 0.9, "rerank_score": 0.95, "snippet": "…" }
  ]
}
```

Định dạng này đúng với những gì `src/public/chat.js` đang xử lý.

### 3.4. Biến môi trường hữu ích (Python)

Tất cả đều **tuỳ chọn**, có giá trị mặc định nếu bạn không set.

- `HF_MODEL_ID` – model ID trên Hugging Face dùng cho sinh câu trả lời  
  (mặc định: `Phat-Dat/Llama-3.2-1B-RLHF-DPO` trong `rag_pipeline/rag_pipeline.py`).
- `FAISS_INDEX` – đường dẫn file FAISS index (mặc định: `rag_pipeline/index.faiss`).
- `CHUNKS_JSONL` – đường dẫn file chunks JSONL (mặc định: `rag_pipeline/chunks.jsonl`).
- `HUGGINGFACEHUB_API_TOKEN` – token HF nếu dùng model private (**không commit** vào repo).

---

## 4. Chạy web app (Express + Handlebars)

Từ thư mục gốc:

```bash
node src/index.js
```

Mặc định:

- URL web: `http://localhost:3000` (có thể đổi bằng biến môi trường `PORT`).
- Trang chủ: `/` (hero, chatbot, tin tức / highlight).
- Các trang động vật: `/animals`, `/animals/:slug`, v.v.

### 4.1. Proxy chat tới FastAPI

Trong `src/index.js`:

- Frontend gọi: `POST /api/chat`
- Proxy đến: `RAG_API_URL` (nếu set) hoặc `http://127.0.0.1:8000`
- Rewrite path: `/api/chat` → `/chat`

Set `RAG_API_URL` để trỏ tới FastAPI.

**Windows PowerShell:**

```powershell
$env:RAG_API_URL="http://127.0.0.1:8000"
node src/index.js
```

**macOS / Linux:**

```bash
export RAG_API_URL="http://127.0.0.1:8000"
node src/index.js
```

Nếu không set `RAG_API_URL`, server Express sẽ mặc định proxy tới `http://127.0.0.1:8000`.

---

## 5. Data files

### 5.1. Dữ liệu cho giao diện web

Được dùng để render card, danh sách, chi tiết:

- `src/public/assets/preproccessed_data/chunks.jsonl`
- `src/public/assets/preproccessed_data/pages.jsonl`
- `src/public/assets/preproccessed_data/index.faiss`
- `src/public/assets/preproccessed_data/embeddings.npy`
- `src/public/assets/preproccessed_data/manifest.json`

Các file này **khác** với bộ dữ liệu dưới `rag_pipeline/` (dùng cho RAG backend), nhưng nội dung tương tự.

### 5.2. Dữ liệu cho RAG pipeline

Được dùng bởi `rag_pipeline/retriever.py` và `rag_pipeline/rag_pipeline.py`:

- `rag_pipeline/index.faiss`
- `rag_pipeline/chunks.jsonl`
- `rag_pipeline/pages.jsonl`
- `rag_pipeline/embeddings.npy`
- `rag_pipeline/manifest.json`

Có thể đổi đường dẫn bằng cách set các biến `FAISS_INDEX` và `CHUNKS_JSONL`.

---

## 6. Cấu trúc thư mục (rút gọn)

```text
src/
  index.js           # Express server (routes, views, static, chat proxy)
  models/
    home.model.js    # Dữ liệu cho trang chủ
    animal.model.js  # Dữ liệu cho trang động vật
  routes/
    route.js         # Định nghĩa route chính
  views/             # Handlebars templates (home, about, details, ...)
  public/
    style.css        # CSS chính (bao gồm layout chatbot)
    chat.js          # Logic chatbot trên trang home
    chat-widget.js   # Logic widget chatbot dạng popup
    assets/          # Hình ảnh, video, data JSONL/FAISS cho web
  fastapi_app.py     # FastAPI app: /chat, /health

rag_pipeline/
  retriever.py       # FAISS + SentenceTransformer retriever
  rag_pipeline.py    # RAG pipeline (truy vấn + sinh câu trả lời)
  *.jsonl, *.faiss   # File dữ liệu index

data/, notebook/, test/
  # Script bổ trợ, notebook thử nghiệm, test (không bắt buộc để chạy demo)
```

---

## 7. API endpoints

### 7.1. FastAPI (RAG backend)

- `GET /health`  
  Trả về `{ "status": "ok" }` nếu backend đang chạy.

- `POST /chat`  
  Body: `ChatRequest` như ở phần 3.3, trả về `ChatResponse` gồm `answer` + `sources`.

### 7.2. Express (web app)

(Xem chi tiết trong `src/routes/route.js`)

- `GET /` – trang chủ (hero + chatbot + nội dung giới thiệu).
- `GET /animals` – danh sách loài.
- `GET /animals/:slug` – trang chi tiết từng loài.
- `POST /api/chat` – proxy tới FastAPI `/chat`.

---

## 8. Troubleshooting

- **Chat báo lỗi 5xx hoặc “assistant unavailable”:**
  - Kiểm tra FastAPI có đang chạy không (`http://127.0.0.1:8000/health`).
  - Kiểm tra biến `RAG_API_URL` đúng URL/port.
  - Xem log Python để tìm lỗi model / CUDA / thiếu thư viện.

- **Lỗi “file not found” cho chunks/index:**
  - Đảm bảo các file dữ liệu tồn tại trong `rag_pipeline/` và/hoặc `src/public/assets/preproccessed_data/`.
  - Nếu bạn di chuyển file, hãy set lại `FAISS_INDEX` và `CHUNKS_JSONL`.

- **Lần chạy đầu rất chậm:**
  - Lần đầu cần tải và load model vào RAM; những lần sau sẽ nhanh hơn.

---

## 9. Bảo mật

- Không commit secret (Hugging Face token, API key, private key, ...).
- Dùng biến môi trường hoặc file `.env` cục bộ và ignore trong Git:

```text
.env
*.env
```

Nếu lỡ commit secret, cần rewrite lịch sử (ví dụ: `git filter-repo`) và revoke token đã lộ.

---

## 10. License / Usage

Project được dùng cho mục đích demo nội bộ và giáo dục (ví dụ: đồ án môn học, prototype).  
Chưa đính kèm license phát hành công khai.

