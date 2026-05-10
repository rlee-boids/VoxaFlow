from simulation import build_event_payload, build_simulated_transcript


def test_build_simulated_transcript_alternates_speakers() -> None:
    turns = build_simulated_transcript(["hello", "hi", "need ride"])
    assert len(turns) == 3
    assert turns[0].speaker == "caller"
    assert turns[1].speaker == "assistant"
    assert turns[2].speaker == "caller"


def test_build_event_payload_has_text_and_speaker() -> None:
    turn = build_simulated_transcript(["hello"])[0]
    payload = build_event_payload(turn)
    assert payload["speaker"] == "caller"
    assert payload["text"] == "hello"
    assert "createdAt" in payload
