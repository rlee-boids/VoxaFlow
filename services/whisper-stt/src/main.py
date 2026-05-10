"""
whisper-stt service
-------------------
Accepts raw PCM-16 audio (base64-encoded, 16 kHz mono) and returns a
transcription using faster-whisper.  Voice-pipecat resamples Twilio 8 kHz
µ-law frames to 16 kHz PCM-16 before calling this service.
"""
from __future__ import annotations

import base64
import logging
import os
import tempfile
import threading
import time
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("whisper-stt")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

app = FastAPI(title="whisper-stt", version="0.1.0")

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------
WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")
WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
WHISPER_LANGUAGE: str = os.getenv("WHISPER_LANGUAGE", "en")
WHISPER_BEAM_SIZE: int = int(os.getenv("WHISPER_BEAM_SIZE", "5"))


# ---------------------------------------------------------------------------
# Runtime model loader (singleton, lazy init on first request)
# ---------------------------------------------------------------------------
class _WhisperRuntime:
    def __init__(self) -> None:
        self._model = None
        self._error: str | None = None
        self._lock = threading.Lock()

    def _load(self) -> None:
        """Load the model once, thread-safe."""
        with self._lock:
            if self._model is not None or self._error is not None:
                return
            try:
                from faster_whisper import WhisperModel  # type: ignore
                logger.info(
                    "Loading faster-whisper model=%s device=%s compute_type=%s",
                    WHISPER_MODEL_SIZE,
                    WHISPER_DEVICE,
                    WHISPER_COMPUTE_TYPE,
                )
                self._model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device=WHISPER_DEVICE,
                    compute_type=WHISPER_COMPUTE_TYPE,
                )
                logger.info("faster-whisper model loaded OK")
            except Exception as exc:
                # Fall back to CPU int8 if CUDA is unavailable (dev machines)
                if WHISPER_DEVICE == "cuda":
                    logger.warning(
                        "CUDA load failed (%s); retrying on cpu/int8", exc
                    )
                    try:
                        from faster_whisper import WhisperModel  # type: ignore
                        self._model = WhisperModel(
                            WHISPER_MODEL_SIZE,
                            device="cpu",
                            compute_type="int8",
                        )
                        logger.info("faster-whisper loaded on cpu/int8 (fallback)")
                        return
                    except Exception as cpu_exc:
                        self._error = str(cpu_exc)
                else:
                    self._error = str(exc)
                logger.error("faster-whisper load failed: %s", self._error)

    def is_ready(self) -> bool:
        self._load()
        return self._model is not None

    def transcribe(self, pcm16_bytes: bytes, sample_rate: int = 16000) -> tuple[str, float]:
        """
        Transcribe raw PCM-16 bytes.
        Returns (text, duration_seconds).
        """
        self._load()
        if self._model is None:
            raise RuntimeError(f"whisper_unavailable: {self._error or 'not_loaded'}")

        # Convert PCM-16 bytes → float32 numpy array in [-1, 1]
        audio = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        duration_s = len(audio) / sample_rate

        t0 = time.monotonic()
        segments, _ = self._model.transcribe(
            audio,
            language=WHISPER_LANGUAGE,
            beam_size=WHISPER_BEAM_SIZE,
            vad_filter=False,  # VAD is already handled by voice-pipecat
            condition_on_previous_text=False,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        elapsed = time.monotonic() - t0
        logger.info(
            "transcribed %.2fs audio in %.3fs: %r",
            duration_s,
            elapsed,
            text[:80],
        )
        return text, duration_s


runtime = _WhisperRuntime()


# ---------------------------------------------------------------------------
# API schemas
# ---------------------------------------------------------------------------
class TranscribeRequest(BaseModel):
    # Base64-encoded raw PCM-16 mono audio at sample_rate Hz
    audio_pcm16_b64: str = Field(min_length=1)
    sample_rate: int = Field(default=16000, ge=8000, le=48000)


class TranscribeResponse(BaseModel):
    text: str
    language: Literal["en"] = "en"
    duration_ms: int
    inference_ms: int | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def _startup() -> None:
    # Eagerly trigger model load in a thread so the first request is fast.
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, runtime.is_ready)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    ready = runtime.is_ready()
    return {
        "status": "ok",
        "service": "whisper-stt",
        "model": WHISPER_MODEL_SIZE,
        "device": WHISPER_DEVICE,
        "model_ready": "true" if ready else "false",
    }


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    try:
        pcm16_bytes = base64.b64decode(req.audio_pcm16_b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid_base64: {exc}") from exc

    if len(pcm16_bytes) < 2:
        raise HTTPException(status_code=400, detail="audio_too_short")

    t0 = time.monotonic()
    try:
        text, duration_s = runtime.transcribe(pcm16_bytes, sample_rate=req.sample_rate)
    except Exception as exc:
        logger.error("transcription error: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    inference_ms = int((time.monotonic() - t0) * 1000)
    return TranscribeResponse(
        text=text,
        language="en",
        duration_ms=int(duration_s * 1000),
        inference_ms=inference_ms,
    )
