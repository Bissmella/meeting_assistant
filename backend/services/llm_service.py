import asyncio
from openai import AsyncOpenAI, OpenAI
from typing import Any, cast
from backend.utils.utils import get_openai_client
from backend.constants import LLM_SERVER

class LLMService:
    def __init__(self):
        client_sync = OpenAI(api_key="EMPTY", base_url=LLM_SERVER + "v1")

        #TODO wrap with try/except
        models = client_sync.models.list()
        if len(models.data) != 1:
            raise ValueError(f"No models or more than one model found at LLM API endpoint: {LLM_SERVER}")
        self.model = models.data[0].id
        self.client = get_openai_client()
        #self.client = None  # Placeholder since we are not actually connecting
    

    async def stream_response(self, messages, sources: list[dict[str, Any]] | None) -> Any:
        """Async generator that yields response chunks from the LLM."""
        payload = {
            "messages": messages,}
        # stream = self.client.chat.completions.stream(
        #     model=self.model,
        #     messages=cast(Any, messages),
        #     #stream=True,
        #     extra_body={"sources": sources} if sources is not None else {},
        # )
        # async with stream:
        #     async for chunk in stream:
        #         chunk_content = chunk.choices[0].delta.get("content", "")
        #         yield chunk_content

        async with self.client.chat.completions.stream(
            model=self.model,
            messages=cast(Any, messages),
            extra_body={"sources": sources} if sources is not None else {},
        ) as stream:
            async for event in stream:
                if event.type == "message.delta" and event.delta.content:
                    yield event.delta.content
        # ### For testing without an actual LLM server, we simulate a response:
        # simulated_response = "This is a simulated response from the LLM."
        # for char in simulated_response:
        #     await asyncio.sleep(0.01)  # Simulate delay
        #     yield char
        
