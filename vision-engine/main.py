"""
==============================================================================
HOLOHERO 3D - VISION ENGINE ENTRY POINT
==============================================================================
Orchestrates Camera Capture, MediaPipe Pose Estimation, One Euro Filtering,
Person Segmentation, Integrated Web Server, and Real-Time WebSocket Streaming.
"""

import sys
import os
import time
import yaml
import argparse
import logging
import webbrowser
import threading
from typing import Optional, Dict, Any
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import functools
import cv2
import numpy as np

# Adjust search path to load local packages
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from camera.capture import ThreadedCamera
from pose.pose_estimator import PoseEstimator
from pose.smoothing import LandmarkSmoother
from segmentation.matting import BackgroundMatter
from network.stream_server import StreamServer

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("VisionEngine")

import urllib.parse
import json
import re

def format_model_name(filename: str) -> str:
    """
    Converts a model filename into a clean, human-readable display title.
    """
    name = os.path.splitext(filename)[0]
    name = re.sub(r'^(?:imagetostl\.com[_\-\s]*)+', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[\-_]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    words = name.split(' ')
    capitalized = []
    for w in words:
        if not w:
            continue
        if w.upper() in ['3D', 'MCU', 'MR', 'PBR', 'DC', 'GLB', 'GLTF', 'HD', 'HQ']:
            capitalized.append(w.upper())
        elif w.lower() == 'spiderman':
            capitalized.append('Spider-Man')
        elif w.lower() == 'deadpool':
            capitalized.append('Deadpool')
        else:
            capitalized.append(w.capitalize())
            
    res = ' '.join(capitalized)
    res = res.replace('Spider Man', 'Spider-Man')
    res = res.replace('Dead Pool', 'Deadpool')
    res = res.replace('Spiderverse', 'Spider-Verse')
    res = res.replace('Spider Verse', 'Spider-Verse')
    res = res.replace('Spidermanacross', 'Spider-Man Across')
    return res if res else filename


class ModelServingHTTPHandler(SimpleHTTPRequestHandler):
    """
    Serves 3D web application, /api/models dynamic endpoint, and streams models directly from the Models/ folder.
    """
    models_dir = ""

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/models":
            self.handle_api_models()
            return
        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        elif path.startswith("/models/") or path.startswith("/Models/") or path.startswith("/models_stl/") or path.startswith("/STL/"):
            self.handle_model_file(path)
            return

        super().do_GET()

    def handle_api_models(self):
        models = []
        if os.path.isdir(self.models_dir):
            for f in sorted(os.listdir(self.models_dir)):
                low = f.lower()
                if low.endswith(".glb") or low.endswith(".gltf"):
                    f_path = os.path.join(self.models_dir, f)
                    size_mb = os.path.getsize(f_path) / (1024 * 1024)
                    
                    name = format_model_name(f)
                    
                    tag = "Modelo 3D"
                    if "skeleton" in low or "esqueleto" in low:
                        tag = "Anatômico / Rigged"
                    elif any(k in low for k in ["spider", "miranha", "venom", "goblin", "pool", "kingpin", "mysterio", "prowler", "hero", "flash", "batman", "superman", "iron", "d.va", "dva", "rivals", "fortnite"]):
                        tag = "Super-Herói / Rigged"
                    elif "remy" in low or "mixamo" in low:
                        tag = "Mixamo / Rigged"
                    elif "low" in low or "poly" in low or "meshy" in low:
                        tag = "Low-Poly 3D"
                    elif "character" in low or "caractere" in low:
                        tag = "Guerreiro 3D"
                    else:
                        tag = "Modelo 3D / Rigged"

                    encoded_name = urllib.parse.quote(f)
                    models.append({
                        "id": f,
                        "name": name,
                        "filename": f,
                        "url": f"/models/{encoded_name}",
                        "size": f"{size_mb:.1f} MB",
                        "tag": tag
                    })

        data = json.dumps(models, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_model_file(self, path):
        for prefix in ["/models/", "/Models/", "/models_stl/", "/STL/"]:
            if path.startswith(prefix):
                filename = urllib.parse.unquote(path[len(prefix):])
                break
        else:
            filename = urllib.parse.unquote(os.path.basename(path))

        file_path = os.path.join(self.models_dir, filename)

        if not os.path.isfile(file_path):
            self.send_error(404, "Model file not found")
            return

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "model/gltf-binary" if filename.lower().endswith(".glb") else "model/gltf+json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading model file: {e}")

def start_web_server(web_dir: str, models_dir: str, port: int = 8000) -> Optional[ThreadingHTTPServer]:
    """Starts local HTTP server for the 3D Live Viewer application and Models repository."""
    if not os.path.isdir(web_dir):
        logger.warning(f"Web directory {web_dir} not found. Skipping HTTP server.")
        return None

    ModelServingHTTPHandler.models_dir = models_dir
    handler_factory = functools.partial(ModelServingHTTPHandler, directory=web_dir)
    try:
        httpd = ThreadingHTTPServer(("0.0.0.0", port), handler_factory)
        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True, name="HTTPServerThread")
        server_thread.start()
        logger.info(f"🌐 3D Live Stage Web App is live at: http://127.0.0.1:{port}")
        return httpd
    except Exception as e:
        logger.warning(f"Could not start HTTP server on port {port}: {e}")
        return None

