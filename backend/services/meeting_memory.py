import os
from datetime import datetime
from langchain_text_splitters import RecursiveCharacterTextSplitter
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
            self.embedder = embedder
        #chroma db
        self.db = Chroma(
            persist_directory=CHROMA_DIR,
            embedding_function=self.embedder,
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
                "datetime": meeting.start_time.isoformat(),
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
    
    def get_last_meeting(self) -> Meeting | None:
        """Retrieve the most recent meeting based on start_time metadata."""
        all_meetings = self.db.get_all_documents()
        if not all_meetings:
            return None
        
        # Extract unique meetings
        meeting_dict = {}
        for doc in all_meetings:
            mid = doc.metadata["meeting_id"]
            if mid not in meeting_dict:
                meeting_dict[mid] = {
                    "title": doc.metadata["title"],
                    "participants": doc.metadata["participants"].split(", "),
                    "start_time": doc.metadata["datetime"],
                    "transcript_chunks": [],
                }
            meeting_dict[mid]["transcript_chunks"].append(doc.page_content)
        
        # Find the most recent meeting
        latest_meeting = None
        latest_time = None
        for mid, data in meeting_dict.items():
            start_time = datetime.fromisoformat(data["start_time"])
            if latest_time is None or start_time > latest_time:
                latest_time = start_time
                latest_meeting = Meeting(
                    meeting_id=mid,
                    title=data["title"],
                    participants=data["participants"],
                    start_time=start_time,
                    transcript="\n".join(data["transcript_chunks"]),
                )
        
        return latest_meeting
