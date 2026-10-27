#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${CONDA_PREFIX:-}" ]]; then
  printf '%s\n' '请先运行 conda activate <包含 Isaac Sim 和 Isaac Lab 的环境名>。' >&2
  exit 1
fi
exec python "$ROOT_DIR/scripts/franka_demo.py" "$@"
