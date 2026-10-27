import time
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from conftest import move_body
from server.adapters import MockAdapter
from server.app import create_app
from server.config import Settings

STATE_FIELDS = {
    "mode",
    "connected",
    "mcp_connected",
    "simulation_connected",
    "controllable",
    "task",
    "robot_type",
    "wholebody",
    "last_command",
    "last_command_at",
    "last_error",
    "session_active",
    "timestamp",
    "capabilities",
}


def test_health_and_initial_state(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok", "mode": "mock"}
    response = client.get("/api/state")
    assert response.status_code == 200
    state = response.json()
    assert set(state) == STATE_FIELDS
    assert state["mode"] == "mock"
    assert state["connected"] is False
    assert state["mcp_connected"] is False
    assert state["simulation_connected"] is False
    assert state["controllable"] is False
    assert state["task"] == "Isaac-Move-Cylinder-G129-Dex1-Wholebody"
    assert state["robot_type"] == "g129"
    assert state["wholebody"] is True
    assert set(state["capabilities"]) >= {"move", "reset", "gripper"}
    assert state["last_command"] is None
    assert state["last_command_at"] is None
    assert state["last_error"] is None
    assert state["session_active"] is False
    assert datetime.fromisoformat(state["timestamp"]).utcoffset().total_seconds() == 0


def test_session_requires_connection_and_only_one_is_active(client: TestClient) -> None:
    assert client.post("/api/session").status_code == 409
    state = client.post("/api/connect").json()
    assert state["connected"] is True
    assert state["simulation_connected"] is True
    assert state["controllable"] is True
    first = client.post("/api/session")
    assert first.status_code == 200
    assert isinstance(first.json()["session_id"], str)
    assert first.json()["session_id"]
    assert client.post("/api/session").status_code == 409
    assert client.get("/api/state").json()["session_active"] is True


def test_move_updates_state_and_background_loop_calls_adapter(
    client: TestClient, adapter: MockAdapter, session_id: str
) -> None:
    response = client.post("/api/control/move", json=move_body(session_id))
    assert response.status_code == 200
    state = response.json()
    assert state["last_command"] == {
        "x_vel": 0.2,
        "y_vel": -0.1,
        "yaw_vel": 0.3,
        "height": 0.65,
    }
    assert state["last_command_at"] is not None
    deadline = time.monotonic() + 0.5
    while adapter.move_calls < 2 and time.monotonic() < deadline:
        time.sleep(0.02)
    assert adapter.move_calls >= 2
    assert adapter.last_command.height == 0.65


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("x_vel", -0.61),
        ("x_vel", 1.01),
        ("y_vel", -0.51),
        ("y_vel", 0.51),
        ("yaw_vel", -1.58),
        ("yaw_vel", 1.58),
        ("height", 0.29),
        ("height", 0.81),
    ],
)
def test_move_rejects_out_of_range_values(
    client: TestClient, session_id: str, field: str, value: float
) -> None:
    response = client.post(
        "/api/control/move", json=move_body(session_id, **{field: value})
    )
    assert response.status_code == 422
    assert client.get("/api/state").json()["session_active"] is True


def test_move_rejects_bad_session_and_non_increasing_sequence(
    client: TestClient, session_id: str
) -> None:
    assert client.post("/api/control/move", json=move_body("wrong", 0)).status_code == 403
    assert client.post("/api/control/move", json=move_body(session_id, 2)).status_code == 200
    assert client.post("/api/control/move", json=move_body(session_id, 2)).status_code == 409
    assert client.post("/api/control/move", json=move_body(session_id, 1)).status_code == 409
    assert client.post("/api/control/move", json=move_body(session_id, 3)).status_code == 200


def test_heartbeat_uses_same_sequence_and_extends_watchdog(
    client: TestClient, session_id: str
) -> None:
    assert client.post("/api/control/move", json=move_body(session_id, 0)).status_code == 200
    time.sleep(0.35)
    heartbeat = {"session_id": session_id, "sequence": 1}
    assert client.post("/api/control/heartbeat", json=heartbeat).json() == {"status": "ok"}
    assert client.post("/api/control/heartbeat", json=heartbeat).status_code == 409
    time.sleep(0.25)
    assert client.get("/api/state").json()["session_active"] is True
    time.sleep(0.4)
    state = client.get("/api/state").json()
    assert state["session_active"] is True
    assert "Watchdog timeout" in state["last_error"]
    assert state["last_command"] == {
        "x_vel": 0.0,
        "y_vel": 0.0,
        "yaw_vel": 0.0,
        "height": 0.8,
    }


