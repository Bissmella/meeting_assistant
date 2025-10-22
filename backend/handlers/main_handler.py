from backend.services.recorder import Recorder
from fastrtc import AsyncStreamHandler
import numpy as np
from backend.services.stt import SpeechToText

SAMPLE_RATE = 24000
RECORDINGS_DIR = "recordings"
class MeetingHandler(AsyncStreamHandler):
    def __init__(self, stt_api, sample_rate=SAMPLE_RATE):
        super().__init__(
            input_sample_rate=SAMPLE_RATE,
            output_frame_size=480,
            output_sample_rate=SAMPLE_RATE,
        )
        self.sample_rate = sample_rate
        self.n_samples_received = 0
        self.recorder = Recorder(RECORDINGS_DIR)
        self.stt = SpeechToText(api=stt_api)
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
        text = await self.stt.send_audio(audio)

        self.text_log.append(text)
        await self.recorder.add_text(text)

    def get_transcript(self):
        return self.text_log
    
    async def finalize_recording(self):
        """Finalize the recording session."""
        # Finalize STT (flush remaining audio or close connection)
        if self.closed:
            return
        

        # Save final transcript
        transcript = "\n".join(self.text_log)
        await self.recorder.save_transcript(transcript)
        await self.recorder.close()
        print("Recording finalized and saved.")
        self.closed = True

    async def emit(self):
        return None  # nothing to send to frontend