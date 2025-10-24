
export interface Meeting {
    id: string;
    title: string;
    transcript: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}