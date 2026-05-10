from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

logger = logging.getLogger("voice-pipecat.stt_client")


class STTClient:
    """
    HTTP client for the whisper-stt microservice.

    Accepts raw PCM-16 bytes at 16 kHz (already resampled by the VAD layer),
    sends them as base64 to /transcribe, and returns the transcript string.
    """

    def __init__(self, base_url: str, timeout_seconds: float = 20.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def transcribe(self, pcm16_bytes: bytes, sample_rate: int = 16000) -> str:
        """
        Transcribe PCM-16 audio.

        Args:
            pcm16_bytes: raw PCM-16 mono audio at sample_rate Hz.
            sample_rate: sample rate of the audio (default 16000).

        Returns:
            Transcript string (empty string if nothing detected or on error).
        """
        if not pcm16_bytes:
            return ""

        audio_b64 = base64.b64encode(pcm16_bytes).decode("ascii")
        payload: dict[str, Any] = {
            "audio_pcm16_b64": audio_b64,
            "sample_rate": sample_rate,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/transcribe", json=payload)
                response.raise_for_status()
                body = response.json()
            text = str(body.get("text", "")).strip()
            inference_ms = body.get("inference_ms")
            logger.info(
                "stt transcribed: inference_ms=%s text=%r",
                inference_ms,
                text[:80],
            )
            return text
        except httpx.HTTPStatusError as exc:
            logger.error("stt http error %s: %s", exc.response.status_code, exc)
            return ""
        except Exception as exc:
            logger.error("stt client error: %s (%s)", exc, type(exc).__name__)
            return ""

    async def is_healthy(self) -> bool:
        """Return True if whisper-stt is up and model is loaded."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self.base_url}/healthz")
                body = response.json()
            return body.get("model_ready") == "true"
        except Exception:
            return False
