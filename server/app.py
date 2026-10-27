import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from .franka import router as franka_router
from .adapters import MCPAdapter, MockAdapter, RobotAdapter
from .config import Settings
from .controller import ControlError, RobotController
from .unitree_adapter import UnitreeAdapter
from .models import (
    GripperRequest,
    HeartbeatRequest,
    MoveRequest,
    ResetRequest,
    RobotState,
    StopRequest,
)

logging.basicConfig(level=logging.INFO)


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: dict) -> JSONResponse:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or not (Path(self.directory) / "index.html").is_file():
                raise
            return await super().get_response("index.html", scope)


def create_app(
    settings: Settings | None = None,
    adapter: RobotAdapter | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    settings = settings or Settings()
    adapter = adapter or (MockAdapter() if settings.robot_control_mode == "mock" else UnitreeAdapter(settings) if settings.robot_control_mode == "sdk" else MCPAdapter(settings))
    controller = RobotController(adapter)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await controller.start()
        try:
            if settings.robot_control_mode == "mcp" and settings.mcp_auto_connect:
                try:
                    await controller.connect()
                    logging.info("MCP 自动连接成功")
                except ControlError:
                    logging.exception("MCP 自动连接失败；可在页面重试")
            yield
        finally:
            await controller.shutdown()

    app = FastAPI(title="Robot Control API", lifespan=lifespan)
    app.state.controller = controller
    app.include_router(franka_router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ControlError)
    async def control_error_handler(_: Request, exc: ControlError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "mode": settings.robot_control_mode}

    @app.get("/api/state", response_model=RobotState)
    async def state() -> RobotState:
        return await controller.get_state()

    @app.post("/api/connect", response_model=RobotState)
    async def connect() -> RobotState:
        return await controller.connect()

    @app.post("/api/session")
    async def session() -> dict[str, str]:
        return {"session_id": await controller.create_session()}

    @app.post("/api/disconnect", response_model=RobotState)
    async def disconnect() -> RobotState:
        return await controller.disconnect()

    @app.post("/api/control/move", response_model=RobotState)
    async def move(request: MoveRequest) -> RobotState:
        return await controller.move(request)

    @app.post("/api/control/heartbeat")
    async def heartbeat(request: HeartbeatRequest) -> dict[str, str]:
        await controller.heartbeat(request)
        return {"status": "ok"}

    @app.post("/api/control/stop", response_model=RobotState)
    async def stop(request: StopRequest | None = None) -> RobotState:
        return await controller.stop()

    @app.post("/api/actions/reset")
    async def reset(request: ResetRequest | None = None) -> dict[str, str]:
        message = await controller.reset_pose((request or ResetRequest()).category)
        response = {"status": "ok"}
        if message:
            response["message"] = message
        return response

    @app.post("/api/actions/gripper")
    async def gripper(request: GripperRequest) -> dict[str, str]:
        await controller.set_gripper(request.position)
        return {"status": "ok"}

    @app.websocket("/ws/state")
    async def websocket_state(websocket: WebSocket) -> None:
        await websocket.accept()

        async def receive_pings() -> None:
            while True:
                message = await websocket.receive_text()
                if message == "ping":
                    await websocket.send_json({"type": "pong"})

        receiver = asyncio.create_task(receive_pings())
        try:
            while True:
                done, _ = await asyncio.wait(
                    {receiver}, timeout=0.2, return_when=asyncio.FIRST_COMPLETED
                )
                if receiver in done:
                    exception = receiver.exception()
                    if exception is not None:
                        raise exception
                    break
                current = await controller.get_state()
                await websocket.send_json({"type": "state", "data": current.model_dump(mode="json")})
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            receiver.cancel()
            try:
                await receiver
            except (asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                pass

    static_dir = static_dir or Path(__file__).resolve().parent.parent / "web" / "dist"
    if static_dir.is_dir():
        app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="spa")

    return app


app = create_app()
