from typing import List
from langchain.schema import Document
from langchain.schema.retriever import BaseRetriever
from retriever import Retriever
from pydantic import Field

class LC_Retriever(BaseRetriever):
    retriever: Retriever = Field(...) 
    top_k: int = Field(default=5) 
    
    def _get_relevant_documents(self, query: str) -> List[Document]:
        results = self.retriever.retrieve(query, top_k=self.top_k)
        docs = []
        for r in results:
                docs.append(Document(
                    page_content=r["text"],
                    metadata={
                        "doc_id": r["doc_id"],
                        "page": r.get("page"),
                        "image_url": r.get("image_url"),
                        "score": r.get("score"),
                        "rerank_score": r.get("rerank_score", None)
                    }
                ))
        return docs

    async def _aget_relevant_documents(self, query: str) -> List[Document]:
        return self._get_relevant_documents(query)
