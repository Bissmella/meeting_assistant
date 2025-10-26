import os
from datetime import datetime
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from backend.models.meeting import Meeting

CHROMA_DIR = "./data/meetings"

class MeetingMemory:
    def __init__(self, embedder=None):
        os.makedirs(CHROMA_DIR, exist_ok=True)

        #embedding model
        if embedder is None:
            self.embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        else:
            self.embeddings = embedder

        #chroma db
        self.db = Chroma(
            persist_directory=CHROMA_DIR,
            embedding_function=self.embeddings,
        )

        #text splitter
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,   # ~750 tokens
            chunk_overlap=100, # maintain context between chunks
            separators=["\n\n", ".", "?", "!", " ", ""],
        )

    def add_meeting(
        self,
        meeting: Meeting,
    ):
        """Store a meeting transcript as chunks with metadata."""

        chunks = self.splitter.split_text(meeting.transcript)

        metadatas = [
            {
                "meeting_id": meeting.meeting_id,
                "title": meeting.title,
                "participants": ", ".join(meeting.participants),
                "datetime": meeting.start_time,
                "chunk_index": i,
            }
            for i in range(len(chunks))
        ]

        self.db.add_texts(chunks, metadatas=metadatas)
        self.db.persist()

    def query(self, query_text: str, k: int = 3):
        """Retrieve semantically similar meeting chunks."""
        results = self.db.similarity_search(query_text, k=k)
        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata,
            }
            for doc in results
        ]
