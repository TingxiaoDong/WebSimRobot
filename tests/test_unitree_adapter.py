import asyncio
import json
import time
from types import SimpleNamespace

import pytest

from server.config import Settings
from server.models import VelocityCommand
from server.unitree_adapter import UnitreeAdapter


class Publisher:
    def __init__(self):
        self.messages = []

    def Write(self, message):
        self.messages.append(message.data)
        return True


def test_unitree_commands_and_stale_state():
    async def run():
        adapter = UnitreeAdapter(Settings(robot_control_mode="sdk", unitree_state_timeout=1))
        adapter._connected = True
        adapter._string_type = SimpleNamespace
        adapter._move, adapter._reset = Publisher(), Publisher()
        adapter._on_state(SimpleNamespace(data=json.dumps({"task_name": "Isaac-Move-Cylinder-G129-Dex1-Wholebody"})))
        state = await adapter.get_state()
        assert state["simulation_connected"] and state["wholebody"]
        await adapter.move_velocity(VelocityCommand(x_vel=0.2, y_vel=-0.1, yaw_vel=0.3, height=0.7))
        assert json.loads(adapter._move.messages[-1]) == [0.2, -0.1, 0.3, 0.7]
        await adapter.stop()
        assert json.loads(adapter._move.messages[-1]) == [0, 0, 0, 0.8]
        await adapter.reset_pose(1)
        assert adapter._reset.messages == ["1"]
        adapter._last_state_time = time.monotonic() - 2
        assert not (await adapter.get_state())["simulation_connected"]
        with pytest.raises(RuntimeError):
            await adapter.move_velocity(VelocityCommand(x_vel=0, y_vel=0, yaw_vel=0, height=0.8))
        with pytest.raises(RuntimeError):
            await adapter.reset_pose(1)

    asyncio.run(run())
