from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class Meeting(BaseModel):
    meeting_id: str
    title: str
    participants: List[str]
    start_time: datetime
    transcript: Optional[str] = ""
    