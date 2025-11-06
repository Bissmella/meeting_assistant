from pydantic import BaseModel, Field, ValidationError
from datetime import datetime
from typing import List, Optional

class Meeting(BaseModel):
    meeting_id: str = Field(alias="id")
    title: str
    participants: List[str]
    start_time: datetime
    transcript: Optional[str] = ""

    def _to_dict(self):
        return {
            "id": self.meeting_id,
            "title": self.title,
            "participants": self.participants,
            "start_time": self.start_time.isoformat(),
            "transcript": self.transcript,
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        try:
            # Pydantic validates the input dictionary against the model structure
            return cls.model_validate(data)
        except ValidationError as e:
            print(f"Validation error loading meeting data: {e}")
            # Skip corrupted entries
            return None


    