def test_watchdog_stops_without_heartbeat(client: TestClient, session_id: str) -> None:
    assert client.post("/api/control/move", json=move_body(session_id)).status_code == 200
    time.sleep(0.65)
    state = client.get("/api/state").json()
    assert state["session_active"] is True
    assert state["last_command"]["x_vel"] == 0.0
    assert state["last_command"]["height"] == 0.8
    # 看门狗只停止运动；同一客户端可以用更大的序号显式恢复控制。
    assert client.post("/api/control/move", json=move_body(session_id, 1)).status_code == 200


def test_stop_is_always_allowed_idempotent_and_preserves_session(
    client: TestClient, session_id: str
) -> None:
    assert client.post("/api/control/move", json=move_body(session_id)).status_code == 200
    for body in ({"session_id": session_id}, {"session_id": "invalid"}, {}, None):
        response = client.post("/api/control/stop", json=body)
        assert response.status_code == 200
        state = response.json()
        assert state["session_active"] is True
        assert state["last_command"] == {
            "x_vel": 0.0,
            "y_vel": 0.0,
            "yaw_vel": 0.0,
            "height": 0.8,
        }
    # 松开停止后再次按下必须能继续运动。
    assert client.post("/api/control/move", json=move_body(session_id, 1)).status_code == 200
    assert client.post("/api/control/stop", json={}).status_code == 200
    assert client.post("/api/control/move", json=move_body(session_id, 2)).status_code == 200
    disconnected = client.post("/api/disconnect")
    assert disconnected.status_code == 200
    assert client.post("/api/control/stop").status_code == 200


def test_reset_gripper_and_disconnect(
    client: TestClient, adapter: MockAdapter, session_id: str
) -> None:
    reset = client.post("/api/actions/reset", json={})
    assert reset.status_code == 200
    assert reset.json()["status"] == "ok"
    assert "category=1" in reset.json()["message"]
    assert client.get("/api/state").json()["session_active"] is True
    assert client.post("/api/actions/reset", json={"category": 2}).status_code == 200
    assert client.post("/api/actions/gripper", json={"position": 0.42}).json() == {
        "status": "ok"
    }
    assert adapter.gripper_position == 0.42
    state = client.post("/api/disconnect").json()
    assert state["connected"] is False
    assert state["controllable"] is False
    assert state["session_active"] is False
    assert client.post("/api/actions/gripper", json={"position": 0.2}).status_code == 409


def test_actions_require_connection(client: TestClient) -> None:
    assert client.post("/api/actions/reset", json={}).status_code == 409
    assert client.post("/api/actions/gripper", json={"position": 0.5}).status_code == 409


def test_websocket_streams_state_and_answers_ping(client: TestClient) -> None:
    with client.websocket_connect("/ws/state") as websocket:
        message = websocket.receive_json()
        assert message["type"] == "state"
        assert set(message["data"]) == STATE_FIELDS
        websocket.send_text("ping")
        messages = [websocket.receive_json() for _ in range(3)]
        assert {"type": "pong"} in messages


def test_cors_allows_vite_development_origin(client: TestClient) -> None:
    response = client.options(
        "/api/state",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_static_spa_and_client_route_fallback(tmp_path) -> None:
    (tmp_path / "index.html").write_text("<html>robot SPA</html>", encoding="utf-8")
    (tmp_path / "app.js").write_text("console.log('ok')", encoding="utf-8")
    app = create_app(Settings(robot_control_mode="mock"), adapter=MockAdapter(), static_dir=tmp_path)
    with TestClient(app) as client:
        assert client.get("/").text == "<html>robot SPA</html>"
        assert client.get("/app.js").text == "console.log('ok')"
        fallback = client.get("/robot/control")
        assert fallback.status_code == 200
        assert fallback.text == "<html>robot SPA</html>"
        assert client.get("/api/health").json()["status"] == "ok"
