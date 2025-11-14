"use client";
import useWebSocket, { ReadyState } from "react-use-websocket";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Mic, StopCircle, MessageSquare, Send, Zap, Trash2, BookOpen } from 'lucide-react';
import { useAudioProcessor as useAudioProcessor } from "./useAudioProcessor";
import { base64DecodeOpus, base64EncodeOpus } from "./audioUtil";
import { useMicrophoneAccess } from "./useMicrophoneAccess";
import { useBackendServerUrl } from "./useBackendServerUrl";
import { Meeting, ChatMessage } from './types';
import MeetingControlPanel from './MeetingControlPanel';
import ChatInterface from './chatInterface';
// --- API Configuration ---
// NOTE: apiKey is intentionally left blank; the Canvas environment provides it at runtime.
const apiKey = "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;



const App = () => {
    //app state
    const [appState, setAppState] = useState('ready'); // 'ready', 'recording', 'processing', 'chatting'
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [currentMeeting, setCurrentMeeting] = useState<Meeting>(() => ({id: crypto.randomUUID(),
    title: '',
    participants: [],
    transcript: '',
    start_time: new Date(),}));
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [meetingTitle, setMeetingTitle] = useState('');

    //chat state
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [rawChatHistory, setRawChatHistory] = useState<ChatMessage[]>([]);
    const [queryInput, setQueryInput] = useState('');
    const [isQuerying, setIsQuerying] = useState(false);
    const [webSocketUrl, setWebSocketUrl] = useState<string | null>(null);
    const bottomOfChatRef = useRef<HTMLDivElement | null>(null);




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
        true//shouldConnect
    );
    const onOpusRecorded = useCallback(
        (opus: Uint8Array) => {
        sendMessage(
            JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64EncodeOpus(opus),
            })
        );
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

    const onUserQuery = useCallback(
        (query: string) => {
        sendMessage(
            JSON.stringify({
            type: "input_chat.query",
            query: query,
            })
        );
        console.log("Sent user query:", query);
        console.log("should connect:", shouldConnect);
        console.log("WebSocket ready state:", readyState);
        },
        [sendMessage]
    );

    const { setupAudio, shutdownAudio, audioProcessor } =
        useAudioProcessor(onOpusRecorded);
    
    const onConnectButtonPress = async () => {
        if (!currentMeeting.title || currentMeeting.participants.length === 0) {
            alert("Please enter a meeting title and at least one participant.");
            return;
        }
        // If we're not connected yet
        if (!shouldConnect) {
        const mediaStream = await askMicrophoneAccess();
        // If we have access to the microphone:
        if (mediaStream) {
            const meetingWithStartTime = {
                ...currentMeeting,
                start_time: new Date(),
            };
            setCurrentMeeting(meetingWithStartTime);
            sendMessage(
                JSON.stringify({
                type: "input_audio_buffer.start",
                meeting: meetingWithStartTime,
                })
            );
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


    useEffect(() => {
        if (lastMessage !== null) {
            const messageData = JSON.parse(lastMessage.data);
            
            console.log("Received message:", messageData);
            if (messageData.type === "response.text.delta") {
                const deltaText = messageData.delta;
                setChatHistory((prev: ChatMessage[]) : ChatMessage[] =>{
                    if (prev.length === 0 || prev[prev.length - 1].role !== 'assistant') {
                        return [...prev, { role: 'assistant', text: deltaText }];
                    }
                    else {
                        // const updated = [...prev];
                        // updated[updated.length - 1].text += deltaText;
                        // return updated
                        return [
                            ...prev.slice(0, -1),
                            { 
                                ...prev[prev.length - 1], // create a new object
                                text: prev[prev.length - 1].text + deltaText 
                            }
                        ];
                    }
                ;
                })
                if (bottomOfChatRef.current) {
                    bottomOfChatRef.current.scrollIntoView({ behavior: 'smooth' });
                }
                    }
            
            else if (messageData.type === "response.text.done") {
                setIsQuerying(false);
            }
            }
        
        }, [lastMessage]);

  


    const handleQuery = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!queryInput.trim() || isQuerying ) return;
        
        const userQuery = queryInput.trim();
        setQueryInput('');
        setIsQuerying(true);

        // Add user query to chat history
        setChatHistory(prev => [...prev, { role: 'user', text: userQuery }]);

        //let responseText = "Sorry, an error occurred while fetching the answer.";

        try {
            onUserQuery(queryInput);
            setQueryInput("");
        } finally {
            
        }
    };


    

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
                                    {meeting.start_time ? meeting.start_time.toLocaleString() : 'Saving...'}
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
                        <MeetingControlPanel
                        appState={appState}
                        currentMeeting={currentMeeting}
                        setCurrentMeeting={setCurrentMeeting}
                        onConnectButtonPress={onConnectButtonPress}
                        finishMeeting={finishMeeting}
                        currentTranscript={currentTranscript}
                        />
                        <MeetingList />
                        <p className="text-xs text-center text-gray-400">
                            User ID: <span className="font-mono">001</span>
                        </p>
                    </div>

                    {/* Column 2/3: Chat Interface */}
                    <div className="lg:col-span-2 h-full min-h-[600px] max-h-chat">
                        <ChatInterface 
                        chatHistory={chatHistory}
                        meetings={meetings}
                        isQuerying={isQuerying}
                        handleQuery={handleQuery}
                        queryInput={queryInput}
                        setQueryInput={setQueryInput}
                        bottomOfChatRef={bottomOfChatRef}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;