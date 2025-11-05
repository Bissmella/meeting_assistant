import wave
import os
import asyncio

class Recorder:
    def __init__(self, dir="recordings"):
        os.makedirs(dir, exist_ok=True)
        self.dir = dir
        self.text_file = open(f"{dir}/transcript.txt", "w", encoding="utf-8")
        self.audio_path = f"{dir}/audio.wav"
        self.audio_frames = []

    async def add_audio(self, pcm):
        self.audio_frames.append(pcm.copy())

    async def add_text(self, text):
        self.text_file.write(text)
        self.text_file.flush()

    async def close(self):
        import numpy as np
        pcm = np.concatenate(self.audio_frames)
        with wave.open(self.audio_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes((pcm * 32767).astype("int16").tobytes())
        self.text_file.close()