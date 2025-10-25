"use client";
import useWebSocket, { ReadyState } from "react-use-websocket";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Mic, StopCircle, MessageSquare, Send, Zap, Trash2, BookOpen } from 'lucide-react';
import { useAudioProcessor as useAudioProcessor } from "./useAudioProcessor";
import { base64DecodeOpus, base64EncodeOpus } from "./audioUtil";
import { useMicrophoneAccess } from "./useMicrophoneAccess";
import { useBackendServerUrl } from "./useBackendServerUrl";
import { Meeting, ChatMessage } from './types';
// --- API Configuration ---
// NOTE: apiKey is intentionally left blank; the Canvas environment provides it at runtime.
const apiKey = "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;



const App = () => {
    //app state
    const [appState, setAppState] = useState('ready'); // 'ready', 'recording', 'processing', 'chatting'
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [meetingTitle, setMeetingTitle] = useState('');

    //chat state
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [queryInput, setQueryInput] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);
    const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);




    //recording state
    const { microphoneAccess, askMicrophoneAccess } = useMicrophoneAccess();
    const [shouldConnect, setShouldConnect] = useState(false);

    const backendServerUrl = useBackendServerUrl();



    useEffect(() => {
        if (!backendServerUrl) return;

        setWebSocketUrl(backendServerUrl.toString() + "/v1/realtime");
        setAppState('ready');
    }, [backendServerUrl]);

    const { sendMessage, lastMessage, readyState } = useWebSocket(
        webSocketUrl || null,
        {
        protocols: ["realtime"],
        },
        shouldConnect
    );
    const onOpusRecorded = useCallback(
        (opus: Uint8Array) => {
        sendMessage(
            JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64EncodeOpus(opus),
            })
        );
        console.log("Sent Opus chunk of size:", opus.length);
        },
        [sendMessage]
    );

    const onRecordingFinished = useCallback(
        () => {
        sendMessage(
            JSON.stringify({
            type: "input_audio_buffer.finalize",
            })
        );
        },
        []
    )

    const { setupAudio, shutdownAudio, audioProcessor } =
        useAudioProcessor(onOpusRecorded);
    
    const onConnectButtonPress = async () => {
        // If we're not connected yet
        if (!shouldConnect) {
        const mediaStream = await askMicrophoneAccess();
        // If we have access to the microphone:
        if (mediaStream) {
            await setupAudio(mediaStream);
            setShouldConnect(true);
            setAppState('recording');
        }
        } else {
        setShouldConnect(false);
        shutdownAudio();
        }
    };


    const finishMeeting = async () => {
        await shutdownAudio();
        onRecordingFinished();
        setShouldConnect(false);
        setAppState('processing');
        setAppState('ready');
    };

    const handleQuery = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!queryInput.trim() || isQuerying || meetings.length === 0) return;

        const userQuery = queryInput.trim();
        setQueryInput('');
        setIsQuerying(true);

        // Add user query to chat history
        setChatHistory(prev => [...prev, { role: 'user', text: userQuery }]);

        let responseText = "Sorry, an error occurred while fetching the answer.";

        try {
            //send request to backend
            const response = await fetch(backendServerUrl + '/v1/query_meetings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: userQuery,
                }),
            });
            
            if (!response.ok) {
                // Throw an error if the HTTP status is not 2xx
                const errorData = await response.json().catch(() => ({ detail: 'Unknown server error.' }));
                throw new Error(`HTTP Error ${response.status}: ${errorData.detail || 'Failed to query meetings.'}`);
            }
            const data = await response.json();
            responseText = data.answer;
        } catch (error) {
            console.error("Error querying meetings:", error);
        }
        finally {
        // Add assistant response to chat history
        setChatHistory(prev => [...prev, { role: 'assistant', text: responseText }]);
        setIsQuerying(false);
        }
    };


    const MeetingControlPanel = () => (
        <div className="p-4 bg-white shadow-xl rounded-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Meeting Controls</h2>
            {appState === 'ready' && (
                <button
                    onClick={onConnectButtonPress}
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