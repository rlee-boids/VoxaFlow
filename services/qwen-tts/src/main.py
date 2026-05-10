from __future__ import annotations

import re
from typing import Iterator, Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from audio_codec import pcm16_bytes_to_mulaw_b64

app = FastAPI(title="qwen-tts")


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    speaker: str = "Ryan"
    instruct: str = ""
    sample_rate: int = 8000
    format: Literal["mulaw", "pcm"] = "mulaw"


class SynthesizeResponse(BaseModel):
    provider: str
    speaker: str
    sample_rate: int
    audio_mulaw_b64: str
    synthesis_mode: str


class OpenAISpeechRequest(BaseModel):
    model: str = "tts-1"
    input: str = Field(min_length=1, max_length=4096)
    voice: str = "echo"
    response_format: Literal["pcm", "wav"] = "pcm"
    stream: bool = False
    language: str = "English"
    instruct: str | None = None


_VOICE_MAP = {
    "alloy": "Vivian",
    "echo": "Ryan",
    "fable": "Serena",
    "nova": "Aiden",
    "onyx": "Eric",
    "shimmer": "Dylan",
}


def _env_flag(name: str, default: bool) -> bool:
    import os

    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        raise RuntimeError("qwen_empty_text")
    if cleaned[-1] not in ".!?":
        cleaned += "."
    return cleaned[:500]


def _normalize_instruct(instruct: str) -> str:
    return re.sub(r"\s+", " ", instruct).strip()[:200]


def _normalize_speaker(speaker: str) -> str:
    speaker = (speaker or "").strip()
    if not speaker:
        return "Ryan"
    return _VOICE_MAP.get(speaker.lower(), speaker)


