from backend.services.recorder import Recorder
from fastrtc import AsyncStreamHandler
import numpy as np
from backend.services.stt import SpeechToText
from backend.models.meeting import Meeting
from backend.services.meeting_memory import MeetingMemory

SAMPLE_RATE = 24000
RECORDINGS_DIR = "recordings"
class MeetingHandler(AsyncStreamHandler):
    def __init__(self, stt_api, meeting_memory:MeetingMemory, sample_rate=SAMPLE_RATE):
        super().__init__(
            input_sample_rate=SAMPLE_RATE,
            output_frame_size=480,
            output_sample_rate=SAMPLE_RATE,
        )
        self.sample_rate = sample_rate
        self.n_samples_received = 0
        self.meeting: Meeting | None = None
        self.recorder = Recorder(RECORDINGS_DIR)
        self.stt = SpeechToText(api=stt_api)
        self.meeting_memory = meeting_memory
        self.current_buffer = []
        self.text_log = []
        self.closed = False


    async def receive(self, frame: tuple[int, np.ndarray]) -> None:
        sr, audio = frame
        assert sr == self.sample_rate
        self.n_samples_received += audio.shape[-1]

        # Save audio
        await self.recorder.add_audio(audio)

        # Stream audio to STT (non-blocking)
        await self.stt.send_audio(audio)
        self.meeting.transcript = self.stt.transcript_buffer
        

    def get_transcript(self):
        return self.meeting.transcript if self.meeting else ""
    
    async def finalize_recording(self):
        """Finalize the recording session."""
        # Finalize STT (flush remaining audio or close connection)
        if self.closed:
            return
        

        # Save final transcript
        await self.stt.finalize()
        if self.meeting is not None:
            self.meeting.transcript = self.stt.transcript_buffer
            await self.recorder.add_meeting(self.meeting)
            
            await self.recorder.close()
            if self.meeting.transcript.strip():
                self.meeting_memory.add_meeting(self.meeting)
            print("Recording finalized and saved.")
        self.closed = True

    async def emit(self):
        return None  # nothing to send to frontend
    
    def copy(self):
        return MeetingHandler()

    async def __aenter__(self):
        print("MeetingHandler started")
        self.closed = False
        return self

    async def __aexit__(self, exc_type, exc, tb):
        print("MeetingHandler closing")
        await self.finalize_recording()
        print("Meeting handler finalized")