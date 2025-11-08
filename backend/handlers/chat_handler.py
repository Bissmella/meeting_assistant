from backend.utils.chatbot import Chatbot

class ChatHandler:
    def __init__(self, LLMService, meeting_memory, recorder):
        self.llm = LLMService()
        self.meeting_memory = meeting_memory
        self.recorder = recorder
        self.chatbot = Chatbot()

    async def handle_query(self, query: str):
        """Handle a user chat query"""
        llm = self.llm
        context_chunks = self.meeting_memory.query(query, k=3)
        if not context_chunks:
            context_chunks = []
        context = "\n\n".join(
            f"Meeting on {r['metadata']['datetime']} titled '{r['metadata']['title']}':\n{r['content']}"
            for r in context_chunks
        )
        last_meeting_context = self.recorder.last_meeting
        if isinstance(last_meeting_context, str):
            context = f"No previous meetings recorded.\n\n{context}"

        await self.generate_response()
        return
    
    async def generate_response(self):
        """Generate a response from the chatbot using the LLM service."""
        llm = self.llm
        messages = self.chatbot.prerocessed()
        async for data in llm(messages):
            self.output_queue.put(data)

            self.chatbot.add_chat_message_delta(role, delta)