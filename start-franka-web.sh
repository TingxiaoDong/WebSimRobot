#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WEB_ENV="$ROOT_DIR/.franka-web-venv"
PORT="${FRANKA_WEB_PORT:-8000}"
command -v python3 >/dev/null || { echo '请先安装 Python 3。' >&2; exit 1; }
command -v npm >/dev/null || { echo '请先安装 Node.js 20 或更高版本及 npm。' >&2; exit 1; }
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || { echo '需要 Node.js 20 或更高版本。' >&2; exit 1; }
if [[ ! -x "$WEB_ENV/bin/python" ]]; then
  echo '创建网页后端独立 Python 环境。'
  python3 -m venv "$WEB_ENV"
fi
"$WEB_ENV/bin/python" -m pip install -r "$ROOT_DIR/requirements.txt"
(cd "$ROOT_DIR/web" && npm ci && npm run build)
echo "网页地址：http://127.0.0.1:$PORT"
cd "$ROOT_DIR"
export ROBOT_CONTROL_MODE=mock
exec "$WEB_ENV/bin/python" -m uvicorn server.app:app --host 127.0.0.1 --port "$PORT"
