#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[安装] %s\n' "$*"
}

fail() {
  printf '[安装错误] %s\n' "$*" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) log "检测到 Linux，按 Ubuntu/Linux 开发环境安装。" ;;
  Darwin) log "检测到 macOS，按本地开发环境安装。" ;;
  *) fail "当前系统不受支持；请使用 Ubuntu/Linux 或 macOS。" ;;
esac

command -v python3 >/dev/null 2>&1 || fail "未找到 python3。请安装 Python 3.10 或更高版本后重试；脚本不会自动使用 sudo 或修改系统。"
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' || \
  fail "Python 版本过低：需要 3.10 或更高版本。当前为 $(python3 --version 2>&1)。"

command -v node >/dev/null 2>&1 || fail "未找到 node。请安装 Node.js 20 或更高版本后重试；脚本不会自动修改系统。"
node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 20 ? 0 : 1)' || \
  fail "Node.js 版本过低：需要 20 或更高版本。当前为 $(node --version)。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm。请随 Node.js 20 或更高版本安装 npm 后重试。"

[[ -f requirements.txt ]] || fail "根目录缺少 requirements.txt，无法安装后端依赖。"
[[ -f web/package.json ]] || fail "web/ 中缺少 package.json，无法安装前端依赖。"

if [[ ! -d .venv ]]; then
  log "创建 Python 虚拟环境 .venv。"
  python3 -m venv .venv || fail "创建 .venv 失败。Ubuntu 请确认已安装 python3-venv；macOS 请确认 Python 安装完整。"
fi
[[ -x .venv/bin/python ]] || fail ".venv 已存在但不可用；请移走损坏的 .venv 后重新运行。"

log "安装或更新后端依赖。"
.venv/bin/python -m pip install -r requirements.txt

if [[ -f web/package-lock.json ]]; then
  log "检测到 package-lock.json，使用 npm ci 安装前端依赖。"
  (cd web && npm ci)
else
  log "未检测到 package-lock.json，使用 npm install 安装前端依赖。"
  (cd web && npm install)
fi

log "构建前端到 web/dist。"
(cd web && npm run build)
[[ -d web/dist ]] || fail "前端构建命令已结束，但未找到 web/dist。"

log "安装完成。运行 ./start.sh 启动服务。"
