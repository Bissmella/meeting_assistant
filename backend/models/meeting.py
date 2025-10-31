from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional

class Meeting(BaseModel):
    meeting_id: str = Field(alias="id")
    title: str
    participants: List[str]
    start_time: datetime
    transcript: Optional[str] = ""
    