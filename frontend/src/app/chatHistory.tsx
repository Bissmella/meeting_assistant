import { ChatMessage } from "./types";

export const compressChatHistory = (chatHistory: ChatMessage[]): ChatMessage[] => {
    const compressedHistory: ChatMessage[] = [];

    for (const message of chatHistory) {
        if (compressChatHistory.length > 0 && message.role == compressedHistory[compressedHistory.length - 1].role ) {
            // Merge with the last message
            compressedHistory[compressedHistory.length - 1].text += `${message.text}`;
        } 
        else {
            compressedHistory.push({ ...message });
        }
    }
    return compressedHistory;
}