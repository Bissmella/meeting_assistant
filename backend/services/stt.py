import time
import numpy as np
import httpx
from fastrtc import audio_to_float32
import asyncio
import json

class SpeechToText:
    """Speech to Text Service Wrapper"""

    def __init__(self, api: str):
        """
        api: The URL of your STT backend (e.g. an ngrok endpoint)
        """
        self.api = api
        self.audio_queue = asyncio.Queue()
        self.transcript_buffer = "" #buffer for partial transcripts
        self.sent_samples = 0
        self.received_words = 0
        self.time_first_audio_sent = None  # fixed naming
        self.running = True
        asyncio.create_task(self._consume_audio_queue())

    async def _send(self, payload: dict):
        """Send payload to STT backend asynchronously"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(self.api, json=payload, headers={"Content-Type": "application/json"})
            if resp.status_code >= 400:
                print(f"❌ STT backend returned {resp.status_code}")
                print("🔍 Response text:", resp.text)
                #return {"error": f"Backend error {resp.status_code}", "details": resp.text}
            resp.raise_for_status()
            return resp.json()

    async def send_audio(self, audio: np.ndarray):
        """Send PCM audio to the STT backend and return transcription"""
        if audio.ndim != 1:
            raise ValueError(f"Expected 1D array, got {audio.shape=}")

        if audio.dtype != np.float32:
            audio = audio_to_float32(audio)

        self.sent_samples += len(audio)

        if self.time_first_audio_sent is None:
            self.time_first_audio_sent = time.perf_counter()
        self.audio_queue.put_nowait(audio)
        # Send the audio to your Colab STT model
        """
        if False:  # TODO: adjust as per your STT backend requirements
            response = await self._send({"type": "audio_chunk", "pcm": audio.tolist()})

            # Optionally, record words received
            if "text" in response:
                self.received_words += len(response["text"].split())
        else:
            # Mock response for demonstration
            await asyncio.sleep(0.1)  # simulate network delay
            response = "simulated transcription"

        return response
        """
    async def _consume_audio_queue(self):
        while self.running:
            audio = await self.audio_queue.get()
            try:
                response = await self._send({"type": "audio_chunk", "pcm": audio.tolist()})
                if "text" in response:
                    self.transcript_buffer += " " + response["text"]
            except Exception as e:
                print("Error sending audio to STT backend:", e)
            finally:
                self.audio_queue.task_done()
        