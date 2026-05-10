from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from backend_client import BackendClient
from config import settings
from simulation import build_event_payload, build_simulated_transcript
from stt_client import STTClient
from tts_provider import build_tts_provider
from vad import AudioBuffer

app = FastAPI(title="voice-pipecat", version="0.2.0")
logger = logging.getLogger("voice-pipecat")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

backend_client = BackendClient(settings.backend_api_base_url)
stt_client = STTClient(settings.whisper_stt_base_url, timeout_seconds=settings.stt_timeout_seconds)
tts_provider = build_tts_provider(
    provider=settings.tts_provider,
    kokoro_url=settings.kokoro_base_url,
    kokoro_voice=settings.kokoro_voice,
    qwen_url=settings.qwen_tts_base_url,
    qwen_speaker=settings.qwen_tts_speaker,
)

metrics = {
    "requests_total": 0,
    "simulate_call_total": 0,
    "auth_denied_total": 0,
    "rate_limited_total": 0,
    "ws_connections_total": 0,
    "ws_media_in_total": 0,
    "ws_media_out_total": 0,
    "stt_calls_total": 0,
    "llm_calls_total": 0,
    "tts_calls_total": 0,
}
rate_limit_window = timedelta(seconds=60)
rate_limit_max = 30
rate_limit_buckets: dict[str, list[datetime]] = defaultdict(list)

# ---------------------------------------------------------------------------
# Auth / rate limiting helpers
# ---------------------------------------------------------------------------
def _auth_token() -> str:
    return os.getenv("PIPECAT_INGRESS_TOKEN", "")

def _extract_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"

