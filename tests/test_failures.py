import time

from fastapi.testclient import TestClient

from conftest import move_body
from server.adapters import MockAdapter
from server.app import create_app
from server.config import Settings


class FailingMoveAdapter(MockAdapter):
    async def move_velocity(self, command):
        await super().move_velocity(command)
        raise RuntimeError("simulated transport failure")


def test_adapter_exception_records_error_and_stops() -> None:
    adapter = FailingMoveAdapter()
    app = create_app(Settings(robot_control_mode="mock"), adapter=adapter)
    with TestClient(app) as client:
        client.post("/api/connect")
        session_id = client.post("/api/session").json()["session_id"]
        assert client.post("/api/control/move", json=move_body(session_id)).status_code == 200
        deadline = time.monotonic() + 0.5
        while time.monotonic() < deadline:
            state = client.get("/api/state").json()
            if state["last_error"]:
                break
            time.sleep(0.02)
        assert state["last_error"] == "simulated transport failure"
        assert state["session_active"] is False
        assert state["last_command"]["x_vel"] == 0.0
        assert state["last_command"]["height"] == 0.8
        assert adapter.stop_calls >= 1
