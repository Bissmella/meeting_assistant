from backend.services.recorder import Recorder
from fastrtc import AsyncStreamHandler
import numpy as np

SAMPLE_RATE = 16000
RECORDINGS_DIR = "recordings"
class RecordingHandler(AsyncStreamHandler):
    def __init__(self, stt_instance, sample_rate=SAMPLE_RATE):
        self.sample_rate = sample_rate
        self.n_samples_received = 0
        self.recorder = Recorder(RECORDINGS_DIR)
        self.stt = stt_instance
        self.current_buffer = []
        self.text_log = []

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

    async def emit(self):
        return None  # nothing to send to frontend