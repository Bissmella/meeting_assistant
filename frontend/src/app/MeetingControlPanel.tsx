import { Meeting, ChatMessage } from './types';
import { Loader2, Mic, StopCircle, MessageSquare, Send, Zap, Trash2, BookOpen } from 'lucide-react';

const MeetingControlPanel = ({ appState, currentMeeting, setCurrentMeeting, onConnectButtonPress, finishMeeting, currentTranscript }: {
  appState: string;
  currentMeeting: Meeting;
  setCurrentMeeting: React.Dispatch<React.SetStateAction<Meeting>>;
  onConnectButtonPress: () => void;
  finishMeeting: () => void;
  currentTranscript: string;
}) => (
        <div className="p-4 bg-white shadow-xl rounded-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Meeting Controls</h2>
            {appState === 'ready' && (
                <div className="space-y-2">
                <input
                    type="text"
                    placeholder="Meeting Title"
                    value={currentMeeting?.title || ''}
                    onChange={e =>
                        setCurrentMeeting(prev => ({ ...prev, title: e.target.value }))
                    }
                    className="border p-2 rounded w-full"
                />

                <input
                    type="text"
                    placeholder="Participants (comma separated)"
                    value={currentMeeting?.participants.join(', ') || ''}
                    onChange={e =>
                        setCurrentMeeting(prev => prev
                            ? { ...prev, participants: e.target.value.split(',').map(p => p.trim()) }: prev
                            
                        )
                    }
                    className="border p-2 rounded w-full"
                />
                <button
                    onClick={onConnectButtonPress}
                    className="w-full flex items-center justify-center p-3 text-lg font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition duration-150 shadow-md"
                >
                    <Mic className="w-5 h-5 mr-3" /> Attend a New Meeting
                </button>
                </div>
            )}

            {appState === 'recording' && (
                <div className="space-y-3">
                    <p className="text-sm text-center font-medium text-red-600">
                        <span className="animate-pulse inline-block w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                        Recording: **{currentMeeting.title}**
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

export default MeetingControlPanel;