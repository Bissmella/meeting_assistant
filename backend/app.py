import json
import time
import os
import asyncio
import base64
import sphn
from pydantic import BaseModel, Field, TypeAdapter, ValidationError, computed_field
from typing import Annotated
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
import requests
import numpy as np
from collections import Counter
import re
import math
from io import BytesIO
import logging
import traceback
from fastapi.websockets import WebSocketState

from backend.handlers.chat_handler import ChatHandler
from backend.utils.utils import WebSocketClosedError
import backend.openai_realtime_api_events as ora
from backend.handlers.main_handler import MeetingHandler
from backend.models.meeting import Meeting
from backend.services.meeting_memory import MeetingMemory

# --- Configuration ---
app = FastAPI()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
STT_API = "https://ungoaded-tashina-trustily.ngrok-free.dev/stt"
# --- In-Memory Database (Simulating a Vector DB) ---
# Stores: { id: str, title: str, transcript: str, timestamp: float, vector: dict }
MEETING_NOTES = []
GLOBAL_VOCABULARY = set()

SAMPLE_RATE = 24000

ClientEventAdapter = TypeAdapter(
    Annotated[ora.ClientEvent, Field(discriminator="type")]
)


@app.on_event("startup")
async def startup_event():
    app.state.meeting_memory = MeetingMemory()


@app.websocket("/v1/realtime")
async def websocket_route(websocket: WebSocket):
    try:
        # The `subprotocol` argument is important because the client specifies what
        # protocol(s) it supports and OpenAI uses "realtime" as the value. If we
        # don't set this, the client will think this is not the right endpoint and
        # will not connect.
        await websocket.accept(subprotocol="realtime")

        handler = MeetingHandler(STT_API, app.state.meeting_memory) #TODO handle to be defined
        chat_handler = ChatHandler(app.state.meeting_memory, handler.recorder)
        async with handler:
            try:
                await _run_route(websocket, handler, chat_handler=chat_handler)
            except Exception as e:
                print("Exception in _run_route():", e)
                traceback.print_exc()
    except Exception as exc:
        print(f"WebSocket connection error: {exc}")
        traceback.print_exc()


async def _run_route(websocket: WebSocket, handler: MeetingHandler, chat_handler: ChatHandler = None):
    logger.info("Starting _run_route")
    emit_queue: asyncio.Queue[ora.ServerEvent] = asyncio.Queue()
    async def consume_emit_queue():
        while True:
            event = await emit_queue.get()
            print("Emit queue event:", event)
            emit_queue.task_done()
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(
                receive_loop(websocket, handler, emit_queue, chat_handler), name="receive_loop()"
            )
            tg.create_task(
                send_loop(websocket, emit_queue, handler, chat_handler), name="emit_queue_consumer"
                )
    except Exception as e:
        import traceback
        print("Exception in _run_route:", e)
        traceback.print_exc()
    


