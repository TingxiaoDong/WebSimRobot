import pytest
from fastapi.testclient import TestClient

from server.adapters import MockAdapter
from server.app import create_app
from server.config import Settings


@pytest.fixture
def adapter() -> MockAdapter:
    return MockAdapter()


@pytest.fixture
def client(adapter: MockAdapter):
    app = create_app(Settings(robot_control_mode="mock"), adapter=adapter)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session_id(client: TestClient) -> str:
    response = client.post("/api/connect")
    assert response.status_code == 200
    response = client.post("/api/session")
    assert response.status_code == 200
    return response.json()["session_id"]


def move_body(session_id: str, sequence: int = 0, **overrides) -> dict:
    body = {
        "session_id": session_id,
        "sequence": sequence,
        "x_vel": 0.2,
        "y_vel": -0.1,
        "yaw_vel": 0.3,
        "height": 0.65,
    }
    body.update(overrides)
    return body