def _resample_float_audio(audio: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    if from_rate == to_rate:
        return audio.astype(np.float32, copy=False)
    if audio.size == 0:
        return np.zeros(0, dtype=np.float32)
    x_old = np.linspace(0.0, 1.0, num=audio.shape[0], endpoint=False)
    target_len = max(1, int(audio.shape[0] * to_rate / from_rate))
    x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


def _float_audio_to_pcm16(audio: np.ndarray) -> bytes:
    if np.issubdtype(audio.dtype, np.integer):
        max_abs = max(abs(np.iinfo(audio.dtype).min), np.iinfo(audio.dtype).max)
        audio = audio.astype(np.float32) / float(max_abs)
    else:
        audio = audio.astype(np.float32, copy=False)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = audio / peak
    audio = np.clip(audio, -1.0, 1.0)
    return (audio * 32767.0).astype(np.int16).tobytes()


def _wav_bytes_from_pcm16(pcm16: bytes, sample_rate: int) -> bytes:
    import io
    import soundfile as sf

    arr = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32) / 32767.0
    buffer = io.BytesIO()
    sf.write(buffer, arr, sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


class _Runtime:
    def __init__(self) -> None:
        self.model = None
        self.error: str | None = None
        self.streaming_ready = False
        self.model_id = ""

    def load(self) -> None:
        if self.model is not None or self.error is not None:
            return

        import os
        import torch
        from qwen_tts import Qwen3TTSModel

        model_ref = os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice").strip()
        local_only = _env_flag("QWEN_TTS_LOCAL_ONLY", False)
        dtype_name = os.getenv("QWEN_TTS_DTYPE", "bfloat16").lower()
        dtype = torch.bfloat16 if dtype_name == "bfloat16" else torch.float16
        device_map = os.getenv("QWEN_TTS_DEVICE", "cuda:0")
        attn_impl = os.getenv("QWEN_TTS_ATTN_IMPL", "sdpa")

        try:
            self.model = Qwen3TTSModel.from_pretrained(
                model_ref,
                device_map=device_map,
                dtype=dtype,
                attn_implementation=attn_impl,
                local_files_only=local_only,
            )
            self.model_id = model_ref
            if hasattr(self.model, "enable_streaming_optimizations"):
                self.model.enable_streaming_optimizations(
                    decode_window_frames=int(os.getenv("QWEN_TTS_DECODE_WINDOW_FRAMES", "80")),
                    use_compile=_env_flag("QWEN_TTS_USE_COMPILE", False),
                    use_cuda_graphs=_env_flag("QWEN_TTS_USE_CUDA_GRAPHS", False),
                    compile_mode=os.getenv("QWEN_TTS_COMPILE_MODE", "reduce-overhead"),
                    use_fast_codebook=_env_flag("QWEN_TTS_USE_FAST_CODEBOOK", False),
                    compile_codebook_predictor=_env_flag("QWEN_TTS_COMPILE_CODEBOOK_PREDICTOR", False),
                )
                self.streaming_ready = hasattr(self.model, "stream_generate_custom_voice")
        except Exception as exc:
            self.error = str(exc)

    def status(self) -> tuple[bool, str]:
        self.load()
        if self.model is not None:
            return True, "qwen_neural_ready"
        return False, self.error or "qwen_unavailable"

    def warmup(self) -> None:
        self.load()
        if self.model is None:
            return
        try:
            list(self.iter_stream_pcm16("Hello.", _normalize_speaker("echo"), 8000, ""))
        except Exception:
            try:
                self.synthesize("Hello.", _normalize_speaker("echo"), 8000, "")
            except Exception:
                pass

    def synthesize(self, text: str, speaker: str, sample_rate: int, instruct: str) -> tuple[bytes, str]:
        self.load()
        if self.model is None:
            raise RuntimeError(f"qwen_neural_unavailable: {self.error or 'unknown_error'}")

        text = _normalize_text(text)
        instruct = _normalize_instruct(instruct)
        try:
            wavs, sr = self.model.generate_custom_voice(
                text=text,
                language="English",
                speaker=speaker,
                instruct=instruct,
            )
        except TypeError:
            wavs, sr = self.model.generate_custom_voice(
                text=text,
                language="English",
                speaker=speaker,
            )

        audio = np.asarray(wavs[0])
        if sr != sample_rate:
            audio = _resample_float_audio(audio.astype(np.float32), sr, sample_rate)
        pcm16 = _float_audio_to_pcm16(audio)
        return pcm16, "qwen_neural"

    def iter_stream_pcm16(self, text: str, speaker: str, sample_rate: int, instruct: str) -> Iterator[bytes]:
        self.load()
        if self.model is None:
            raise RuntimeError(f"qwen_neural_unavailable: {self.error or 'unknown_error'}")

        text = _normalize_text(text)
        instruct = _normalize_instruct(instruct)
        emit_every = int(__import__("os").getenv("QWEN_TTS_EMIT_EVERY_FRAMES", "6"))
        decode_window = int(__import__("os").getenv("QWEN_TTS_DECODE_WINDOW_FRAMES", "80"))
        streaming_supported = hasattr(self.model, "stream_generate_custom_voice")

        if streaming_supported:
            emitted = False
            try:
                for chunk, sr in self.model.stream_generate_custom_voice(
                    text=text,
                    speaker=speaker,
                    language="English",
                    instruct=instruct or None,
                    emit_every_frames=emit_every,
                    decode_window_frames=decode_window,
                ):
                    emitted = True
                    audio = np.asarray(chunk, dtype=np.float32)
                    if sr != sample_rate:
                        audio = _resample_float_audio(audio, sr, sample_rate)
                    pcm16 = _float_audio_to_pcm16(audio)
                    if pcm16:
                        yield pcm16
                if emitted:
                    return
            except TypeError:
                pass

        pcm16, _ = self.synthesize(text, speaker, sample_rate, instruct)
        chunk_bytes = 1600
        for start in range(0, len(pcm16), chunk_bytes):
            yield pcm16[start:start + chunk_bytes]


runtime = _Runtime()


@app.on_event("startup")
async def startup_event() -> None:
    runtime.warmup()


@app.get("/health")
async def health() -> dict[str, str]:
    ready, mode = runtime.status()
    return {
        "status": "ok",
        "service": "qwen-tts",
        "neural_ready": "true" if ready else "false",
        "streaming_ready": "true" if runtime.streaming_ready else "false",
        "mode": mode,
        "model": runtime.model_id or "",
    }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return await health()


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(payload: SynthesizeRequest) -> SynthesizeResponse:
    sample_rate = payload.sample_rate if payload.sample_rate > 0 else 8000
    speaker = _normalize_speaker(payload.speaker)
    pcm16, mode = runtime.synthesize(payload.text, speaker, sample_rate, payload.instruct)
    if not pcm16:
        raise HTTPException(status_code=500, detail="qwen_empty_audio")
    if payload.format != "mulaw":
        raise HTTPException(status_code=400, detail="qwen_invalid_format")
    return SynthesizeResponse(
        provider="qwen-tts",
        speaker=speaker,
        sample_rate=sample_rate,
        audio_mulaw_b64=pcm16_bytes_to_mulaw_b64(pcm16),
        synthesis_mode=mode,
    )


@app.post("/synthesize_stream")
async def synthesize_stream(payload: SynthesizeRequest) -> StreamingResponse:
    sample_rate = payload.sample_rate if payload.sample_rate > 0 else 8000
    speaker = _normalize_speaker(payload.speaker)
    if payload.format != "pcm":
        raise HTTPException(status_code=400, detail="qwen_stream_requires_pcm")

    def iterator() -> Iterator[bytes]:
        yield from runtime.iter_stream_pcm16(payload.text, speaker, sample_rate, payload.instruct)

    return StreamingResponse(iterator(), media_type="application/octet-stream")


@app.post("/v1/audio/speech", response_model=None)
async def openai_speech(payload: OpenAISpeechRequest):
    speaker = _normalize_speaker(payload.voice)
    instruct = payload.instruct or ""
    if payload.response_format == "wav" and payload.stream:
        raise HTTPException(status_code=400, detail="streaming_wav_not_supported")
    if payload.stream:
        def iterator() -> Iterator[bytes]:
            yield from runtime.iter_stream_pcm16(payload.input, speaker, 8000, instruct)

        return StreamingResponse(iterator(), media_type="application/octet-stream")

    pcm16, _ = runtime.synthesize(payload.input, speaker, 8000, instruct)
    if payload.response_format == "wav":
        return Response(content=_wav_bytes_from_pcm16(pcm16, 8000), media_type="audio/wav")
    return Response(content=pcm16, media_type="application/octet-stream")
