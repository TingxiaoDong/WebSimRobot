from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class VelocityCommand(BaseModel):
    x_vel: float = Field(ge=-0.6, le=1.0)
    y_vel: float = Field(ge=-0.5, le=0.5)
    yaw_vel: float = Field(ge=-1.57, le=1.57)
    height: float = Field(ge=0.3, le=0.8)


class MoveRequest(VelocityCommand):
    session_id: str
    sequence: int


class HeartbeatRequest(BaseModel):
    session_id: str
    sequence: int


class StopRequest(BaseModel):
    session_id: str | None = None


class ResetRequest(BaseModel):
    category: int = 1


class GripperRequest(BaseModel):
    position: float


class RobotState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["mock", "mcp"]
    connected: bool
    mcp_connected: bool
    simulation_connected: bool
    controllable: bool
    task: str
    robot_type: str
    wholebody: bool
    last_command: VelocityCommand | None
    last_command_at: str | None
    last_error: str | None
    session_active: bool
    timestamp: str
    capabilities: list[str]
