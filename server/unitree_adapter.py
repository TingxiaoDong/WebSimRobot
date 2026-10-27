"""SDK2 DDS adapter for unitree_sim_isaaclab Wholebody tasks."""

import asyncio
import json
import threading
import time
from typing import Any

from .adapters import RobotAdapter
from .config import Settings
from .models import VelocityCommand


class UnitreeAdapter(RobotAdapter):
    mode = "sdk"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = threading.Lock()
        self._state: dict[str, Any] = {}
        self._last_state_time = 0.0
        self._channels: list[Any] = []
        self._connected = False

    def _on_state(self, message: Any) -> None:
        try:
            state = json.loads(message.data)
            if not isinstance(state, dict) or not isinstance(state.get("task_name"), str):
                return
        except (ValueError, TypeError, AttributeError):
            return
        with self._lock:
            self._state = state
            self._last_state_time = time.monotonic()

    async def connect(self) -> None:
        if self._connected:
            return
        try:
            from unitree_sdk2py.core.channel import ChannelFactoryInitialize, ChannelPublisher, ChannelSubscriber
            from unitree_sdk2py.idl.std_msgs.msg.dds_ import String_
            from unitree_sdk2py.idl.unitree_go.msg.dds_ import MotorCmds_
        except ImportError as exc:
            raise RuntimeError("未安装 Unitree SDK2，请按 README 安装 SDK 和 Cyclone DDS") from exc

        try:
            ChannelFactoryInitialize(self.settings.unitree_dds_domain, self.settings.unitree_network_interface or None)
            self._string_type = String_
            self._move = ChannelPublisher("rt/run_command/cmd", String_)
            self._reset = ChannelPublisher("rt/reset_pose/cmd", String_)
            self._grippers = [ChannelPublisher(f"rt/dex1/{side}/cmd", MotorCmds_) for side in ("left", "right")]
            self._subscriber = ChannelSubscriber("rt/sim_state", String_)
            self._channels = [self._move, self._reset, *self._grippers, self._subscriber]
            for channel in self._channels[:-1]:
                channel.Init()
            self._subscriber.Init(self._on_state, 1)
            deadline = time.monotonic() + self.settings.unitree_state_timeout
            while time.monotonic() < deadline:
                with self._lock:
                    task = self._state.get("task_name", "")
                    fresh = time.monotonic() - self._last_state_time < self.settings.unitree_state_timeout
                if task and fresh:
                    if "Wholebody" not in task:
                        raise RuntimeError(f"仿真任务 {task} 不支持 Wholebody 移动控制")
                    self._connected = True
                    return
                await asyncio.sleep(0.05)
            raise RuntimeError("未收到仿真器 rt/sim_state；检查 DDS 域号、网卡和仿真进程")
        except BaseException:
            await self.disconnect()
            raise

    async def disconnect(self) -> None:
        self._connected = False
        for channel in reversed(self._channels):
            try:
                channel.Close()
            except Exception:
                pass
        self._channels = []
        with self._lock:
            self._state = {}
            self._last_state_time = 0.0

    async def get_state(self) -> dict[str, Any]:
        with self._lock:
            task = self._state.get("task_name", "")
            fresh = bool(self._last_state_time) and time.monotonic() - self._last_state_time < self.settings.unitree_state_timeout
        wholebody = "Wholebody" in task
        return {"connected": self._connected, "mcp_connected": False,
                "simulation_connected": self._connected and fresh, "task": task,
                "robot_type": "g129" if "G129" in task else "", "wholebody": wholebody,
                "capabilities": await self.list_capabilities()}

    def _write(self, publisher: Any, message: Any) -> None:
        if not self._connected:
            raise RuntimeError("SDK 尚未连接仿真器")
        if publisher.Write(message) is False:
            raise RuntimeError("DDS 发布失败")

    async def move_velocity(self, command: VelocityCommand) -> None:
        state = await self.get_state()
        if not state["simulation_connected"] or not state["wholebody"]:
            raise RuntimeError("仿真状态已过期或当前任务不支持移动")
        values = [command.x_vel, command.y_vel, command.yaw_vel, command.height]
        self._write(self._move, self._string_type(data=json.dumps(values)))

    async def stop(self) -> None:
        if self._connected:
            self._write(self._move, self._string_type(data="[0.0, 0.0, 0.0, 0.8]"))

    async def reset_pose(self, category: int = 1) -> str:
        if category not in (1, 2):
            raise ValueError("仿真器支持复位类别 1 或 2")
        if not (await self.get_state())["simulation_connected"]:
            raise RuntimeError("仿真状态已过期")
        self._write(self._reset, self._string_type(data=str(category)))
        return "已发送仿真复位请求"

    async def set_gripper(self, position: float) -> None:
        if not 0 <= position <= 1:
            raise ValueError("夹爪位置须在 0 到 1 之间")
        state = await self.get_state()
        if not state["simulation_connected"] or "Dex1" not in state["task"]:
            raise RuntimeError("当前仿真任务不支持 Dex1 夹爪")
        from unitree_sdk2py.idl.unitree_go.msg.dds_ import MotorCmds_
        from unitree_sdk2py.idl.default import unitree_go_msg_dds__MotorCmd_
        command = unitree_go_msg_dds__MotorCmd_()
        command.q = float(position * 5.4)
        for publisher in self._grippers:
            self._write(publisher, MotorCmds_(cmds=[command]))

    async def list_capabilities(self) -> list[str]:
        with self._lock:
            task = self._state.get("task_name", "")
        return ["move", "reset"] + (["gripper"] if "Dex1" in task else [])
