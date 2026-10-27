import asyncio
import json
from types import SimpleNamespace

import pytest

from server.adapters import MCPAdapter
from server.config import Settings
from server.models import VelocityCommand


class FakeMCPSession:
    def __init__(self) -> None:
        self.calls = []

    async def call_tool(self, name, arguments):
        self.calls.append((name, arguments))
        payloads = {
            "custom_state": {
                "task": "task",
                "robot_type": "g129",
                "wholebody": True,
                "capabilities": ["move"],
            },
            "custom_capabilities": ["move", "reset"],
        }
        payload = payloads.get(name, {"status": "ok", "message": "done"})
        return SimpleNamespace(
            isError=False,
            content=[SimpleNamespace(type="text", text=json.dumps(payload))],
        )


def test_mcp_tool_mapping_and_text_json_parsing_without_real_server() -> None:
    settings = Settings(
        robot_control_mode="mcp",
        mcp_tool_move="custom_move",
        mcp_tool_stop="custom_stop",
        mcp_tool_reset="custom_reset",
        mcp_tool_state="custom_state",
        mcp_tool_gripper="custom_gripper",
        mcp_tool_capabilities="custom_capabilities",
    )
    adapter = MCPAdapter(settings)
    fake = FakeMCPSession()
    adapter._session = fake
    adapter._connected = True

    async def exercise() -> None:
        state = await adapter.get_state()
        assert state["mcp_connected"] is True
        assert state["simulation_connected"] is True
        assert state["capabilities"] == ["move"]
        command = VelocityCommand(x_vel=0.1, y_vel=0.0, yaw_vel=0.0, height=0.8)
        await adapter.move_velocity(command)
        await adapter.stop()
        assert await adapter.reset_pose(2) == "done"
        await adapter.set_gripper(0.5)
        assert await adapter.list_capabilities() == ["move", "reset"]

    asyncio.run(exercise())
    assert fake.calls[0][0] == "custom_state"
    assert ("custom_move", command_dict()) in fake.calls
    assert ("custom_stop", {}) in fake.calls
    assert ("custom_reset", {"category": 2}) in fake.calls
    assert ("custom_gripper", {"position": 0.5}) in fake.calls
    assert ("custom_capabilities", {}) in fake.calls


def command_dict() -> dict:
    return {"x_vel": 0.1, "y_vel": 0.0, "yaw_vel": 0.0, "height": 0.8}


def test_mcp_rejects_non_json_tool_text() -> None:
    adapter = MCPAdapter(Settings(robot_control_mode="mcp"))
    adapter._connected = True
    adapter._session = SimpleNamespace(
        call_tool=lambda name, arguments: None
    )

    async def call() -> None:
        async def fake_call(name, arguments):
            return SimpleNamespace(
                isError=False,
                content=[SimpleNamespace(type="text", text="not json")],
            )

        adapter._session.call_tool = fake_call
        with pytest.raises(RuntimeError, match="invalid JSON"):
            await adapter.get_state()

    asyncio.run(call())
