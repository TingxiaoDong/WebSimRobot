"""Local proxy for the optional Franka Isaac Lab demo process."""
import asyncio
import json
import os
from urllib.error import URLError
from urllib.request import Request, urlopen
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/franka")

def _request(path: str, method: str = "GET") -> dict:
    base = os.environ.get("FRANKA_DEMO_URL", "http://127.0.0.1:8765").rstrip("/")
    try:
        with urlopen(Request(base + path, method=method), timeout=2) as response:
            return json.load(response)
    except (URLError, OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Franka 仿真未连接，请先启动演示脚本。") from exc

@router.get("/status")
async def status() -> dict:
    return await asyncio.to_thread(_request, "/status")

@router.post("/wave")
async def wave() -> dict:
    return await asyncio.to_thread(_request, "/wave", "POST")