async def receive_loop(
    websocket: WebSocket,
    handler: MeetingHandler,
    emit_queue: asyncio.Queue[ora.ServerEvent],
    chat_handler: ChatHandler = None,
):
    """Receive messages from the WebSocket.

    Can decide to send messages via `emit_queue`.
    """
    opus_reader = sphn.OpusStreamReader(SAMPLE_RATE)
    wait_for_first_opus = True
    while True:
        logger.info("WebSocket connected, entering receive loop")
        try:
            message_raw = await websocket.receive_text()
            print("Received message:", str(message_raw)[:100])
        except WebSocketDisconnect as e:
            logger.info(
                "receive_loop() stopped because WebSocket disconnected: "
                f"{e.code=} {e.reason=}"
            )
            raise WebSocketClosedError() from e
        except RuntimeError as e:
            # This is expected when the client disconnects
            if "WebSocket is not connected" not in str(e):
                raise  # re-raise unexpected errors

            logger.info("receive_loop() stopped because WebSocket disconnected.")
            raise WebSocketClosedError() from e
        
        try:
            message: ora.ClientEvent = ClientEventAdapter.validate_json(message_raw)
        except json.JSONDecodeError as e:
            print("Invalid JSON received:", e)
            await emit_queue.put(
                ora.Error(
                    error=ora.ErrorDetails(
                        type="invalid_request_error",
                        message=f"Invalid JSON: {e}",
                    )
                )
            )
            continue
        except ValidationError as e:
            await emit_queue.put(
                ora.Error(
                    error=ora.ErrorDetails(
                        type="invalid_request_error",
                        message="Invalid message",
                        details=json.loads(e.json()),
                    )
                )
            )
            continue

        message_to_record = message
        
        if isinstance(message, ora.InputAudioBufferAppend):
            opus_bytes = base64.b64decode(message.audio)
            if wait_for_first_opus:
                # Somehow the UI is sending us potentially old messages from a previous
                # connection on reconnect, so that we might get some old OGG packets,
                # waiting for the bit set for first packet to feed to the decoder.
                if opus_bytes[5] & 2:
                    wait_for_first_opus = False
                else:
                    continue
            pcm = await asyncio.to_thread(opus_reader.append_bytes, opus_bytes)

            message_to_record = ora.UnmuteInputAudioBufferAppendAnonymized(
                number_of_samples=pcm.size,
            )

            if pcm.size:
                await handler.receive((SAMPLE_RATE, pcm))
        elif isinstance(message, ora.InputUserChatQuery):
            logger.info("Received chat query:", message.query)
            await chat_handler.handle_query(message.query)
        elif isinstance(message, ora.InputAudioBufferStart):
            print("Starting new meeting recording session")
            handler.meeting = message.meeting

        elif isinstance(message, ora.InputAudioBufferFinalize):
            await handler.finalize_recording()
            print("meeting finished, finalizing")
            await websocket.close(code=1000, reason="Meeting finalized")
            return
        elif isinstance(message, ora.RecordingStopped):
            await handler.finalize_recording()
            await websocket.close(code=1000, reason="Recording stopped")
            break
        elif isinstance(message, ora.SessionUpdate):
            await handler.update_session(message.session)
            await emit_queue.put(ora.SessionUpdated(session=message.session))

        elif isinstance(message, ora.UnmuteAdditionalOutputs):
            # Don't record this: it's a debugging message and can be verbose. Anything
            # important to store should be in the other event types.
            message_to_record = None

        else:
            logger.info("Ignoring message:", str(message)[:100])


async def send_loop(
    websocket: WebSocket,
    emit_queue: asyncio.Queue[ora.ServerEvent],
    handler: MeetingHandler,
    chat_handler: ChatHandler = None,
):
    """Send messages from the emit queue  and handler output queue to the WebSocket."""
    while True:
        if (websocket.client_state == WebSocketState.DISCONNECTED or
            websocket.application_state == WebSocketState.DISCONNECTED):
            logger.info("send_loop() stopping because WebSocket is disconnected.")
            raise WebSocketClosedError()
        emission = None
        try:
            emission = emit_queue.get_nowait()
            
        except asyncio.QueueEmpty:
            try:
                emission = await handler.emit()
            except Exception as e:
                logger.warning("Error in handler.emit():", e)

            if emission is None and chat_handler is not None:
                try:
                    emission = await chat_handler.emit_responses()
                except Exception as e:
                    logger.warning("Error in chat_handler.emit_responses():", e)
            
        try:
            if emission is None:
                await asyncio.sleep(0.1)
                continue
            if isinstance(emission, ora.Error):
                print("Emit queue event:", emission)
            else:
                await websocket.send_text(emission.model_dump_json())
        except (WebSocketDisconnect, RuntimeError) as e:
            if isinstance(e, RuntimeError):
                logger.info("error in send_loop():", e)
            else:
                logger.info(
                    "send_loop() stopped because WebSocket disconnected: "
                    f"{e.code=} {e.reason=}"
                )
            raise WebSocketClosedError() from e
