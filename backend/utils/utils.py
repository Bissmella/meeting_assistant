from openai import AsyncOpenAI
from backend.constants import LLM_SERVER, LLM_API_KEY
class WebSocketClosedError(Exception):
    """Remote web socket is closed, cannot send or receive data."""

def get_openai_client(
        server_url: str = LLM_SERVER, api_key: str | None = LLM_API_KEY) -> AsyncOpenAI:
    """Create an OpenAI client with the given API key and base URL."""
    return AsyncOpenAI(api_key=api_key or "EMPTY", base_url=server_url + "/v1")