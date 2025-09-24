from retriever import Retriever

if __name__ == "__main__":
    r = Retriever(faiss_path="index.faiss", chunks_path="chunks.jsonl")
    query = "Hổ Đông Dương sống ở đâu?"
    results = r.retrieve(query, top_k=10)

    print(f"\nQuery: {query}")
    for res in results:
        print("-"*50)
        print(f"ID: {res['id']} | Score: {res['score']:.4f}")
        print(f"Doc: {res['doc_id']} | Page: {res['page']}")
        print(f"Text: {res['text'][:200]}...")
        if res['image_url']:
            print(f"Image: {res['image_url']}")
