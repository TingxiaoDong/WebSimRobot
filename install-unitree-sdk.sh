#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
export PATH="$ROOT_DIR/.venv/bin:$PATH"
sdk='unitree-sdk2py @ git+https://github.com/unitreerobotics/unitree_sdk2_python.git@814556d15970dd2ecf1c9984e845ca02ab07e206'
if [[ -f "$ROOT_DIR/.venv/cyclonedds/lib/cmake/CycloneDDS/CycloneDDSConfig.cmake" && -z "${CYCLONEDDS_HOME:-}" ]]; then
  export CYCLONEDDS_HOME="$ROOT_DIR/.venv/cyclonedds"
fi
if .venv/bin/python -c 'import unitree_sdk2py.core.channel' >/dev/null 2>&1; then
  exit 0
fi
echo '[SDK 安装] 尝试安装 Unitree SDK2。'
if .venv/bin/python -m pip install "$sdk" && .venv/bin/python -c 'import unitree_sdk2py.core.channel'; then
  exit 0
fi
if [[ -n "${CYCLONEDDS_HOME:-}" ]]; then
  echo '[SDK 安装错误] 使用指定的 CYCLONEDDS_HOME 安装失败，请检查版本与路径。' >&2
  exit 1
fi
command -v git >/dev/null || { echo '[SDK 安装错误] 请先安装 Git。' >&2; exit 1; }
command -v cc >/dev/null && command -v make >/dev/null || { echo '[SDK 安装错误] 缺少 C 编译工具。Ubuntu 可运行 sudo apt install build-essential python3-dev；macOS 可运行 xcode-select --install。' >&2; exit 1; }
echo '[SDK 安装] 编译 Cyclone DDS 0.10.2 到项目虚拟环境。'
.venv/bin/python -m pip install 'cmake>=3.16,<4'
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
git clone --quiet --depth 1 --branch 0.10.2 https://github.com/eclipse-cyclonedds/cyclonedds.git "$tmp_dir/source"
export CYCLONEDDS_HOME="$ROOT_DIR/.venv/cyclonedds"
.venv/bin/cmake -S "$tmp_dir/source" -B "$tmp_dir/build" -DCMAKE_INSTALL_PREFIX="$CYCLONEDDS_HOME" -DBUILD_TESTING=OFF -DBUILD_EXAMPLES=OFF -DENABLE_SSL=OFF -DENABLE_SECURITY=OFF
.venv/bin/cmake --build "$tmp_dir/build" --target install -j 4
.venv/bin/python -m pip install --no-cache-dir "$sdk"
.venv/bin/python -c 'import unitree_sdk2py.core.channel; print("[SDK 安装] Unitree SDK2 和 Cyclone DDS 导入成功。")'
