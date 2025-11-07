
class ChatHandler:
    def __init__(self, LLMService, meeting_memory, recorder):
        self.llm = LLMService()
        self.meeting_memory = meeting_memory
        self.recorder = recorder

    async def handle_query(self, query: str):
        """Handle a user chat query"""
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

        response = await self.llm.get_response(query)
        return response