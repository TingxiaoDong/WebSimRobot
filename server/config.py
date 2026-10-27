from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed runtime settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    robot_control_mode: Literal["mock", "mcp"] = "mock"
    mcp_transport: Literal["stdio", "http"] = "stdio"
    mcp_server_command: str | None = None
    mcp_server_args: str = "[]"
    mcp_server_cwd: str | None = None
    mcp_http_url: str | None = None
    mcp_tool_move: str = "move_velocity"
    mcp_tool_stop: str = "stop_robot"
    mcp_tool_reset: str = "reset_pose"
    mcp_tool_state: str = "get_robot_state"
    mcp_tool_gripper: str = "set_gripper"
    mcp_tool_capabilities: str = "list_capabilities"
