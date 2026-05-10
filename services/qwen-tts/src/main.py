from __future__ import annotations

import base64
import math
import os
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from audio_codec import pcm16_bytes_to_mulaw_b64

app = FastAPI(title="qwen-tts")


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    speaker: str = "ryan"
    instruct: str = ""
    sample_rate: int = 8000
    format: Literal["mulaw"] = "mulaw"


class SynthesizeResponse(BaseModel):
    provider: str
    speaker: str
    sample_rate: int
    audio_mulaw_b64: str
    synthesis_mode: str


def _pcm16_to_mulaw_b64(pcm16: bytes) -> str:
    return pcm16_bytes_to_mulaw_b64(pcm16)


def _tone_fallback_pcm16(text: str, sample_rate: int = 8000) -> bytes:
    words = text.split() or ["..."]
    pcm = bytearray()
    for idx, _ in enumerate(words):
        freq = 260.0 + ((idx % 5) * 35.0)
        duration_ms = 90
        total = int(sample_rate * duration_ms / 1000)
        for i in range(total):
            v = int(8000 * math.sin(2.0 * math.pi * freq * (i / sample_rate)))
            pcm.extend(int(v).to_bytes(2, byteorder="little", signed=True))
        pcm.extend(b"\x00\x00" * int(sample_rate * 0.03))
    return bytes(pcm)


class _Runtime:
    def __init__(self) -> None:
        self.model = None
        self.error: str | None = None

    def load(self) -> None:
        if self.model is not None or self.error is not None:
            return
        try:
            import torch
            from qwen_tts import Qwen3TTSModel
            local_only = os.getenv("QWEN_TTS_LOCAL_ONLY", "true").lower() == "true"
            model_ref = os.getenv("QWEN_TTS_MODEL", "").strip()
            if not model_ref:
                raise RuntimeError("QWEN_TTS_MODEL is required and must point to a local model path")
            if local_only and not os.path.isdir(model_ref):
                raise RuntimeError(f"QWEN_TTS_MODEL must be a local directory when QWEN_TTS_LOCAL_ONLY=true: {model_ref}")
            dtype_name = os.getenv("QWEN_TTS_DTYPE", "bfloat16").lower()
            dtype = torch.bfloat16 if dtype_name == "bfloat16" else torch.float16
            self.model = Qwen3TTSModel.from_pretrained(
                model_ref,
                device_map=os.getenv("QWEN_TTS_DEVICE", "cuda:0"),
                dtype=dtype,
                local_files_only=local_only,
            )
        except Exception as exc:
            self.error = str(exc)

    def status(self) -> tuple[bool, str]:
        self.load()
        if self.model is not None:
            return True, "qwen_neural_ready"
        return False, self.error or "qwen_unavailable"

    def synthesize(self, text: str, speaker: str, sample_rate: int, instruct: str) -> tuple[bytes, str]:
        self.load()
        if self.model is None:
            raise RuntimeError(f"qwen_neural_unavailable: {self.error or 'unknown_error'}")
        try:
            wavs, sr = self.model.generate_custom_voice(
                text=text,
                language="English",
                speaker=speaker or os.getenv("QWEN_TTS_SPEAKER", "ryan"),
                instruct=instruct,
            )
        except TypeError:
            # Some qwen-tts builds may not expose "instruct".
            wavs, sr = self.model.generate_custom_voice(
                text=text,
                language="English",
                speaker=speaker or os.getenv("QWEN_TTS_SPEAKER", "ryan"),
            )
        raw_audio = np.asarray(wavs[0])
        if np.issubdtype(raw_audio.dtype, np.integer):
            # Model may emit int16 PCM; normalize to [-1, 1].
            max_abs = max(abs(np.iinfo(raw_audio.dtype).min), np.iinfo(raw_audio.dtype).max)
            audio = raw_audio.astype(np.float32) / float(max_abs)
        else:
            audio = raw_audio.astype(np.float32)
            # Some backends emit float PCM not strictly normalized.
            peak = float(np.max(np.abs(audio))) if audio.size else 0.0
            if peak > 1.0:
                audio = audio / peak
        if sr != sample_rate:
            x_old = np.linspace(0.0, 1.0, num=audio.shape[0], endpoint=False)
            target_len = max(1, int(audio.shape[0] * sample_rate / sr))
            x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
            audio = np.interp(x_new, x_old, audio).astype(np.float32)
        audio = np.clip(audio, -1.0, 1.0)
        pcm16 = (audio * 32767.0).astype(np.int16).tobytes()
        return pcm16, "qwen_neural"


runtime = _Runtime()


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    ready, mode = runtime.status()
    return {"status": "ok", "service": "qwen-tts", "neural_ready": "true" if ready else "false", "mode": mode}


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(payload: SynthesizeRequest) -> SynthesizeResponse:
    sample_rate = payload.sample_rate if payload.sample_rate > 0 else 8000
    pcm16, mode = runtime.synthesize(payload.text, payload.speaker, sample_rate, payload.instruct)
    if not pcm16:
        raise HTTPException(status_code=500, detail="qwen_empty_audio")
    return SynthesizeResponse(
        provider="qwen-tts",
        speaker=payload.speaker,
        sample_rate=sample_rate,
        audio_mulaw_b64=_pcm16_to_mulaw_b64(pcm16),
        synthesis_mode=mode,
    )
