
export interface Meeting {
    id: string;
    title: string;
    transcript: string;
    timestamp?: Date | string | null;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
}