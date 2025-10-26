
export interface Meeting {
    id: string;
    title: string;
    participants: string[];
    transcript: string;
    start_time?: Date | string | null;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
}