def _enforce_simulate_rate_limit(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    bucket = rate_limit_buckets[client_ip]
    cutoff = now - rate_limit_window
    bucket[:] = [item for item in bucket if item > cutoff]
    if len(bucket) >= rate_limit_max:
        metrics["rate_limited_total"] += 1
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")
    bucket.append(now)

# ---------------------------------------------------------------------------
# Send audio frames to Twilio WebSocket
# ---------------------------------------------------------------------------
async def _send_audio_frames(
    websocket: WebSocket,
    frames: list[str],
    stream_sid: str,
) -> None:
    for payload in frames:
        await websocket.send_json(
            {
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": payload},
            }
        )
        metrics["ws_media_out_total"] += 1
        # Pace at real-time: Twilio expects 20 ms µ-law frames.
        await asyncio.sleep(0.02)

# ---------------------------------------------------------------------------
# LLM streaming helper — yields sentence-boundary chunks for low TTFB TTS
# ---------------------------------------------------------------------------
_SENTENCE_ENDS = frozenset(".!?")


def _select_mock_assistant_turn(conversation_history: list[dict[str, Any]]) -> str:
    turns = settings.mock_assistant_turns or [
        "I can help you, but our full AI system is temporarily reconnecting. Please tell me your name and the reason for your call.",
    ]
    assistant_turns_seen = sum(1 for turn in conversation_history if turn.get("role") == "assistant")
    return turns[min(assistant_turns_seen, len(turns) - 1)]

async def _stream_llm_response(
    conversation_history: list[dict[str, Any]],
) -> str:
    """
    Stream text from vLLM and yield completed sentence chunks via a queue.
    Returns the full accumulated response text.
    """
    system_prompt = (
        "You are a professional front-desk phone assistant. "
        "Be concise, clear, and helpful. Ask one follow-up question at a time. "
        "Keep replies under two sentences. Reply in the same language the caller used."
    )
    payload = {
        "model": settings.qwen_vllm_model,
        "messages": [{"role": "system", "content": system_prompt}] + conversation_history[-6:],
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
        "stream": True,
    }
    base_url = settings.qwen_vllm_base_url.rstrip("/")
    full_text = ""
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            async with client.stream("POST", f"{base_url}/v1/chat/completions", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[len("data: "):].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content") or ""
                        if token:
                            full_text += token
                    except Exception as e:
                        logger.debug("SSE parse skip: %s", e)
    except Exception as exc:
        logger.error("LLM stream error: %s", exc)
    return full_text.strip()


async def _llm_and_tts(
    conversation_history: list[dict[str, Any]],
    websocket: WebSocket,
    stream_sid: str,
) -> str:
    """
    Run LLM (text streaming) → sentence-chunked TTS → Twilio audio out.
    Returns the full assistant text.
    """
    system_prompt = (
        "You are a professional front-desk phone assistant. "
        "Be concise, clear, and helpful. Ask one follow-up question at a time. "
        "Keep replies under two sentences. Reply in the same language the caller used."
    )
    payload = {
        "model": settings.qwen_vllm_model,
        "messages": [{"role": "system", "content": system_prompt}] + conversation_history[-6:],
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
        "stream": True,
    }
    base_url = settings.qwen_vllm_base_url.rstrip("/")

    full_text = ""
    pending = ""
    t_start = time.monotonic()
    ttft_ms = 0
    metrics["llm_calls_total"] += 1

    async def _flush_sentence(sentence: str) -> None:
        nonlocal ttft_ms
        sentence = sentence.strip()
        if not sentence:
            return
        if ttft_ms == 0:
            ttft_ms = int((time.monotonic() - t_start) * 1000)
            logger.info("LLM TTFT: %d ms", ttft_ms)
        try:
            metrics["tts_calls_total"] += 1
            frames = await tts_provider.synthesize_mulaw_frames(sentence)
            await _send_audio_frames(websocket, frames, stream_sid)
        except Exception as exc:
            logger.error("TTS error for %r: %s", sentence[:40], exc)

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds + 30) as client:
            async with client.stream("POST", f"{base_url}/v1/chat/completions", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[len("data: "):].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content") or ""
                        if not token:
                            continue
                        full_text += token
                        pending += token
                        # Flush at sentence boundaries for low-latency TTS starts
                        if any(c in _SENTENCE_ENDS for c in token):
                            await _flush_sentence(pending)
                            pending = ""
                    except Exception as e:
                        logger.debug("SSE parse skip: %s", e)
    except Exception as exc:
        logger.error("LLM stream error: %s", exc)

    # Flush any trailing text that didn't end with punctuation
    if pending.strip():
        await _flush_sentence(pending)

    total_ms = int((time.monotonic() - t_start) * 1000)
    logger.info(
        "turn complete: ttft_ms=%d total_ms=%d text=%r",
        ttft_ms, total_ms, full_text[:80],
    )
    return full_text.strip()

# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------
@app.get("/healthz")
async def healthz() -> dict[str, str]:
    metrics["requests_total"] += 1
    return {
        "status": "ok",
        "service": "voice-pipecat",
        "architecture": "modular-asr-llm-tts",
        "stt": "faster-whisper",
        "llm": "vllm-openai",
        "tts": settings.tts_provider,
    }

@app.get("/pipecat/healthz")
async def pipecat_healthz() -> dict[str, str]:
    metrics["requests_total"] += 1
    return await healthz()

@app.get("/metrics")
async def metrics_endpoint() -> str:
    lines = [
        "# HELP voxaflow_pipecat_requests_total Total HTTP requests received.",
        "# TYPE voxaflow_pipecat_requests_total counter",
        f"voxaflow_pipecat_requests_total {metrics['requests_total']}",
        "# HELP voxaflow_pipecat_ws_connections_total Total Twilio WebSocket connections.",
        "# TYPE voxaflow_pipecat_ws_connections_total counter",
        f"voxaflow_pipecat_ws_connections_total {metrics['ws_connections_total']}",
        "# HELP voxaflow_pipecat_ws_media_in_total Total inbound media events from Twilio.",
        "# TYPE voxaflow_pipecat_ws_media_in_total counter",
        f"voxaflow_pipecat_ws_media_in_total {metrics['ws_media_in_total']}",
        "# HELP voxaflow_pipecat_ws_media_out_total Total outbound media events sent to Twilio.",
        "# TYPE voxaflow_pipecat_ws_media_out_total counter",
        f"voxaflow_pipecat_ws_media_out_total {metrics['ws_media_out_total']}",
        "# HELP voxaflow_pipecat_stt_calls_total Total STT transcription calls.",
        "# TYPE voxaflow_pipecat_stt_calls_total counter",
        f"voxaflow_pipecat_stt_calls_total {metrics['stt_calls_total']}",
        "# HELP voxaflow_pipecat_llm_calls_total Total LLM inference calls.",
        "# TYPE voxaflow_pipecat_llm_calls_total counter",
        f"voxaflow_pipecat_llm_calls_total {metrics['llm_calls_total']}",
        "# HELP voxaflow_pipecat_tts_calls_total Total TTS synthesis calls.",
        "# TYPE voxaflow_pipecat_tts_calls_total counter",
        f"voxaflow_pipecat_tts_calls_total {metrics['tts_calls_total']}",
    ]
    return "\n".join(lines) + "\n"

# ---------------------------------------------------------------------------
# Twilio WebSocket media stream
# ---------------------------------------------------------------------------
@app.websocket("/twilio-media")
async def twilio_media_stream(websocket: WebSocket) -> None:
    token = _auth_token()
    if token:
        incoming = websocket.headers.get("x-pipecat-token", "")
        if incoming != token:
            metrics["auth_denied_total"] += 1
            await websocket.close(code=1008)
            return

    await websocket.accept()
    logger.info("twilio-media accepted")
    metrics["ws_connections_total"] += 1

    stream_sid = "unknown"
    call_session_id = "unknown"
    call_sid = "unknown"
    greeting_sent = False
    conversation_history: list[dict[str, Any]] = []

    audio_buf = AudioBuffer(
        speech_threshold=settings.vad_speech_threshold,
        silence_threshold_ms=settings.vad_silence_threshold_ms,
        pre_roll_ms=settings.vad_pre_roll_ms,
    )
    assistant_turn_lock = asyncio.Lock()

    async def _handle_utterance(caller_pcm16: bytes) -> None:
        """
        Modular STT → LLM (text) → TTS pipeline.
        """
        nonlocal conversation_history
        metrics["stt_calls_total"] += 1

        # 1. ASR: PCM16 @ 16 kHz → text
        transcript = await stt_client.transcribe(caller_pcm16)
        if not transcript:
            logger.info("STT returned empty — skipping turn")
            return

        logger.info("STT transcript: %r", transcript)
        conversation_history.append({"role": "user", "content": transcript})

        # 2. LLM → 3. TTS (sentence-streamed)
        if settings.mock_conversation_enabled:
            assistant_text = _select_mock_assistant_turn(conversation_history)
            metrics["tts_calls_total"] += 1
            frames = await tts_provider.synthesize_mulaw_frames(assistant_text)
            await _send_audio_frames(websocket, frames, stream_sid)
        else:
            assistant_text = await _llm_and_tts(conversation_history, websocket, stream_sid)
            if not assistant_text:
                logger.warning("LLM returned empty response; using mock assistant fallback")
                assistant_text = _select_mock_assistant_turn(conversation_history)
                metrics["tts_calls_total"] += 1
                frames = await tts_provider.synthesize_mulaw_frames(assistant_text)
                await _send_audio_frames(websocket, frames, stream_sid)
        if assistant_text:
            conversation_history.append({"role": "assistant", "content": assistant_text})

    async def _send_greeting() -> None:
        """Send static greeting text directly to TTS — no LLM call needed."""
        greeting = settings.greeting_assistant_text
        if not greeting:
            return
        try:
            metrics["tts_calls_total"] += 1
            frames = await tts_provider.synthesize_mulaw_frames(greeting)
            await _send_audio_frames(websocket, frames, stream_sid)
            logger.info("Greeting sent: %r", greeting)
        except Exception as exc:
            logger.error("Greeting TTS error: %s", exc)

    try:
        while True:
            packet = await websocket.receive()
            if packet.get("type") == "websocket.disconnect":
                break
            raw_text = packet.get("text")
            if raw_text is None:
                continue
            try:
                message = json.loads(raw_text)
            except json.JSONDecodeError:
                continue

            event_type = str(message.get("event", "unknown"))

            if event_type == "start":
                start = message.get("start", {})
                call_sid = str(start.get("callSid", "unknown"))
                stream_sid = str(start.get("streamSid", "unknown"))
                custom = start.get("customParameters", {})
                if isinstance(custom, dict):
                    call_session_id = str(custom.get("callSessionId", "unknown"))
                logger.info(
                    "twilio-media start streamSid=%s callSid=%s",
                    stream_sid, call_sid,
                )

            elif event_type == "media":
                metrics["ws_media_in_total"] += 1
                media_payload = message.get("media", {}).get("payload", "")

                # Send greeting on the very first media packet
                if not greeting_sent:
                    greeting_sent = True
                    asyncio.create_task(_send_greeting())

                if media_payload:
                    utterance_pcm16 = audio_buf.push_frame(media_payload)
                    if utterance_pcm16 and not assistant_turn_lock.locked():
                        async def _run_turn(pcm: bytes) -> None:
                            async with assistant_turn_lock:
                                await _handle_utterance(pcm)
                        asyncio.create_task(_run_turn(utterance_pcm16))

            elif event_type == "stop":
                logger.info("twilio-media stop streamSid=%s", stream_sid)
                break

    except WebSocketDisconnect:
        logger.info("twilio-media disconnected streamSid=%s", stream_sid)
    except Exception as exc:
        logger.exception("twilio media stream crashed: %s", exc)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
