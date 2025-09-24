# rag_pipeline.py
from retriever import Retriever
from lc_retriever import LC_Retriever
from langchain.chains import RetrievalQA

# Ollama 
from langchain_ollama import OllamaLLM
llm = OllamaLLM(model="llama3")

#  HuggingFaceHub 
# from langchain_huggingface import HuggingFaceEndpoint
# llm = HuggingFaceEndpoint(repo_id="meta-llama/Meta-Llama-3-8B-Instruct")

my_retriever = Retriever(faiss_path="index.faiss", chunks_path="chunks.jsonl")
lc_retriever = LC_Retriever(retriever=my_retriever, top_k=8)

qa = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=lc_retriever,
    chain_type="stuff", 
    return_source_documents=True
)

query = "Hổ Đông Dương sống ở đâu?"
result = qa.invoke(query)

print("\nAnswer:", result["result"])
print("\nSources:")
for doc in result["source_documents"]:
    print("-", doc.metadata.get("doc_id"), ":", doc.page_content[:150])
