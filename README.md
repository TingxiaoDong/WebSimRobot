# 网页操控仿真机器人

网页通过本地 FastAPI 后端，使用 Unitree SDK2 Python 的 DDS 接口直接控制 `unitree_sim_isaaclab` 的 Wholebody 任务。浏览器与后端之间的 WebSocket 仅用于推送页面状态。软件停止不是硬件急停。

## 启动

需要 Python 3.10+、Node.js 20+、npm 和 Git。按照 [Unitree SDK2 Python 安装说明](https://github.com/unitreerobotics/unitree_sdk2_python)准备 Cyclone DDS 0.10.2。SDK 和仿真器使用相同的 DDS 协议，请隔离仿真与真机网络及 DDS 域。

```bash
cp .env.example .env
./start.sh
```

首次启动自动安装项目依赖、构建前端，并安装固定版本的 Unitree SDK2 Python；Cyclone DDS 如果无法通过预编译包安装，需要先按 SDK 文档准备系统依赖。完成后打开 <http://127.0.0.1:8000>，点击“连接仿真”获取控制会话。服务在终端前台运行，按 Ctrl+C 停止。

如果 Cyclone DDS 没有适合当前系统和 Python 版本的预编译包，脚本会在项目的 `.venv/cyclonedds` 中编译 0.10.2，并自动设置 `CYCLONEDDS_HOME`。这需要 Git、C 编译器、Python 开发头文件和网络；Ubuntu 可运行 `sudo apt install git build-essential python3-dev python3-venv`，macOS 可通过 `xcode-select --install` 安装编译工具。如果已自行安装兼容的 Cyclone DDS，也可在启动前设置 `CYCLONEDDS_HOME`。

先在仿真机器上启动 Wholebody 任务，例如：

```bash
python sim_main.py --device cpu --enable_cameras --task Isaac-Move-Cylinder-G129-Dex1-Wholebody --robot_type g129 --enable_dex1_dds
```

默认 DDS 域号为 1，与官方仿真器一致。需要指定网卡时，在 `.env` 设置 `UNITREE_NETWORK_INTERFACE`；后端与仿真器需能够通过 DDS 通信。仿真器与机器人使用相同 DDS 消息，部署时应确保命令不会抵达真机。

```dotenv
ROBOT_CONTROL_MODE=sdk
UNITREE_DDS_DOMAIN=1
UNITREE_NETWORK_INTERFACE=
UNITREE_STATE_TIMEOUT=3
HOST=127.0.0.1
PORT=8000
```

项目会等待仿真器 `rt/sim_state` 消息并检查任务名包含 `Wholebody`。状态超过设定时间未更新时停止发送运动并结束控制会话。检测到状态并不保证命令已被仿真器执行；请在仿真界面确认实际动作。

## 控制协议

按照 [官方仿真器说明](https://github.com/unitreerobotics/unitree_sim_isaaclab)和其 `send_commands_keyboard.py`、DDS 代码：

- `rt/run_command/cmd`：以字符串发送 `[x_vel, y_vel, yaw_vel, height]`，停止发送零速度和默认高度。
- `rt/reset_pose/cmd`：发送类别 `1`，请求复位物体。该消息没有执行确认。
- `rt/dex1/left/cmd` 和 `rt/dex1/right/cmd`：为 Dex1 任务发送两侧夹爪位置；需启动 `--enable_dex1_dds`。0 为闭合，1 为张开。
- `rt/sim_state`：读取任务名称和仿真状态，用于判断连接是否仍有消息。

其他手型暂不支持网页夹爪控制。SDK DDS 发布不提供动作执行确认。

## 在网页中查看仿真画面

SDK 的 DDS 控制接口不提供仿真画面。请在运行仿真器的 Linux 主机启动 WebRTC 推流（Unitree 仿真器可在原启动命令中增加 `--no_render`），并单独启动 NVIDIA 浏览器查看器。以下脚本只构建查看器，不会另外启动一个 Isaac Sim：

```bash
ISAACSIM_HOST=仿真主机的局域网IP bash start-viewer.sh
```

该命令需要 Docker、网络和 Node 构建依赖，并使用固定版本的 [NVIDIA 官方查看器 Dockerfile](https://github.com/isaac-sim/IsaacSim/blob/357af4f77dfcd9c64373fe170fc1f5d40dae9351/tools/docker/web-viewer/Dockerfile)。默认端口为查看器 TCP 8210、信令 TCP 49100、媒体 UDP 47998；可分别通过 `WEB_VIEWER_PORT`、`ISAACSIM_SIGNAL_PORT` 和 `ISAACSIM_STREAM_PORT` 配置，并与仿真器配置保持一致。浏览器需要能够访问这些服务；Isaac Sim 需支持 WebRTC 推流及 NVENC。请根据仿真器版本参照 [NVIDIA 推流说明](https://docs.isaacsim.omniverse.nvidia.com/6.0.0/installation/manual_livestream_clients.html)。

在控制台“仿真画面”中输入脚本输出的 `http://仿真主机IP:8210`，点击“打开画面”。若查看器不允许嵌入，可使用“新窗口打开”。查看器和仿真画面连接不代表 DDS 控制已经连接。停止查看器：`docker stop unitree-isaac-viewer`；再次创建前需删除已停止的查看器容器。

## Mock 开发模式

```bash
ROBOT_CONTROL_MODE=mock ./start.sh
```

如果项目目录已有 `.env`，启动脚本加载其中配置；请将文件中的 `ROBOT_CONTROL_MODE` 改成 `mock` 再启动。Mock 不连接仿真器。`.env` 是纯文本键值配置，不支持引号、变量展开或行尾注释。

手动重装及重新构建：`./install.sh`。运行后端测试：`.venv/bin/python -m pytest`。

## Franka 机械臂最小演示

此演示复用已安装 Isaac Sim 和 Isaac Lab 的 conda 环境。需要 Ubuntu 图形桌面、可用的 NVIDIA GPU 和驱动，网页需要 Python 3、Node.js 20+ 和 npm。仿真环境已用 Isaac Sim 5.1 和 Python 3.11 成功启动；资产首次加载需要网络。

在项目目录中，打开两个终端。第一个终端启动仿真：

```bash
conda activate 你的环境名
./start-franka-sim.sh
```

等待出现 `Franka demo ready on 127.0.0.1:8765`。第二个终端启动网页：

```bash
./start-franka-web.sh
```

网页脚本首次运行会创建 `.franka-web-venv` 并安装后端依赖，随后安装前端依赖并构建。打开 <http://127.0.0.1:8000>，切换到“Franka 机械臂”，待状态显示已连接后点击“执行摆动”，在 Isaac Sim 窗口观察动作。网页确认的是指令已入队，动作是否完成应在仿真窗口确认。分别在两个终端按 Ctrl+C 停止。

网页默认监听本机 8000 端口；若被占用，可运行 `FRANKA_WEB_PORT=8001 ./start-franka-web.sh`，然后访问对应端口。仿真和网页默认在同一台电脑运行，控制接口仅监听本机。
