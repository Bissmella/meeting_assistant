import {Meeting, ChatMessage} from './types';
import { Loader2,  MessageSquare, Send, Zap } from 'lucide-react';
import ReactMarkdown from "react-markdown";

const ChatInterface = ({chatHistory, meetings, isQuerying, handleQuery, queryInput, setQueryInput, bottomOfChatRef}:
    {
        chatHistory: ChatMessage[];
        meetings: Meeting[];
        isQuerying: boolean;
        handleQuery: (e: React.FormEvent<HTMLFormElement>) => void;
        queryInput: string;
        setQueryInput: React.Dispatch<React.SetStateAction<string>>;
        bottomOfChatRef: React.RefObject<HTMLDivElement | null>;

    }) => (
        <div className="flex flex-col h-full bg-white shadow-xl rounded-xl overflow-hidden">
            <div className="p-4 bg-indigo-600 text-white flex items-center shadow-lg">
                <MessageSquare className="w-6 h-6 mr-3" />
                <h2 className="text-xl font-bold">Query Meeting Notes</h2>
            </div>

            {/* {meetings.length === 0 ? 
            (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-gray-500">
                    <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
                    <p className="font-semibold">No Notes Available</p>
                    <p className="text-sm">Record a meeting first to enable the chat feature.</p>
                </div>
            ) :  */}
            
                <>
                    {/* Chat History Area */}
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                        <div className="flex items-start">
                            <Zap className="w-6 h-6 text-indigo-500 flex-shrink-0 mr-3" />
                            <div className="bg-gray-100 p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm text-sm">
                                Hello! I have access to meeting transcripts. Ask me anything about the content, like "What were John's action items?"
                            </div>
                        </div>

                        {chatHistory.map((message, index) => (
                            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-md ${
                                    message.role === 'user'
                                        ? 'bg-indigo-500 text-white rounded-br-none'
                                        : 'bg-gray-100 text-gray-800 rounded-bl-none'
                                }`}>
                                    <ReactMarkdown>{message.text}</ReactMarkdown>
                                </div>
                            </div>
                        ))}
                        <div ref={bottomOfChatRef} />

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
            
        </div>
    );

export default ChatInterface;