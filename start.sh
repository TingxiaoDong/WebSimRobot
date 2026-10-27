#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[启动] %s\n' "$*"
}

fail() {
  printf '[启动错误] %s\n' "$*" >&2
  exit 1
}

if [[ ! -d .venv || ! -d web/dist || ! -x .venv/bin/python ]]; then
  log "检测到虚拟环境或前端构建产物缺失，先执行一键安装。"
  bash "$ROOT_DIR/install.sh"
fi

if [[ -f .env ]]; then
  log "加载根目录 .env（按纯文本键值读取，不执行其中的命令）。"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    # 去除行首、行尾空白；空行和整行注释不生效。
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || fail ".env 中存在无效行：$line（应为 KEY=VALUE）。"
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail ".env 中存在无效变量名：$key"
    export "$key=$value"
  done < .env
fi

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8000}"
export ROBOT_CONTROL_MODE="${ROBOT_CONTROL_MODE:-mock}"

[[ "$PORT" =~ ^[0-9]+$ ]] || fail "PORT 必须是 1 到 65535 之间的整数，当前为：$PORT"
(( PORT >= 1 && PORT <= 65535 )) || fail "PORT 必须是 1 到 65535 之间的整数，当前为：$PORT"

# 在启动前尝试绑定地址，端口占用时给出明确错误；随后仍由 uvicorn 前台接管。
if ! .venv/bin/python - "$HOST" "$PORT" <<'PY'
import errno
import socket
import sys

host, port_text = sys.argv[1], sys.argv[2]
port = int(port_text)
try:
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
except socket.gaierror as exc:
    print(f"[启动错误] 无法解析 HOST={host!r}：{exc}", file=sys.stderr)
    raise SystemExit(1)

last_error = None
for family, socktype, proto, _, address in addresses:
    sock = socket.socket(family, socktype, proto)
    try:
        if family == socket.AF_INET6:
            try:
                sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            except OSError:
                pass
        sock.bind(address)
    except OSError as exc:
        last_error = exc
        if exc.errno == errno.EADDRINUSE:
            print(f"[启动错误] 地址 {host}:{port} 已被占用。请停止占用该端口的进程，或设置其他 PORT 后重试。", file=sys.stderr)
            raise SystemExit(1)
    finally:
        sock.close()
else:
    if last_error is not None:
        print(f"[启动错误] 无法绑定 {host}:{port}：{last_error}", file=sys.stderr)
        raise SystemExit(1)
PY
then
  exit 1
fi

log "以 ${ROBOT_CONTROL_MODE} 模式启动：http://${HOST}:${PORT}"
log "服务在前台运行；按 Ctrl+C 停止，不会留下后台进程。"
exec .venv/bin/python -m uvicorn server.app:app --host "$HOST" --port "$PORT"
