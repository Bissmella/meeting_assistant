import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Mic, StopCircle, MessageSquare, Send, Zap, Trash2, BookOpen } from 'lucide-react';

// --- API Configuration ---
// NOTE: apiKey is intentionally left blank; the Canvas environment provides it at runtime.
const apiKey = "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// --- Mock Data Generator (Simulates Kyutai STT Transcription) ---
const generateMockTranscript = (title) => {
  const currentTimestamp = new Date().toLocaleString();
  const templates = [
    `The ${title} meeting focused entirely on Project Alpha's budget overruns. John mentioned the spending was 20% over target, primarily due to unexpected software license costs. The action item for Sarah is to review vendor contracts by Friday. We decided to postpone the launch date by two weeks to accommodate this review.`,
    `During the ${title} session, we discussed the Q4 marketing strategy. The primary goal is to target mobile users in Asia. We need three new creatives designed by next Tuesday. Action item for Mark: finalize the influencer outreach list. Key decisions included shifting 40% of the budget from print media to digital channels.`,
    `This ${title} sync covered the hiring roadmap. We have three open roles: Senior Engineer, UX Designer, and Product Manager. Action item for HR (Jamie) is to close the Engineer role by end of month. The priority is the UX Designer role because Project Beta is blocked without it. Finance approved a higher salary band for the Product Manager role.`,
    `The ${title} recap confirmed that all systems are green for the launch next week. The only risk identified was the dependency on the external API service, which had a 99.5% uptime last month. Action item for Alex: double-check the failover procedures. The team celebrated the successful completion of the testing phase.`
  ];
  const template = templates[Math.floor(Math.random() * templates.length)];
  return `--- ${title} (${currentTimestamp}) ---\n${template}`;
};


