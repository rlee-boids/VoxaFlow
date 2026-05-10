from __future__ import annotations

import base64
import math
import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="kokoro-tts")


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice: str = "af_heart"
    sample_rate: int = 8000
    format: Literal["mulaw"] = "mulaw"


class SynthesizeResponse(BaseModel):
    provider: str
    voice: str
    sample_rate: int
    audio_mulaw_b64: str
    synthesis_mode: str


class _KokoroRuntime:
    def __init__(self) -> None:
        self._pipeline = None
        self._error: str | None = None

    def _load(self):
        if self._pipeline is not None or self._error is not None:
            return
        try:
            from kokoro import KPipeline  # type: ignore
        except Exception as exc:
            self._error = f"kokoro_import_failed: {exc}"
            return
        lang_code = os.getenv("KOKORO_LANG_CODE", "a")
        try:
            self._pipeline = KPipeline(lang_code=lang_code)
        except Exception as exc:
            self._error = f"kokoro_pipeline_init_failed: {exc}"

    def status(self) -> tuple[bool, str]:
        self._load()
        if self._pipeline is not None:
            return True, "kokoro_neural_ready"
        return False, self._error or "kokoro_unavailable"

    def synthesize_pcm16(self, text: str, voice: str, sample_rate: int) -> bytes:
        self._load()
        if self._pipeline is None:
            raise RuntimeError(self._error or "kokoro_unavailable")

        import numpy as np  # type: ignore

        speed = float(os.getenv("KOKORO_SPEED", "1.0"))
        segments = self._pipeline(text, voice=voice, speed=speed)
        chunks: list[np.ndarray] = []
        for _, _, audio in segments:
            arr = np.asarray(audio, dtype=np.float32)
            if arr.size:
                chunks.append(arr)
        if not chunks:
            return b""

        audio_24k = np.concatenate(chunks)
        src_rate = 24000
        if sample_rate != src_rate:
            x_old = np.linspace(0.0, 1.0, num=audio_24k.shape[0], endpoint=False)
            target_len = max(1, int(audio_24k.shape[0] * sample_rate / src_rate))
            x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
            audio_resampled = np.interp(x_new, x_old, audio_24k).astype(np.float32)
        else:
            audio_resampled = audio_24k

        audio_clipped = np.clip(audio_resampled, -1.0, 1.0)
        pcm16 = (audio_clipped * 32767.0).astype(np.int16)
        return pcm16.tobytes()


runtime = _KokoroRuntime()


def _linear16_to_mulaw(sample: int) -> int:
    bias = 0x84
    clip = 32635
    seg_end = [0x1F, 0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF]

    sign = 0x80 if sample < 0 else 0x00
    if sample < 0:
        sample = -sample
    if sample > clip:
        sample = clip
    sample = (sample + bias) >> 2

    segment = 0
    while segment < 8 and sample > seg_end[segment]:
        segment += 1
    if segment >= 8:
        return 0x7F ^ sign

    mantissa = (sample >> (segment + 1)) & 0x0F
    return ~(sign | (segment << 4) | mantissa) & 0xFF


def _synthetic_pcm16(text: str, sample_rate: int) -> bytes:
    words = text.split() or ["..."]
    pcm = bytearray()
    for idx, _ in enumerate(words):
        freq = 240.0 + ((idx % 7) * 40.0)
        duration_ms = 95
        total = int(sample_rate * duration_ms / 1000)
        for i in range(total):
            value = int(9500 * math.sin(2.0 * math.pi * freq * (i / sample_rate)))
            pcm.extend(int(value).to_bytes(2, byteorder="little", signed=True))
        pcm.extend(b"\x00\x00" * int(sample_rate * 0.03))
    return bytes(pcm)


def _pcm16_to_mulaw(pcm16: bytes) -> bytes:
    out = bytearray()
    for i in range(0, len(pcm16), 2):
        sample = int.from_bytes(pcm16[i:i + 2], byteorder="little", signed=True)
        out.append(_linear16_to_mulaw(sample))
    return bytes(out)


def _condition_pcm16_for_telephony(pcm16: bytes) -> bytes:
    import numpy as np  # type: ignore
    if not pcm16:
        return pcm16
    audio = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32)
    if audio.size == 0:
        return pcm16
    # Remove DC offset then apply conservative peak normalization for µ-law.
    audio = audio - float(np.mean(audio))
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio = (audio / peak) * (32767.0 * 0.82)
    # Avoid additional filtering here; it can smear consonants over PSTN.
    audio = np.clip(audio, -32768.0, 32767.0).astype(np.int16)
    return audio.tobytes()


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    neural_ready, mode = runtime.status()
    return {
        "status": "ok",
        "service": "kokoro-tts",
        "neural_ready": "true" if neural_ready else "false",
        "mode": mode,
    }


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(payload: SynthesizeRequest) -> SynthesizeResponse:
    sample_rate = payload.sample_rate if payload.sample_rate > 0 else 8000
    voice = payload.voice or os.getenv("KOKORO_VOICE", "af_heart")
    use_neural = os.getenv("KOKORO_USE_NEURAL", "true").lower() == "true"

    synthesis_mode = "fallback_tone"
    if use_neural:
        try:
            pcm16 = runtime.synthesize_pcm16(payload.text, voice=voice, sample_rate=sample_rate)
            synthesis_mode = "kokoro_neural"
        except Exception:
            pcm16 = _synthetic_pcm16(payload.text, sample_rate=sample_rate)
    else:
        pcm16 = _synthetic_pcm16(payload.text, sample_rate=sample_rate)

    pcm16 = _condition_pcm16_for_telephony(pcm16)
    mulaw = _pcm16_to_mulaw(pcm16)
    audio_mulaw_b64 = base64.b64encode(mulaw).decode("ascii")
    return SynthesizeResponse(
        provider=os.getenv("KOKORO_PROVIDER_MODE", "self-hosted-kokoro"),
        voice=voice,
        sample_rate=sample_rate,
        audio_mulaw_b64=audio_mulaw_b64,
        synthesis_mode=synthesis_mode,
    )
