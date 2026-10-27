#!/usr/bin/env bash
set -Eeuo pipefail

# Build NVIDIA's browser viewer only; the simulator is started separately.
[[ "$(uname -s)" == Linux ]] || { echo '请在运行仿真器的 Linux 主机执行此脚本。' >&2; exit 1; }
command -v docker >/dev/null || { echo '请先安装 Docker。' >&2; exit 1; }
command -v curl >/dev/null || { echo '请先安装 curl。' >&2; exit 1; }
host="${ISAACSIM_HOST:-}"
[[ "$host" =~ ^[A-Za-z0-9._-]+$ ]] || { echo '请设置 ISAACSIM_HOST 为浏览器可访问的仿真主机 IP 或域名。' >&2; exit 1; }
signal_port="${ISAACSIM_SIGNAL_PORT:-49100}"
stream_port="${ISAACSIM_STREAM_PORT:-47998}"
viewer_port="${WEB_VIEWER_PORT:-8210}"
for port in "$signal_port" "$stream_port" "$viewer_port"; do
  [[ "$port" =~ ^[0-9]+$ ]] && (( 10#$port >= 1 && 10#$port <= 65535 )) || { echo '端口必须在 1 到 65535 之间。' >&2; exit 1; }
done
if docker container inspect unitree-isaac-viewer >/dev/null 2>&1; then
  echo '容器 unitree-isaac-viewer 已存在，请检查该容器后再启动。' >&2
  exit 1
fi
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
curl -fsSL --proto '=https' 'https://raw.githubusercontent.com/isaac-sim/IsaacSim/357af4f77dfcd9c64373fe170fc1f5d40dae9351/tools/docker/web-viewer/Dockerfile' -o "$tmp_dir/Dockerfile"
docker build --network host --build-arg "ISAACSIM_HOST=$host" --build-arg "ISAACSIM_SIGNAL_PORT=$signal_port" --build-arg "ISAACSIM_STREAM_PORT=$stream_port" -t unitree-isaac-viewer "$tmp_dir"
docker run -d --name unitree-isaac-viewer --network host unitree-isaac-viewer npx vite preview --host --port "$viewer_port"
printf '浏览器查看器地址：http://%s:%s\n' "$host" "$viewer_port"
