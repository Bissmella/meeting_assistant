import asyncio
from openai import AsyncOpenAI, OpenAI
from typing import Any, cast
class LLMService:
    def __init__(self, client:AsyncOpenAI, api: str):
        client_sync = OpenAI(api_key="EMPTY", base_url=api)
        models = client_sync.models.list()
        if len(models.data) != 1:
            raise ValueError(f"No models or more than one model found at LLM API endpoint: {api}")
        self.model = models.data[0].id
        self.client = client
    

    async def stream_response(self, messages):
        """Async generator that yields response chunks from the LLM."""
        payload = {
            "messages": messages,}
        stream = self.client.chat.completions.stream(
            model=self.model,
            messages=cast(Any, messages),
            stream=True,
        )
        async with stream:
            async for chunk in stream:
                chunk_content = chunk.choices[0].delta.get("content", "")
                yield chunk_content
        
