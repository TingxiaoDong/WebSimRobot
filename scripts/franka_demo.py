"""Run with Isaac Lab's Python: ./isaaclab.sh -p /path/to/franka_demo.py"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import queue
import threading

from isaaclab.app import AppLauncher

parser = argparse.ArgumentParser(description="Franka web-control demo")
parser.add_argument("--port", type=int, default=8765)
AppLauncher.add_app_launcher_args(parser)
args = parser.parse_args()
launcher = AppLauncher(args)
app = launcher.app

import torch
import isaaclab.sim as sim_utils
from isaaclab.assets import AssetBaseCfg
from isaaclab.scene import InteractiveScene, InteractiveSceneCfg
from isaaclab.utils import configclass
from isaaclab_assets import FRANKA_PANDA_HIGH_PD_CFG

commands = queue.Queue(maxsize=1)


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/status":
            self.reply(200, {"connected": True})
        else:
            self.reply(404, {"detail": "Not found"})

    def do_POST(self):
        if self.path != "/wave":
            self.reply(404, {"detail": "Not found"})
            return
        try:
            commands.put_nowait("wave")
        except queue.Full:
            pass
        self.reply(202, {"status": "queued"})

    def log_message(self, *_args):
        pass


@configclass
class SceneCfg(InteractiveSceneCfg):
    ground = AssetBaseCfg(prim_path="/World/ground", spawn=sim_utils.GroundPlaneCfg())
    light = AssetBaseCfg(prim_path="/World/light", spawn=sim_utils.DomeLightCfg(intensity=3000.0))
    robot = FRANKA_PANDA_HIGH_PD_CFG.replace(prim_path="{ENV_REGEX_NS}/Robot")


def main():
    sim = sim_utils.SimulationContext(sim_utils.SimulationCfg(dt=0.01))
    sim.set_camera_view([2.0, 2.0, 1.5], [0.0, 0.0, 0.5])
    scene = InteractiveScene(SceneCfg(num_envs=1, env_spacing=2.0))
    sim.reset()
    robot = scene["robot"]
    joint_ids, _ = robot.find_joints(["panda_joint1"])
    home = robot.data.default_joint_pos.clone()
    robot.write_joint_state_to_sim(home, torch.zeros_like(home))
    scene.reset()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Franka demo ready on 127.0.0.1:{args.port}", flush=True)
    step = None
    try:
        while app.is_running():
            try:
                commands.get_nowait()
                step = 0
            except queue.Empty:
                pass
            target = home.clone()
            if step is not None:
                # A smooth 4-second sweep that returns to the initial pose.
                target[:, joint_ids] += 0.45 * torch.sin(torch.tensor(step * 2 * torch.pi / 200, device=sim.device))
                step += 1
                if step >= 400:
                    step = None
            robot.set_joint_position_target(target)
            scene.write_data_to_sim()
            sim.step()
            scene.update(sim.get_physics_dt())
    finally:
        server.shutdown()
        server.server_close()
        app.close()


if __name__ == "__main__":
    main()
