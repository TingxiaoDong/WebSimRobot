#!/usr/bin/env bash
set -Eeuo pipefail

printf '%s\n' \
  '服务由 start.sh 以前台方式运行：请在运行服务的终端按 Ctrl+C 停止。' \
  '本项目不创建 PID 文件，也不会使用 pkill 等方式模糊结束其他进程。'
