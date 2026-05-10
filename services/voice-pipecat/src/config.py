import os
import json


def _default_mock_assistant_turns() -> list[str]:
    return [
        "Thank you for sharing that. I can help with scheduling, transportation requests, and general front desk questions.",
        "I heard you. Could you please confirm your preferred appointment date and time?",
        "Understood. I will note that request and prepare the next step for staff follow-up.",
    ]


def _load_mock_assistant_turns() -> list[str]:
    raw = os.getenv("MOCK_ASSISTANT_TURNS_JSON", "").strip()
    if not raw:
        return _default_mock_assistant_turns()
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            turns = [str(x).strip() for x in data if str(x).strip()]
            if turns:
                return turns
    except Exception:
        pass
    return _default_mock_assistant_turns()


class Settings:
    host: str = os.getenv("VOICE_PIPECAT_HOST", "0.0.0.0")
    port: int = int(os.getenv("VOICE_PIPECAT_PORT", "7000"))
    backend_api_base_url: str = os.getenv("BACKEND_API_BASE_URL", "http://backend-api:3000")
    simulation_enabled: bool = os.getenv("SIMULATION_ENABLED", "true").lower() == "true"

    # ------------------------------------------------------------------
    # TTS
    # ------------------------------------------------------------------
    tts_provider: str = os.getenv("TTS_PROVIDER", "qwen")
    # Kokoro (fallback / alternative)
    kokoro_base_url: str = os.getenv("KOKORO_BASE_URL", "http://kokoro-tts:7100")
    kokoro_voice: str = os.getenv("KOKORO_VOICE", "am_michael")
    # Qwen TTS (primary open-source local TTS)
    qwen_tts_base_url: str = os.getenv("QWEN_TTS_BASE_URL", "http://qwen-tts:7200")
    qwen_tts_speaker: str = os.getenv("QWEN_TTS_SPEAKER", "ryan")
    qwen_tts_default_instruct: str = os.getenv(
        "QWEN_TTS_DEFAULT_INSTRUCT",
        "Read exactly the provided text. Do not add, omit, or change words.",
    )

    # ------------------------------------------------------------------
    # LLM (vLLM OpenAI-compatible endpoint)
    # ------------------------------------------------------------------
    qwen_vllm_base_url: str = os.getenv("QWEN_VLLM_BASE_URL", "http://qwen-vllm:8000")
    qwen_vllm_model: str = os.getenv("QWEN_VLLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")

    # ------------------------------------------------------------------
    # Greeting
    # ------------------------------------------------------------------
    greeting_assistant_text: str = os.getenv(
        "GREETING_ASSISTANT_TEXT",
        "Thank you for calling VoxaFlow. Please hold while I connect you.",
    )
    interstitial_assistant_text: str = os.getenv(
        "INTERSTITIAL_ASSISTANT_TEXT",
        "One moment please.",
    )
    default_caller_text: str = os.getenv("DEFAULT_CALLER_TEXT", "I need help scheduling a ride.")

    # ------------------------------------------------------------------
    # Mock / simulation
    # ------------------------------------------------------------------
    send_first_assistant_turn: bool = os.getenv("SEND_FIRST_ASSISTANT_TURN", "false").lower() == "true"
    mock_conversation_enabled: bool = os.getenv("MOCK_CONVERSATION_ENABLED", "false").lower() == "true"
    mock_caller_media_events_per_turn: int = int(os.getenv("MOCK_CALLER_MEDIA_EVENTS_PER_TURN", "80"))
    mock_assistant_min_turn_gap_seconds: float = float(os.getenv("MOCK_ASSISTANT_MIN_TURN_GAP_SECONDS", "2.5"))
    send_interstitial_before_llm: bool = os.getenv("SEND_INTERSTITIAL_BEFORE_LLM", "true").lower() == "true"
    mock_assistant_turns: list[str] = _load_mock_assistant_turns()

    # ------------------------------------------------------------------
    # STT (whisper-stt microservice — faster-whisper)
    # ------------------------------------------------------------------
    whisper_stt_base_url: str = os.getenv("WHISPER_STT_BASE_URL", "http://whisper-stt:7300")
    stt_enabled: bool = os.getenv("STT_ENABLED", "true").lower() == "true"
    stt_timeout_seconds: float = float(os.getenv("STT_TIMEOUT_SECONDS", "15.0"))

    # ------------------------------------------------------------------
    # VAD (Silero, runs in-process inside voice-pipecat on CPU)
    # ------------------------------------------------------------------
    vad_speech_threshold: float = float(os.getenv("VAD_SPEECH_THRESHOLD", "0.5"))
    # How long caller must be silent before we consider utterance done (ms)
    vad_silence_threshold_ms: int = int(os.getenv("VAD_SILENCE_THRESHOLD_MS", "450"))
    # Audio captured before speech onset to avoid clipping first phoneme (ms)
    vad_pre_roll_ms: int = int(os.getenv("VAD_PRE_ROLL_MS", "200"))

    # ------------------------------------------------------------------
    # LLM tuning
    # ------------------------------------------------------------------
    system_prompt: str = os.getenv(
        "SYSTEM_PROMPT",
        (
            "You are a helpful voice assistant on a phone call. "
            "Be concise, clear, and natural. Ask one follow-up question at a time. "
            "Reply in the same language the caller used."
        ),
    )
    llm_max_tokens: int = int(os.getenv("LLM_MAX_TOKENS", "48"))
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.2"))
    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "10.0"))
    llm_tts_soft_flush_chars: int = int(os.getenv("LLM_TTS_SOFT_FLUSH_CHARS", "48"))
    llm_tts_hard_flush_chars: int = int(os.getenv("LLM_TTS_HARD_FLUSH_CHARS", "80"))


settings = Settings()
