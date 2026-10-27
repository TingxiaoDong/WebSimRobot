"""Find a uniquely identifiable local robot MCP server over streamable HTTP."""

import asyncio
import os
import re
import shutil
import subprocess
import sys

import anyio
import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


def listening_ports() -> set[int]:
    if not shutil.which("lsof"):
        print("[MCP 检测] 未找到 lsof，跳过自动检测。", file=sys.stderr)
        return set()
    result = subprocess.run(
        ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-F", "n"],
        capture_output=True, text=True, check=False, timeout=5,
    )
    ports = set()
    for line in result.stdout.splitlines():
        match = re.fullmatch(r"n(?:\*|127\.0\.0\.1|localhost|\[::1\]|\[::\]|0\.0\.0\.0):(\d+)", line)
        if match:
            ports.add(int(match.group(1)))
    return ports


async def probe(url: str, required: set[str]) -> str | None:
    try:
        with anyio.fail_after(2):
            async with httpx.AsyncClient(trust_env=False, follow_redirects=False) as client:
                async with streamable_http_client(url, http_client=client) as (read, write, _):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        names = set()
                        cursor = None
                        while True:
                            result = await session.list_tools(cursor=cursor)
                            names.update(tool.name for tool in result.tools)
                            cursor = result.nextCursor
                            if not cursor or required <= names:
                                break
                        if required <= names:
                            return url
    except Exception:
        pass
    return None


async def discover() -> None:
    defaults = {
        "MCP_TOOL_MOVE": "move_velocity", "MCP_TOOL_STOP": "stop_robot",
        "MCP_TOOL_RESET": "reset_pose", "MCP_TOOL_STATE": "get_robot_state",
        "MCP_TOOL_GRIPPER": "set_gripper", "MCP_TOOL_CAPABILITIES": "list_capabilities",
    }
    required = {os.environ.get(key) or value for key, value in defaults.items()}
    try:
        ports = listening_ports()
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"[MCP 检测] 无法获取监听端口：{exc}", file=sys.stderr)
        return
    urls = [f"http://127.0.0.1:{port}/mcp" for port in sorted(ports)]
    results = await asyncio.gather(*(probe(url, required) for url in urls))
    matches = [url for url in results if url]
    if len(matches) == 1:
        print(matches[0])
    elif len(matches) > 1:
        print("[MCP 检测] 发现多个兼容服务，请通过 MCP_HTTP_URL 手动选择：" + ", ".join(matches), file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(discover())