def load_config(config_path: str) -> dict:
    """Loads YAML settings with fallback defaults."""
    if not os.path.exists(config_path):
        logger.warning(f"Configuration file {config_path} not found. Using internal defaults.")
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def main():
    parser = argparse.ArgumentParser(description="HoloHero 3D - Vision Engine")
    parser.add_argument("--config", type=str, default="config/settings.yaml", help="Path to settings.yaml")
    parser.add_argument("--camera", type=int, default=None, help="Camera device index")
    parser.add_argument("--port", type=int, default=None, help="WebSocket port")
    parser.add_argument("--web-port", type=int, default=8000, help="HTTP server port for 3D Live Viewer")
    parser.add_argument("--no-gui", action="store_true", help="Disable OpenCV debug GUI window")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser on launch")
    args = parser.parse_args()

    # Load Config
    config_file_path = os.path.join(os.path.dirname(__file__), args.config)
    config = load_config(config_file_path)

    cam_cfg = config.get("camera", {})
    pose_cfg = config.get("pose", {})
    filter_cfg = config.get("filter", {})
    net_cfg = config.get("network", {})
    debug_cfg = config.get("debug", {})

    device_index = args.camera if args.camera is not None else cam_cfg.get("device_index", 0)
    ws_port = args.port if args.port is not None else net_cfg.get("port", 8765)
    ws_host = net_cfg.get("host", "0.0.0.0")
    show_gui = not args.no_gui and debug_cfg.get("show_preview", True)

    logger.info("==========================================================")
    logger.info("  ⚡ HOLOHERO 3D - VISION ENGINE ⚡  ")
    logger.info("==========================================================")
    logger.info(f"Target Camera Index : {device_index}")
    logger.info(f"WebSocket Endpoint  : ws://127.0.0.1:{ws_port}")
    logger.info(f"Model Complexity    : {pose_cfg.get('model_complexity', 1)}")
    logger.info(f"Debug GUI Window    : {'Enabled' if show_gui else 'Disabled'}")

    # 1. Start Integrated HTTP Server for 3D Web Stage and Models Repository
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    web_app_dir = os.path.join(workspace_root, "render-engine-web")
    models_dir = os.path.join(workspace_root, "Models")
    if not os.path.isdir(models_dir):
        models_dir = os.path.join(workspace_root, "models")
    if not os.path.isdir(models_dir):
        models_dir = os.path.join(workspace_root, "STL")
    httpd = start_web_server(web_app_dir, models_dir=models_dir, port=args.web_port)

    # 2. Auto-open browser if requested
    if not args.no_browser and httpd:
        url = f"http://127.0.0.1:{args.web_port}"
        logger.info(f"Opening browser at {url}...")
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    # 3. Initialize Network WebSocket Stream Server
    server = StreamServer(host=ws_host, port=ws_port)
    server.start()

    # 4. Initialize Pose Estimator
    estimator = PoseEstimator(
        model_complexity=pose_cfg.get("model_complexity", 1),
        smooth_landmarks=pose_cfg.get("smooth_landmarks", True),
        enable_segmentation=pose_cfg.get("enable_segmentation", True),
        smooth_segmentation=pose_cfg.get("smooth_segmentation", True),
        min_detection_confidence=pose_cfg.get("min_detection_confidence", 0.65),
        min_tracking_confidence=pose_cfg.get("min_tracking_confidence", 0.65),
        filter_min_cutoff=filter_cfg.get("min_cutoff", 1.0),
        filter_beta=filter_cfg.get("beta", 0.007),
        filter_d_cutoff=filter_cfg.get("d_cutoff", 1.0)
    )

    # 5. Initialize Threaded Camera Capture
    camera = ThreadedCamera(
        device_index=device_index,
        width=cam_cfg.get("width", 1280),
        height=cam_cfg.get("height", 720),
        target_fps=cam_cfg.get("target_fps", 60),
        api_preference=cam_cfg.get("api_preference", "DSHOW")
    )

    try:
        camera.start()
    except Exception as e:
        logger.error(f"Failed to start camera: {e}")
        server.stop()
        estimator.close()
        if httpd: httpd.shutdown()
        sys.exit(1)

    logger.info("Pipeline initialized. Entering real-time processing loop...")

    # Performance and telemetry variables
    prev_frame_id = -1
    fps_calc_time = time.time()
    fps_counter = 0
    fps_display = 0.0
    latency_ms = 0.0

    try:
        while True:
            t_start = time.time()
            success, frame, frame_ts, frame_id = camera.read()

            if not success or frame is None:
                time.sleep(0.002)
                continue

            if frame_id == prev_frame_id:
                time.sleep(0.001)
                continue

            prev_frame_id = frame_id

            # Mirror camera frame horizontally for natural mirror behavior
            frame = cv2.flip(frame, 1)

            # Process frame with MediaPipe Pose + One Euro Filter
            detected, pose_data, seg_mask = estimator.process(frame, frame_ts)

            # Measure vision processing latency
            t_now = time.time()
            latency_ms = (t_now - t_start) * 1000.0

            # Broadcast Pose Packet to all connected rendering engines
            if detected and pose_data:
                packet = {
                    "type": "POSE_UPDATE",
                    "timestamp": frame_ts,
                    "server_time": t_now,
                    "latency_ms": round(latency_ms, 2),
                    "frame_id": frame_id,
                    "frame_dims": {"width": frame.shape[1], "height": frame.shape[0]},
                    "landmarks": pose_data["landmarks"],
                    "world_landmarks": pose_data["world_landmarks"],
                    "left_hand_landmarks": pose_data.get("left_hand_landmarks"),
                    "right_hand_landmarks": pose_data.get("right_hand_landmarks"),
                    "left_hand_gesture": pose_data.get("left_hand_gesture"),
                    "right_hand_gesture": pose_data.get("right_hand_gesture"),
                    "face_landmarks": pose_data.get("face_landmarks"),
                    "head_orientation": pose_data.get("head_orientation"),
                    "bbox": pose_data["bbox"],
                    "metrics": pose_data["metrics"]
                }
                server.broadcast(packet)
            else:
                # Send empty pose state when user exits FOV
                packet = {
                    "type": "POSE_LOST",
                    "timestamp": frame_ts,
                    "server_time": t_now,
                    "frame_id": frame_id
                }
                server.broadcast(packet)

            # FPS calculation
            fps_counter += 1
            if t_now - fps_calc_time >= 1.0:
                fps_display = fps_counter / (t_now - fps_calc_time)
                fps_counter = 0
                fps_calc_time = t_now

            # Optional Debug GUI Rendering
            if show_gui:
                debug_frame = estimator.draw_skeleton(frame, pose_data) if detected else frame
                
                # Draw telemetry HUD overlay on debug window
                h, w, _ = debug_frame.shape
                cv2.rectangle(debug_frame, (10, 10), (460, 155), (20, 20, 20), -1)
                cv2.rectangle(debug_frame, (10, 10), (460, 155), (0, 215, 255), 1)

                status_text = "PERSON DETECTED" if detected else "SEARCHING FOR HERO..."
                status_color = (0, 255, 0) if detected else (0, 165, 255)
                
                l_gest = pose_data.get("left_hand_gesture", {}).get("gesture", "NONE") if detected and pose_data else "NONE"
                r_gest = pose_data.get("right_hand_gesture", {}).get("gesture", "NONE") if detected and pose_data else "NONE"
                l_fist = pose_data.get("left_hand_gesture", {}).get("fist_score", 0.0) if detected and pose_data else 0.0
                r_fist = pose_data.get("right_hand_gesture", {}).get("fist_score", 0.0) if detected and pose_data else 0.0

                cv2.putText(debug_frame, f"STATUS: {status_text}", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.55, status_color, 2)
                cv2.putText(debug_frame, f"VISION FPS: {fps_display:.1f} | CAM: {camera.actual_fps:.1f}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                cv2.putText(debug_frame, f"HANDS: L:[{l_gest} {int(l_fist*100)}%] | R:[{r_gest} {int(r_fist*100)}%]", (20, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 240, 255), 1)
                cv2.putText(debug_frame, f"LATENCY: {latency_ms:.1f} ms | CLIENTS: {len(server.clients)}", (20, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                cv2.putText(debug_frame, "Web Live Stage: http://127.0.0.1:8000", (20, 135), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 136), 1)

                cv2.imshow(debug_cfg.get("window_name", "HoloHero Vision Engine"), debug_frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27: # 'q' or ESC
                    logger.info("Exit requested via GUI keypress.")
                    break
                elif key == ord('p'):
                    logger.info("Manual power trigger sent to clients!")
                    server.broadcast({
                        "type": "EVENT_POWER_TRIGGER",
                        "effect_id": "cosmic_burst",
                        "timestamp": time.time()
                    })
                elif key == ord('r'):
                    logger.info("Resetting smoothing filters...")
                    estimator.smoother.reset()

    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received.")
    finally:
        logger.info("Shutting down Vision Engine pipeline...")
        camera.stop()
        server.stop()
        estimator.close()
        if httpd:
            httpd.shutdown()
        if show_gui:
            cv2.destroyAllWindows()
        logger.info("HoloHero Vision Engine stopped cleanly.")

if __name__ == "__main__":
    main()
