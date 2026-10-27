import json
import logging
from abc import ABC, abstractmethod
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from typing import Any

from .config import Settings
from .models import VelocityCommand

logger = logging.getLogger("robot_control.adapter")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RobotAdapter(ABC):
    mode: str

    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def disconnect(self) -> None: ...

    @abstractmethod
    async def get_state(self) -> dict[str, Any]: ...

    @abstractmethod
    async def move_velocity(self, command: VelocityCommand) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    async def reset_pose(self, category: int = 1) -> str | None: ...

    @abstractmethod
    async def set_gripper(self, position: float) -> None: ...

    @abstractmethod
    async def list_capabilities(self) -> list[str]: ...


class MockAdapter(RobotAdapter):
    mode = "mock"

    def __init__(self) -> None:
        self.connected = False
        self.simulation_connected = False
        self.last_command: VelocityCommand | None = None
        self.gripper_position = 0.0
        self.move_calls = 0
        self.stop_calls = 0

    async def connect(self) -> None:
        self.connected = True
        self.simulation_connected = True

    async def disconnect(self) -> None:
        self.connected = False
        self.simulation_connected = False

    async def get_state(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "mcp_connected": False,
            "simulation_connected": self.simulation_connected,
            "task": "Isaac-Move-Cylinder-G129-Dex1-Wholebody",
            "robot_type": "g129",
            "wholebody": True,
            "capabilities": await self.list_capabilities(),
        }

    async def move_velocity(self, command: VelocityCommand) -> None:
        if not self.connected:
            raise RuntimeError("Mock robot is not connected")
        self.last_command = command.model_copy(deep=True)
        self.move_calls += 1
        logger.info("Mock move: %s", command.model_dump())

    async def stop(self) -> None:
        self.last_command = VelocityCommand(
            x_vel=0.0, y_vel=0.0, yaw_vel=0.0, height=0.8
        )
        self.stop_calls += 1
        logger.info("Mock robot stopped")

    async def reset_pose(self, category: int = 1) -> str | None:
        if not self.connected:
            raise RuntimeError("Mock robot is not connected")
        self.last_command = VelocityCommand(
            x_vel=0.0, y_vel=0.0, yaw_vel=0.0, height=0.8
        )
        return f"Mock pose reset (category={category})"

    async def set_gripper(self, position: float) -> None:
        if not self.connected:
            raise RuntimeError("Mock robot is not connected")
        self.gripper_position = position

    async def list_capabilities(self) -> list[str]:
        return ["move", "reset", "gripper"]


class MCPAdapter(RobotAdapter):
    """Official Python MCP SDK adapter supporting stdio and streamable HTTP."""

    mode = "mcp"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._stack: AsyncExitStack | None = None
        self._session: Any = None
        self._connected = False

    async def connect(self) -> None:
        if self._connected:
            return
        from mcp import ClientSession, StdioServerParameters

        self._stack = AsyncExitStack()
        try:
            if self.settings.mcp_transport == "stdio":
                if not self.settings.mcp_server_command:
                    raise ValueError("MCP_SERVER_COMMAND is required for stdio transport")
                from mcp.client.stdio import stdio_client

                args = json.loads(self.settings.mcp_server_args)
                if not isinstance(args, list) or not all(isinstance(v, str) for v in args):
                    raise ValueError("MCP_SERVER_ARGS must be a JSON array of strings")
                params = StdioServerParameters(
                    command=self.settings.mcp_server_command,
                    args=args,
                    cwd=self.settings.mcp_server_cwd,
                )
                read, write = await self._stack.enter_async_context(stdio_client(params))
            else:
                if not self.settings.mcp_http_url:
                    raise ValueError("MCP_HTTP_URL is required for HTTP transport")
                from mcp.client.streamable_http import streamable_http_client
                import httpx
                from urllib.parse import urlsplit

                host = urlsplit(self.settings.mcp_http_url).hostname
                http_client = None
                if host in {"127.0.0.1", "localhost", "::1"}:
                    http_client = await self._stack.enter_async_context(httpx.AsyncClient(trust_env=False))
                read, write, _ = await self._stack.enter_async_context(
                    streamable_http_client(self.settings.mcp_http_url, http_client=http_client)
                )
            self._session = await self._stack.enter_async_context(ClientSession(read, write))
            await self._session.initialize()
            self._connected = True
        except Exception:
            await self._stack.aclose()
            self._stack = None
            self._session = None
            raise

    async def disconnect(self) -> None:
        stack, self._stack = self._stack, None
        self._session = None
        self._connected = False
        if stack is not None:
            await stack.aclose()

    def _require_session(self) -> Any:
        if not self._connected or self._session is None:
            raise RuntimeError("MCP session is not connected")
        return self._session

    async def _call(self, tool_name: str, arguments: dict[str, Any] | None = None) -> Any:
        logger.info("Calling MCP tool %s with %s", tool_name, arguments or {})
        result = await self._require_session().call_tool(tool_name, arguments or {})
        if getattr(result, "isError", False):
            raise RuntimeError(f"MCP tool {tool_name} returned an error: {result}")
        texts = [
            item.text
            for item in getattr(result, "content", [])
            if getattr(item, "type", None) == "text" and hasattr(item, "text")
        ]
        if not texts:
            raise RuntimeError(f"MCP tool {tool_name} returned no text JSON")
        try:
            return json.loads("".join(texts))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"MCP tool {tool_name} returned invalid JSON") from exc

    async def get_state(self) -> dict[str, Any]:
        payload = await self._call(self.settings.mcp_tool_state)
        if not isinstance(payload, dict):
            raise RuntimeError("MCP state tool must return a JSON object")
        state = dict(payload)
        state.setdefault("connected", self._connected)
        state.setdefault("mcp_connected", self._connected)
        state.setdefault("simulation_connected", self._connected)
        state.setdefault("task", "")
        state.setdefault("robot_type", "")
        state.setdefault("wholebody", False)
        state.setdefault("capabilities", await self.list_capabilities())
        return state

    async def move_velocity(self, command: VelocityCommand) -> None:
        await self._call(self.settings.mcp_tool_move, command.model_dump())

    async def stop(self) -> None:
        if self._connected:
            await self._call(self.settings.mcp_tool_stop)

    async def reset_pose(self, category: int = 1) -> str | None:
        payload = await self._call(self.settings.mcp_tool_reset, {"category": category})
        if isinstance(payload, dict) and payload.get("message") is not None:
            return str(payload["message"])
        return None

    async def set_gripper(self, position: float) -> None:
        await self._call(self.settings.mcp_tool_gripper, {"position": position})

    async def list_capabilities(self) -> list[str]:
        payload = await self._call(self.settings.mcp_tool_capabilities)
        capabilities = payload.get("capabilities") if isinstance(payload, dict) else payload
        if not isinstance(capabilities, list) or not all(isinstance(v, str) for v in capabilities):
            raise RuntimeError("MCP capabilities tool must return a string array")
        return capabilities
