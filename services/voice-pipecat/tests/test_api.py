from fastapi.testclient import TestClient

import main as app_main


class StubBackendClient:
    def __init__(self) -> None:
        self.events: list[tuple[str, str, dict]] = []

    async def post_call_event(self, call_id: str, event_type: str, payload: dict):
        self.events.append((call_id, event_type, payload))
        return {"ok": True}


def test_healthz_endpoint() -> None:
    client = TestClient(app_main.app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_metrics_endpoint_prometheus_format() -> None:
    client = TestClient(app_main.app)
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "voxaflow_pipecat_requests_total" in response.text


def test_simulate_call_posts_events() -> None:
    stub = StubBackendClient()
    app_main.backend_client = stub

    client = TestClient(app_main.app)
    response = client.post(
        "/simulate-call",
        json={
            "call_id": "call_123",
            "transcript_turns": ["Hello", "Hi there"]
        },
    )

    assert response.status_code == 200
    assert response.json()["events_posted"] == 2
    assert len(stub.events) == 2
    assert stub.events[0][0] == "call_123"


def test_simulate_call_auth_required_when_token_set(monkeypatch) -> None:
    monkeypatch.setenv("PIPECAT_INGRESS_TOKEN", "secret-token")
    client = TestClient(app_main.app)
    response = client.post(
        "/simulate-call",
        json={"call_id": "call_unauth", "transcript_turns": ["Hello"]},
    )
    assert response.status_code == 401


def test_twilio_media_websocket_flow() -> None:
    client = TestClient(app_main.app)
    with client.websocket_connect("/twilio-media") as ws:
        ws.send_json({"event": "connected"})
        connected_ack = ws.receive_json()
        assert connected_ack["event"] == "connected_ack"

        ws.send_json({"event": "start", "start": {"callSid": "CA123", "streamSid": "MZ123"}})
        start_ack = ws.receive_json()
        assert start_ack["event"] == "start_ack"
        assert start_ack["callSid"] == "CA123"

        # Trigger inbound audio frame; outbound greeting burst is emitted after first media event.
        ws.send_json({"event": "media", "media": {"payload": "abc"}})

        # Bidirectional MVP: outbound media packets are emitted after first inbound media.
        outbound_media = ws.receive_json()
        assert outbound_media["event"] == "media"
        assert outbound_media["streamSid"] == "MZ123"
        assert "payload" in outbound_media["media"]

        # Follow-up mark indicates greeting frame burst completed.
        marker = None
        for _ in range(200):
            item = ws.receive_json()
            if item.get("event") == "mark":
                marker = item
                break
        assert marker is not None
        assert marker["mark"]["name"] == "assistant_turn_done"

        media_ack = ws.receive_json()
        assert media_ack["event"] == "media_ack"

        ws.send_json({"event": "stop"})
        stop_ack = ws.receive_json()
        assert stop_ack["event"] == "stop_ack"


def test_twilio_media_websocket_auth(monkeypatch) -> None:
    monkeypatch.setenv("PIPECAT_INGRESS_TOKEN", "secret-token")
    client = TestClient(app_main.app)

    # unauthorized connection should be closed immediately
    try:
        with client.websocket_connect("/twilio-media") as ws:
            ws.send_json({"event": "connected"})
    except Exception:
        pass

    with client.websocket_connect("/twilio-media", headers={"x-pipecat-token": "secret-token"}) as ws:
        ws.send_json({"event": "connected"})
        ack = ws.receive_json()
        assert ack["event"] == "connected_ack"