// --- The Main Application Component ---
const App = () => {
    // 2. Application State
    const [appState, setAppState] = useState('ready'); // 'ready', 'recording', 'processing', 'chatting'
    const [meetings, setMeetings] = useState([]);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [meetingTitle, setMeetingTitle] = useState('');

    // 3. Chat State
    const [chatHistory, setChatHistory] = useState([]);
    const [queryInput, setQueryInput] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);




    // Recording/session state
    const [recorder, setRecorder] = useState(null); // kept for UI parity (not a MediaRecorder here)
    const [mediaStream, setMediaStream] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [chunkIndex, setChunkIndex] = useState(0);

    // Audio pipeline refs
    const audioContextRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const processorRef = useRef(null);
    const audioBufferRef = useRef([]); // collects Float32 arrays until flush
    const encoderRef = useRef(null);
    const msProcessorRef = useRef(null);
    const msReaderRef = useRef(null);
    const chunkIndexRef = useRef(0);
    const wsRef = useRef(null);

    // Keep a ref+state in sync for chunk numbering
    const incrementChunkIndex = () => {
        setChunkIndex(prev => {
            const nv = prev + 1;
            chunkIndexRef.current = nv;
            return nv;
        });
    };

    // --- Application Actions ---

    // Helper: convert Float32Array interleaved to mono Float32 and resample to 24kHz
    const resampleFloat32To24k = (buffers, inputSampleRate) => {
        // Concatenate buffers
        let totalLen = buffers.reduce((s, b) => s + b.length, 0);
        const input = new Float32Array(totalLen);
        let offset = 0;
        for (const b of buffers) {
            input.set(b, offset);
            offset += b.length;
        }

        const targetRate = 24000;
        if (inputSampleRate === targetRate) return input;

        const ratio = inputSampleRate / targetRate;
        const outLen = Math.round(input.length / ratio);
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const idx = i * ratio;
            const i0 = Math.floor(idx);
            const i1 = Math.min(i0 + 1, input.length - 1);
            const frac = idx - i0;
            out[i] = input[i0] * (1 - frac) + input[i1] * frac;
        }
        return out;
    };

    const floatTo16BitPCM = (float32) => {
        const l = float32.length;
        const out = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            let s = Math.max(-1, Math.min(1, float32[i]));
            out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return out;
    };

    const uint8ArrayToBase64 = (u8) => {
        // browser-friendly base64 from Uint8Array
        let CHUNK_SIZE = 0x8000;
        let index = 0;
        const length = u8.length;
        let result = '';
        while (index < length) {
            const slice = u8.subarray(index, Math.min(index + CHUNK_SIZE, length));
            result += String.fromCharCode.apply(null, slice);
            index += CHUNK_SIZE;
        }
        return btoa(result);
    };

    // Send a chunk: if a global/available Opus encoder exists (e.g. window.OpusEncoder
    // provided by a WASM build you add), use it to produce Opus bytes. Otherwise send
    // PCM bytes and mark server-side to transcode to Opus.
    const sendAudioChunk = async (session_id, idx, int16pcm, sampleRate = 24000) => {
        try {
            let payload = {
                session_id,
                chunk_index: idx,
                codec: 'opus',
                sample_rate: sampleRate,
                channels: 1,
                data: null // base64
            };

            if (window && window.OpusEncoder && typeof window.OpusEncoder.encode === 'function') {
                // Example encoder API: OpusEncoder.encode(Int16Array) -> Uint8Array (opus packets)
                const opusBytes = window.OpusEncoder.encode(int16pcm);
                payload.data = uint8ArrayToBase64(new Uint8Array(opusBytes));
                payload.codec = 'opus';
            } else {
                // Fallback: send raw PCM and instruct server to transcode to Opus
                payload.data = uint8ArrayToBase64(new Uint8Array(int16pcm.buffer));
                payload.codec = 'pcm_s16le';
                payload.server_should_transcode_to = 'opus';
            }

            // Prefer websocket if available (lower latency)
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'chunk', ...payload }));
                incrementChunkIndex();
            } else {
                await fetch('/api/upload_audio_base64', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                incrementChunkIndex();
            }
        } catch (err) {
            console.error('Failed to send audio chunk', err);
        }
    };

    const sendEncodedChunk = async (session_id, idx, base64data, sampleRate = 24000) => {
        try {
            const payload = {
                session_id,
                chunk_index: idx,
                codec: 'opus',
                sample_rate: sampleRate,
                channels: 1,
                data: base64data
            };
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'chunk', ...payload }));
                incrementChunkIndex();
            } else {
                await fetch('/api/upload_audio_base64', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                incrementChunkIndex();
            }
        } catch (err) {
            console.error('Failed to send encoded opus chunk', err);
        }
    };

    // Open a websocket for audio streaming for this session_id
    const ensureWs = (session_id) => {
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
        const loc = window.location;
        const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${loc.host}/ws/audio?session_id=${encodeURIComponent(session_id)}`;
        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;
            ws.addEventListener('open', () => {
                console.log('Audio websocket opened', wsUrl);
                // send start message
                ws.send(JSON.stringify({ type: 'start', session_id: session_id, sample_rate: 24000, channels: 1, codec: 'opus' }));
            });
            ws.addEventListener('message', (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    // small debugging acks
                    if (msg.type === 'ack') {
                        // ack: { session_id, chunk_index }
                        // could be used for retry/backpressure
                        // console.log('ack', msg);
                    }
                } catch (e) {
                    // non-json message
                }
            });
            ws.addEventListener('close', () => console.log('Audio websocket closed'));
            ws.addEventListener('error', (e) => console.warn('Audio websocket error', e));
        } catch (err) {
            console.warn('Failed to open websocket', err);
            wsRef.current = null;
        }
    };

    const closeWs = (session_id) => {
        try {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'finish', session_id }));
                wsRef.current.close();
            }
        } catch (e) {
            console.warn('Error closing websocket', e);
        } finally {
            wsRef.current = null;
        }
    };

    const startRecording = async () => {
        try {
            const title = `Project Sync - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
            setMeetingTitle(title);

            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setMediaStream(stream);

            // Create a unique session id for chunk grouping
            const sid = `s_${Date.now()}`;
            setSessionId(sid);
            setChunkIndex(0);
            // keep ref in sync and open websocket for real-time streaming
            chunkIndexRef.current = 0;
            ensureWs(sid);

            // Prefer WebCodecs path (MediaStreamTrackProcessor + AudioEncoder) when available
            if (window.MediaStreamTrackProcessor && window.AudioEncoder) {
                try {
                    const track = stream.getAudioTracks()[0];
                    const msp = new window.MediaStreamTrackProcessor({ track });
                    msProcessorRef.current = msp;
                    const reader = msp.readable.getReader();
                    msReaderRef.current = reader;

                    // Create AudioEncoder for Opus at 24kHz mono
                    const encoder = new window.AudioEncoder({
                        output: async (chunk, metadata) => {
                            try {
                                // copy encoded chunk bytes
                                const size = chunk.byteLength || (chunk.data && chunk.data.byteLength) || 0;
                                const u8 = new Uint8Array(size);
                                // EncodedAudioChunk has copyTo
                                if (typeof chunk.copyTo === 'function') {
                                    chunk.copyTo(u8);
                                } else if (chunk.data) {
                                    u8.set(new Uint8Array(chunk.data));
                                }
                                const b64 = uint8ArrayToBase64(u8);
                                await sendEncodedChunk(sid, chunkIndexRef.current, b64, 24000);
                            } catch (err) {
                                console.error('Error handling encoded chunk', err);
                            }
                        },
                        error: (e) => console.error('AudioEncoder error', e)
                    });

                    encoder.configure({ codec: 'opus', sampleRate: 24000, numberOfChannels: 1, bitrate: 64000 });
                    encoderRef.current = encoder;

                    // Start pumping audio data into encoder
                    (async function pump() {
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            try {
                                // value is an AudioData object from MediaStreamTrackProcessor
                                encoder.encode(value);
                            } catch (err) {
                                console.error('encode error', err);
                            } finally {
                                try { value.close(); } catch (e) {}
                            }
                        }
                    })();

                    setRecorder({ webcodecs: true });
                    setAppState('recording');
                } catch (err) {
                    console.warn('WebCodecs path failed, falling back to PCM path', err);
                }
            }

            // If no webcodecs/encoder started, fallback to ScriptProcessor PCM path
            if (!recorder || !recorder.webcodecs) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                const ac = new AudioContext();
                audioContextRef.current = ac;

                const source = ac.createMediaStreamSource(stream);
                sourceNodeRef.current = source;

                // bufferSize: 4096 is a reasonable default. Mono output
                const processor = ac.createScriptProcessor(4096, source.channelCount, 1);
                processorRef.current = processor;

                audioBufferRef.current = [];

                processor.onaudioprocess = (event) => {
                    // take first channel (mono) and store copy
                    const ch = event.inputBuffer.getChannelData(0);
                    audioBufferRef.current.push(new Float32Array(ch));
                };

                source.connect(processor);
                processor.connect(ac.destination); // required in some browsers to start processing

                // Periodically flush buffers (send every 1s)
                const flushInterval = setInterval(async () => {
                    if (!audioBufferRef.current.length) return;
                    const buffers = audioBufferRef.current.splice(0, audioBufferRef.current.length);
                    const inputSampleRate = ac.sampleRate;
                    const resampled = resampleFloat32To24k(buffers, inputSampleRate);
                    const int16 = floatTo16BitPCM(resampled);
                    await sendAudioChunk(sid, chunkIndexRef.current, int16, 24000);
                }, 1000);

                // store a lightweight token in recorder state so finishMeeting can detect running
                setRecorder({ flushInterval });
                setAppState('recording');
            }
        } catch (err) {
            console.error('startRecording failed', err);
        }
    };

    const finishMeeting = async () => {
        // Stop the audio capture, flush pending buffers, and tell backend to finalize
        if (recorder && recorder.flushInterval) {
            // stop periodic flush
            clearInterval(recorder.flushInterval);
        }

        if (processorRef.current) {
            try {
                // Flush any remaining audio
                const ac = audioContextRef.current;
                if (audioBufferRef.current.length) {
                    const buffers = audioBufferRef.current.splice(0, audioBufferRef.current.length);
                    const resampled = resampleFloat32To24k(buffers, ac.sampleRate);
                    const int16 = floatTo16BitPCM(resampled);
                    await sendAudioChunk(sessionId, chunkIndexRef.current, int16, 24000);
                }
            } catch (err) {
                console.error('Error flushing remaining audio', err);
            }
        }

        // Disconnect and stop tracks
        try {
            if (processorRef.current) {
                processorRef.current.disconnect();
                processorRef.current.onaudioprocess = null;
                processorRef.current = null;
            }
            if (sourceNodeRef.current) {
                sourceNodeRef.current.disconnect();
                sourceNodeRef.current = null;
            }
            // WebCodecs cleanup (if used)
            if (msReaderRef.current) {
                try { await msReaderRef.current.cancel(); } catch (e) {}
                msReaderRef.current = null;
            }
            if (msProcessorRef.current) {
                try { msProcessorRef.current.track.stop(); } catch (e) {}
                msProcessorRef.current = null;
            }
            if (encoderRef.current) {
                try { await encoderRef.current.flush(); } catch (e) {}
                try { encoderRef.current.close(); } catch (e) {}
                encoderRef.current = null;
            }
            if (audioContextRef.current) {
                await audioContextRef.current.close();
                audioContextRef.current = null;
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach(t => t.stop());
                setMediaStream(null);
            }
        } catch (err) {
            console.warn('Error during audio shutdown', err);
        }

        // Notify backend to finalize session (server-side assembly / transcription)
        try {
            const res = await fetch('/api/finish_upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });
            const json = await res.json();
            if (json.success) {
                setMeetings(prev => [{ ...json.note }, ...prev]);
                setCurrentTranscript(json.note.transcript || '');
            } else {
                console.error('finish_upload error', json);
            }
        } catch (err) {
            console.error('Error finishing upload', err);
            // fallback to mock
            setAppState('processing');
            await new Promise(resolve => setTimeout(resolve, 1500));
            const finalTranscript = generateMockTranscript(meetingTitle);
            setMeetings(prev => [{ id: String(prev.length + 1), title: meetingTitle, transcript: finalTranscript, timestamp: new Date() }, ...prev]);
        } finally {
            // Close websocket (if used) for this session
            try { closeWs(sessionId); } catch (e) {}
            setRecorder(null);
            setSessionId(null);
            setChunkIndex(0);
            setAppState('ready');
            setMeetingTitle('');
        }
    };

    const handleQuery = async (e) => {
        e.preventDefault();
        if (!queryInput.trim() || isQuerying || meetings.length === 0) return;

        const userQuery = queryInput.trim();
        setQueryInput('');
        setIsQuerying(true);

        // Add user query to chat history
        setChatHistory(prev => [...prev, { role: 'user', text: userQuery }]);

        // 1. Build the RAG Context from all stored meetings
        const allContext = meetings.map(m =>
            `--- Meeting: ${m.title} (ID: ${m.id}) ---\n${m.transcript}`
        ).join('\n\n');

        // 2. Define the System Instruction for RAG
        const systemPrompt = `You are a helpful and concise Meeting Assistant. Your task is to analyze the provided meeting transcripts (CONTEXT) and answer the user's question accurately. You MUST ONLY use information found in the provided context. If you cannot find the answer within the context, you must politely state: "I couldn't find the answer to that question in the available meeting notes."`;

        const payload = {
            contents: [{ parts: [{ text: `CONTEXT:\n\n${allContext}\n\nUSER QUESTION: ${userQuery}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ "google_search": {} }], // Use Google Search for grounding only if the user query is very generic/broad
        };

        const maxRetries = 3;
        let attempt = 0;
        let responseText = "I encountered an error while consulting the notes.";

        while (attempt < maxRetries) {
            try {
                const response = await fetch(GEMINI_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                responseText = text || "LLM response was empty.";

                break; // Success, exit loop
            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed:`, error);
                attempt++;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
                }
            }
        }

        // Add assistant response to chat history
        setChatHistory(prev => [...prev, { role: 'assistant', text: responseText }]);
        setIsQuerying(false);
    };


    const MeetingControlPanel = () => (
        <div className="p-4 bg-white shadow-xl rounded-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Meeting Controls</h2>
            {appState === 'ready' && (
                <button
                    onClick={startRecording}
                    className="w-full flex items-center justify-center p-3 text-lg font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition duration-150 shadow-md"
                >
                    <Mic className="w-5 h-5 mr-3" /> Attend a New Meeting
                </button>
            )}

            {appState === 'recording' && (
                <div className="space-y-3">
                    <p className="text-sm text-center font-medium text-red-600">
                        <span className="animate-pulse inline-block w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                        Recording: **{meetingTitle}**
                    </p>
                    <button
                        onClick={finishMeeting}
                        className="w-full flex items-center justify-center p-3 text-lg font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition duration-150 shadow-md"
                    >
                        <StopCircle className="w-5 h-5 mr-3" /> Meeting Finished
                    </button>
                    <div className="p-3 bg-gray-50 border border-gray-200 text-sm rounded-lg text-gray-700 h-24 overflow-y-auto whitespace-pre-wrap">
                        {currentTranscript}
                    </div>
                </div>
            )}

            {appState === 'processing' && (
                <div className="flex flex-col items-center justify-center p-6 space-y-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-indigo-600 font-medium">Processing Audio (Kyutai STT Simulation)...</p>
                    <p className="text-sm text-gray-500">Generating transcript and actionable notes.</p>
                </div>
            )}
        </div>
    );

    const ChatInterface = () => (
        <div className="flex flex-col h-full bg-white shadow-xl rounded-xl overflow-hidden">
            <div className="p-4 bg-indigo-600 text-white flex items-center shadow-lg">
                <MessageSquare className="w-6 h-6 mr-3" />
                <h2 className="text-xl font-bold">Query Meeting Notes</h2>
            </div>

            {meetings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-gray-500">
                    <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
                    <p className="font-semibold">No Notes Available</p>
                    <p className="text-sm">Record a meeting first to enable the chat feature.</p>
                </div>
            ) : (
                <>
                    {/* Chat History Area */}
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                        <div className="flex items-start">
                            <Zap className="w-6 h-6 text-indigo-500 flex-shrink-0 mr-3" />
                            <div className="bg-gray-100 p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm text-sm">
                                Hello! I have access to {meetings.length} meeting transcripts. Ask me anything about the content, like "What were John's action items?"
                            </div>
                        </div>

                        {chatHistory.map((message, index) => (
                            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-md ${
                                    message.role === 'user'
                                        ? 'bg-indigo-500 text-white rounded-br-none'
                                        : 'bg-gray-100 text-gray-800 rounded-bl-none'
                                }`}>
                                    {message.text}
                                </div>
                            </div>
                        ))}

                        {isQuerying && (
                            <div className="flex items-start">
                                <Zap className="w-6 h-6 text-indigo-500 flex-shrink-0 mr-3 animate-pulse" />
                                <div className="bg-gray-100 p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm text-sm">
                                    <Loader2 className="w-4 h-4 inline-block animate-spin mr-2" /> Analyzing notes...
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chat Input */}
                    <form onSubmit={handleQuery} className="p-4 border-t border-gray-200">
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                value={queryInput}
                                onChange={(e) => setQueryInput(e.target.value)}
                                placeholder="Query your meeting notes..."
                                disabled={isQuerying}
                                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                            />
                            <button
                                type="submit"
                                disabled={isQuerying || !queryInput.trim()}
                                className={`p-3 rounded-lg text-white transition duration-150 shadow-md ${
                                    isQuerying || !queryInput.trim()
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </form>
                </>
            )}
        </div>
    );

    const MeetingList = () => {
        return (
            <div className="p-4 bg-white shadow-xl rounded-xl overflow-y-auto max-h-[400px]">
                <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                    <BookOpen className="w-5 h-5 mr-2 text-indigo-500" /> Stored Meeting Notes ({meetings.length})
                </h2>
                <div className="space-y-2">
                    {meetings.length === 0 ? (
                        <p className="text-gray-500 italic">No meetings have been recorded yet.</p>
                    ) : (
                        meetings.map((meeting) => (
                            <div key={meeting.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm transition duration-150">
                                <p className="font-bold text-indigo-600 truncate">{meeting.title}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {meeting.timestamp ? meeting.timestamp.toLocaleString() : 'Saving...'}
                                </p>
                                <details className="mt-2">
                                    <summary className="cursor-pointer text-indigo-500 hover:text-indigo-700 text-xs font-medium">
                                        View Transcript ({meeting.transcript?.length ?? 0} chars)
                                    </summary>
                                    <pre className="mt-1 p-2 bg-white border border-dashed border-gray-300 rounded-md whitespace-pre-wrap text-xs text-gray-700">
                                        {meeting.transcript}
                                    </pre>
                                </details>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            <style jsx>{`
                .font-sans {
                    font-family: 'Inter', sans-serif;
                }
                .max-h-chat {
                    max-height: calc(100vh - 8rem); /* Adjust based on padding */
                }
            `}</style>
            <div className="max-w-7xl mx-auto space-y-8">
                <h1 className="text-4xl font-extrabold text-gray-900 text-center">
                    TeamTalk: AI Meeting Assistant
                </h1>
                <p className="text-center text-lg text-gray-600">
                    Record, Transcribe (Simulated STT), Store, and Query your meeting notes instantly.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Column 1: Meeting Controls */}
                    <div className="lg:col-span-1 space-y-8">
                        <MeetingControlPanel />
                        <MeetingList />
                        <p className="text-xs text-center text-gray-400">
                            User ID: <span className="font-mono">001</span>
                        </p>
                    </div>

                    {/* Column 2/3: Chat Interface */}
                    <div className="lg:col-span-2 h-full min-h-[600px] max-h-chat">
                        <ChatInterface />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;