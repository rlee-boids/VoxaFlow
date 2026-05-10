from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class SimulatedTurn:
    speaker: str
    text: str


def build_simulated_transcript(turns: list[str]) -> list[SimulatedTurn]:
    out: list[SimulatedTurn] = []
    speaker = "caller"
    for turn in turns:
        out.append(SimulatedTurn(speaker=speaker, text=turn))
        speaker = "assistant" if speaker == "caller" else "caller"
    return out


def build_event_payload(turn: SimulatedTurn) -> dict[str, Any]:
    return {
        "speaker": turn.speaker,
        "text": turn.text,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
