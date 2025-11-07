from typing import Any, Literal
from backend.utils.system_prompts import ConstantInstructions


ConversationState = Literal["waiting_for_user", "user_speaking", "bot_speaking"]

class Chatbot():
    def __init__(self, ):
        self.chat_history: list[dict[Any, Any]]  = [
            {"role": "system", "content": ConstantInstructions().make_system_prompt()}
        ]

    
    async def add_chat_message_delta(self, role: Literal["user", "assistant"], delta: str, generating_message_i: int|None):
        """Add a delta message to the chat history."""
        if generating_message_i is not None and generating_message_i > len(self.chat_history):
            #TODO logging
            return False
        if self.chat_history[-1]["role"] != role:
            # New message
            self.chat_history.append({"role": role, "content": delta})
        else:
            last_message = self.chat_history[-1]
            needs_right_space = last_message != "" and not last_message["content"].endswith(" ")
            needs_left_space = delta != "" and not delta.startswith(" ")
            if needs_right_space and needs_left_space:
                last_message["content"] += " " + delta
            else:
                last_message["content"] += delta
        return True

    