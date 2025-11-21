# Meeting Copilot

A real-time AI-powered meeting recording, transcription, and chatting application built with React, WebCodecs, WebSockets, and Kyutai and Pleias LLM and STT models.

## Overview

**Meeting Copilot** captures live audio from your microphone, streams it to a backend server in real-time using WebSockets, transcribes it using STT (Speech-to-Text), and enables you to query meeting notes using RAG (Retrieval-Augmented Generation) with a small LLM.

### Key Features

- 🎙️ **Live Audio Recording**: Capture meetings with high-quality audio using the WebCodecs AudioEncoder (24kHz mono Opus codec).
- 📡 **Real-time Streaming**: Send audio to the server via WebSocket with minimal latency.
- 📝 **Automatic Transcription**: Server-side STT processing (simulated in prototype; ready for real STT integration).
- 🔍 **Smart Query**: Ask questions about your meeting notes and get AI-powered answers using small RAG LLM with additional RAG filtering.
- 💾 **Meeting Storage**: Store and organize all recorded meetings in Json file and a vector DB for RAG.

---

## Project Structure

```
meeting_assistant/
├── frontend/                           # React TypeScript frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.tsx                # Main React component
│   │   │   ├── useAudioProcessor.ts   # Audio recording & encoding hook
│   │   │   └── ...
│   │   └── index.tsx
│   ├── package.json
│   └── ...
├── backend/                           # FastAPI Python backend
│   ├── app.py                         # Main Flask app
│   └── requirements.txt
├── notebooks/
│   ├── stt_pytorch.ipynb              # LLM STT inference server (to be run in colab)                          
├── README.md                           # This file
└── .gitignore
```

---

## Architecture

### Frontend (React + TypeScript)

**Audio Pipeline:**
1. User clicks "Attend a New Meeting" → mic permission requested via `getUserMedia()`
2. Audio is captured using **MediaStreamTrackProcessor** (WebCodecs API)
3. Audio is encoded to **Opus codec** at **24kHz mono** using **AudioEncoder**
4. Encoded packets are sent to backend via **WebSocket** in JSON frames (base64-encoded)

**WebSocket Message Format:**
```json
{
  "type": "start",
  "session_id": "s_1697789012345",
  "sample_rate": 24000,
  "channels": 1,
  "codec": "opus"
}
```


### Backend (FastAPI + Python)

**Audio Processing:**
1. Receives WebSocket connections and audio and chat messages and responds
2. Stores and transcribes base64-decoded Opus packets to disk
3. On session finish, vectorize transcribtion and stores in vector db, stores meeting minute in json storage

### Models server (Pytorch, transformers, vllm, pleias LLM model, Kyutai STT model, FastAPI)
- Implemented in colab notebook but can be easily converted to proper setup
- Serves chat and audio STT requests

## Performance & Optimization

### Latency
- **Opus encoding** on browser: negligible (hardware-accelerated WebCodecs)
- **Server-side transcription**: depends on your inference GPU (30ms–60s+ per 2s of audio in google colab)

---

## Future Potential Enhancements
- [ ] Support for external LLM APIs (small LLMs not very appropriate for this task)
- [ ] Real-time transcription display in UI
- [ ] Speaker diarization (identify who is speaking)
- [ ] Meeting summary generation
- [ ] Export meeting notes (PDF, Markdown)
- [ ] Multi-user support & access control
- [ ] WebRTC for peer-to-peer audio (bypass server)
- [ ] Sentiment analysis on meeting content
- [ ] Action item extraction & tracking

