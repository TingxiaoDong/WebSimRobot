#!/usr/bin/env bash
# Install a separate Isaac Lab environment and start the Franka demo on Ubuntu x86-64.
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${FRANKA_INSTALL_DIR:-$ROOT_DIR/.franka}"
LAB_DIR="$WORK_DIR/IsaacLab"
ENV_DIR="$WORK_DIR/env"
NODE_DIR="$WORK_DIR/node"
WEB_PORT="${FRANKA_WEB_PORT:-8000}"
log() { printf '\n[Franka] %s\n' "$*"; }
fail() { printf '\n[Franka 错误] %s\n' "$*" >&2; exit 1; }
trap 'fail "安装或启动失败（第 ${LINENO} 行）。请检查上方最早的错误信息，修复后重新运行。"' ERR
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || fail '此脚本仅支持 Ubuntu x86_64；需要 NVIDIA RTX GPU。'
[[ -r /etc/os-release ]] || fail '无法识别操作系统。'
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || fail '此脚本仅支持 Ubuntu 22.04 或 24.04。'
[[ "${VERSION_ID:-}" == 22.04 || "${VERSION_ID:-}" == 24.04 ]] || fail '需要 Ubuntu 22.04 或 24.04。'
command -v nvidia-smi >/dev/null && nvidia-smi || fail '未检测到可用的 NVIDIA 驱动和 GPU。请先安装驱动并确认 nvidia-smi 可用。'
[[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] || fail '请在 Ubuntu 图形桌面中运行，以便显示 Isaac Sim 窗口。'
mkdir -p "$WORK_DIR"
available_kb=$(df -Pk "$WORK_DIR" | awk 'NR==2 {print $4}')
(( available_kb >= 52428800 )) || fail '安装目录至少需要 50 GB 可用空间。可通过 FRANKA_INSTALL_DIR 指定其他目录。'
log '安装系统构建依赖（可能要求输入 sudo 密码）。'
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential cmake libgl1 libglib2.0-0
if ! command -v uv >/dev/null; then
  log '安装 uv（用户目录）。'
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
command -v uv >/dev/null || fail '未找到 uv，请检查安装日志。'
if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  log '下载 Node.js 22。'
  node_archive="$WORK_DIR/node-v22.15.0-linux-x64.tar.xz"
  curl -fL --retry 3 -o "$node_archive" https://nodejs.org/dist/v22.15.0/node-v22.15.0-linux-x64.tar.xz
  mkdir -p "$NODE_DIR"
  tar -xJf "$node_archive" --strip-components=1 -C "$NODE_DIR"
  rm "$node_archive"
fi
export PATH="$NODE_DIR/bin:$PATH"
if [[ ! -d "$LAB_DIR/.git" ]]; then
  [[ ! -e "$LAB_DIR" ]] || fail "$LAB_DIR 已存在且不是 Git 仓库，请更换 FRANKA_INSTALL_DIR。"
  log '下载 Isaac Lab v2.3.2。'
  git clone --depth 1 --branch v2.3.2 https://github.com/isaac-sim/IsaacLab.git "$LAB_DIR"
fi
[[ "$(git -C "$LAB_DIR" describe --tags --exact-match 2>/dev/null || true)" == v2.3.2 ]] || fail 'Isaac Lab 目录不是 v2.3.2，请使用新的 FRANKA_INSTALL_DIR。'
if [[ ! -f "$WORK_DIR/installed-v2.3.2" ]]; then
  log '安装 Python 3.11、Isaac Sim 5.1 和 Isaac Lab；首次下载可能需要较长时间。'
  uv venv --python 3.11 --seed "$ENV_DIR"
  # Isaac Lab's installer selects the activated Python environment.
  source "$ENV_DIR/bin/activate"
  python -m pip install --upgrade pip
  python -m pip install 'isaacsim[all,extscache]==5.1.0' --extra-index-url https://pypi.nvidia.com
  python -m pip install -U torch==2.7.0 torchvision==0.22.0 --index-url https://download.pytorch.org/whl/cu128
  (cd "$LAB_DIR" && ./isaaclab.sh -i none)
  python -m pip install -r "$ROOT_DIR/requirements.txt"
  touch "$WORK_DIR/installed-v2.3.2"
else
  source "$ENV_DIR/bin/activate"
fi
log '安装网页依赖并构建。'
(cd "$ROOT_DIR/web" && npm ci && npm run build)
log "启动网页：http://127.0.0.1:$WEB_PORT"
# Explicitly select mock Unitree mode; no Unitree DDS is needed for Franka.
(cd "$ROOT_DIR" && ROBOT_CONTROL_MODE=mock python -m uvicorn server.app:app --host 127.0.0.1 --port "$WEB_PORT") &
web_pid=$!
cleanup() { kill "$web_pid" 2>/dev/null || true; wait "$web_pid" 2>/dev/null || true; }
trap cleanup EXIT
for _ in {1..50}; do
  kill -0 "$web_pid" 2>/dev/null || fail '网页服务未能启动，请检查端口是否已被占用。'
  if curl -fsS "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null; then break; fi
  sleep 0.2
done
kill -0 "$web_pid" 2>/dev/null || fail '网页服务已退出。'
log '启动 Isaac Sim。首次启动可能需要下载资源并提示接受 NVIDIA 许可。'
log '打开上述网址，切换到 Franka 页面。关闭仿真窗口或按 Ctrl+C 可退出。'
(cd "$LAB_DIR" && ./isaaclab.sh -p "$ROOT_DIR/scripts/franka_demo.py" "$@")
