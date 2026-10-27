import asyncio
import logging
import time
import uuid
from typing import Any

from .adapters import RobotAdapter, utc_now
from .models import HeartbeatRequest, MoveRequest, RobotState, VelocityCommand

logger = logging.getLogger("robot_control")


class ControlError(Exception):
    def __init__(self, detail: str, status_code: int = 409) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class RobotController:
    def __init__(
        self,
        adapter: RobotAdapter,
        watchdog_seconds: float = 0.5,
        control_period_seconds: float = 0.05,
    ) -> None:
        self.adapter = adapter
        self.watchdog_seconds = watchdog_seconds
        self.control_period_seconds = control_period_seconds
        self._lock = asyncio.Lock()
        self._connected = False
        self._session_id: str | None = None
        self._sequence = -1
        self._last_activity = 0.0
        self._last_command: VelocityCommand | None = None
        self._last_command_at: str | None = None
        self._last_error: str | None = None
        self._last_state: dict[str, Any] = {}
        self._runner: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._runner is None or self._runner.done():
            self._runner = asyncio.create_task(self._run(), name="robot-control-loop")

    async def shutdown(self) -> None:
        runner, self._runner = self._runner, None
        if runner is not None:
            runner.cancel()
            try:
                await runner
            except asyncio.CancelledError:
                pass
        async with self._lock:
            if self._connected:
                await self._stop_locked()
                await self.adapter.disconnect()
                self._connected = False

    async def _run(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Unexpected control-loop failure")
                async with self._lock:
                    await self._fail_locked(exc)
            await asyncio.sleep(self.control_period_seconds)

    async def _tick(self) -> None:
        async with self._lock:
            if not self._session_active_locked:
                return
            command = self._last_command
            command_active = command is not None and (
                abs(command.x_vel) > 1e-9
                or abs(command.y_vel) > 1e-9
                or abs(command.yaw_vel) > 1e-9
                or abs(command.height - 0.8) > 1e-9
            )
            if (
                command_active
                and time.monotonic() - self._last_activity > self.watchdog_seconds
            ):
                logger.warning("Control watchdog expired; stopping robot")
                await self._stop_locked()
                self._last_error = "Watchdog timeout: robot stopped"
                return
            if command is not None:
                try:
                    await self.adapter.move_velocity(command)
                except Exception as exc:
                    logger.exception("Move failed; stopping robot")
                    await self._fail_locked(exc)

    @property
    def _session_active_locked(self) -> bool:
        return self._connected and self._session_id is not None

    async def _adapter_state_locked(self) -> dict[str, Any]:
        try:
            state = await self.adapter.get_state()
            self._last_state = state
            return state
        except Exception as exc:
            logger.exception("Reading robot state failed")
            self._last_error = str(exc)
            return dict(self._last_state)

    def _snapshot_locked(self, adapter_state: dict[str, Any] | None = None) -> RobotState:
        state = adapter_state or self._last_state
        simulation_connected = bool(state.get("simulation_connected", False))
        connected = self._connected and bool(state.get("connected", self._connected))
        return RobotState(
            mode=self.adapter.mode,
            connected=connected,
            mcp_connected=bool(state.get("mcp_connected", False)),
            simulation_connected=simulation_connected,
            controllable=connected and simulation_connected,
            task=str(state.get("task", "")),
            robot_type=str(state.get("robot_type", "")),
            wholebody=bool(state.get("wholebody", False)),
            last_command=self._last_command,
            last_command_at=self._last_command_at,
            last_error=self._last_error,
            session_active=self._session_active_locked,
            timestamp=utc_now(),
            capabilities=list(state.get("capabilities", [])),
        )

    async def get_state(self) -> RobotState:
        async with self._lock:
            return self._snapshot_locked(await self._adapter_state_locked())

    async def connect(self) -> RobotState:
        async with self._lock:
            try:
                if not self._connected:
                    await self.adapter.connect()
                self._connected = True
                self._last_error = None
                state = await self._adapter_state_locked()
                return self._snapshot_locked(state)
            except Exception as exc:
                self._connected = False
                self._last_error = str(exc)
                logger.exception("Robot connection failed")
                raise ControlError(f"Connection failed: {exc}", 502) from exc

    async def create_session(self) -> str:
        async with self._lock:
            state = await self._adapter_state_locked()
            snapshot = self._snapshot_locked(state)
            if not snapshot.controllable:
                raise ControlError("Robot is not connected and controllable")
            if self._session_id is not None:
                raise ControlError("A control session is already active")
            self._session_id = uuid.uuid4().hex
            self._sequence = -1
            self._last_activity = time.monotonic()
            self._last_command = VelocityCommand(
                x_vel=0.0, y_vel=0.0, yaw_vel=0.0, height=0.8
            )
            self._last_command_at = utc_now()
            self._last_error = None
            logger.info("Control session created: %s", self._session_id)
            return self._session_id

    def _validate_session_locked(self, session_id: str, sequence: int) -> None:
        if not self._session_active_locked or session_id != self._session_id:
            raise ControlError("Invalid or inactive session", 403)
        if sequence <= self._sequence:
            raise ControlError(
                f"Sequence must be strictly greater than {self._sequence}", 409
            )
        self._sequence = sequence
        self._last_activity = time.monotonic()

    async def move(self, request: MoveRequest) -> RobotState:
        async with self._lock:
            self._validate_session_locked(request.session_id, request.sequence)
            self._last_command = VelocityCommand(
                x_vel=request.x_vel,
                y_vel=request.y_vel,
                yaw_vel=request.yaw_vel,
                height=request.height,
            )
            self._last_command_at = utc_now()
            logger.info(
                "Move accepted: session=%s sequence=%s command=%s",
                request.session_id,
                request.sequence,
                self._last_command.model_dump(),
            )
            return self._snapshot_locked()

    async def heartbeat(self, request: HeartbeatRequest) -> None:
        async with self._lock:
            self._validate_session_locked(request.session_id, request.sequence)
            logger.info(
                "Heartbeat accepted: session=%s sequence=%s",
                request.session_id,
                request.sequence,
            )

    async def _stop_locked(self) -> None:
        # 普通停止只清零运动并保留会话，使“按住移动、松开停止”可以反复使用。
        self._last_command = VelocityCommand(
            x_vel=0.0, y_vel=0.0, yaw_vel=0.0, height=0.8
        )
        self._last_command_at = utc_now()
        try:
            await self.adapter.stop()
        except Exception as exc:
            self._last_error = f"Stop failed: {exc}"
            logger.exception("Adapter stop failed")

    async def stop(self) -> RobotState:
        async with self._lock:
            await self._stop_locked()
            logger.info("Safe stop requested")
            return self._snapshot_locked(await self._adapter_state_locked())

    async def _fail_locked(self, exc: Exception) -> None:
        self._last_error = str(exc)
        await self._stop_locked()

    async def disconnect(self) -> RobotState:
        async with self._lock:
            await self._stop_locked()
            self._session_id = None
            self._sequence = -1
            try:
                await self.adapter.disconnect()
                self._connected = False
                self._last_state = {}
                return self._snapshot_locked(await self._adapter_state_locked())
            except Exception as exc:
                self._connected = False
                self._last_error = str(exc)
                logger.exception("Robot disconnect failed")
                raise ControlError(f"Disconnect failed: {exc}", 502) from exc

    async def reset_pose(self, category: int) -> str | None:
        async with self._lock:
            if not self._connected:
                raise ControlError("Robot is not connected")
            try:
                message = await self.adapter.reset_pose(category)
                await self._stop_locked()
                return message
            except Exception as exc:
                await self._fail_locked(exc)
                raise ControlError(f"Reset failed: {exc}", 502) from exc

    async def set_gripper(self, position: float) -> None:
        async with self._lock:
            if not self._connected:
                raise ControlError("Robot is not connected")
            try:
                await self.adapter.set_gripper(position)
            except Exception as exc:
                await self._fail_locked(exc)
                raise ControlError(f"Gripper command failed: {exc}", 502) from exc
