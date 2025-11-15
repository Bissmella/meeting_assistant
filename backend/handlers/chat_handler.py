from backend.models.chatbot import Chatbot
import asyncio
from fastrtc import wait_for_item
import backend.openai_realtime_api_events as ora
from backend.services.llm_service import LLMService


class ChatHandler:
    def __init__(self, meeting_memory, recorder):
        self.llm = LLMService()
        self.meeting_memory = meeting_memory
        self.recorder = recorder
        self.chatbot = Chatbot()
        self.output_queue = asyncio.Queue()

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
        sources = [{'text': r['content'], 'metadata': r['metadata']} for r in context_chunks]
        
        last_meeting_context = self.recorder.last_meeting
        if last_meeting_context is not None:
            sources.append({'text': last_meeting_context, 'metadata': {'info': 'Last recorded meeting'}})
        
        await self.chatbot.add_chat_message_delta("user", query, None)

        await self.generate_response(sources)
        return
    
    async def generate_response(self, sources: list[dict] | None = None):
        """Generate a response from the chatbot using the LLM service."""
        llm = self.llm
        messages = self.chatbot.prerocessed()
        role = "assistant"
        async for data in llm.stream_response(messages, sources):
            await self.output_queue.put(ora.ResponseTextDelta(delta=data))

            await self.chatbot.add_chat_message_delta(role, data)
        await self.output_queue.put(ora.ResponseTextDone(delta=""))
        

    async def emit_responses(self):
        output_queue_item = await wait_for_item(self.output_queue)
        if output_queue_item is not None:
            return output_queue_item
        else:
            return None