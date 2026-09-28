"""
Threaded Camera Capture Module.
Implements a non-blocking, zero-lag frame reader using a single-slot buffer
to always deliver the freshest frame to downstream computer vision tasks.
"""

import cv2
import time
import threading
import logging
from typing import Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)

class ThreadedCamera:
    """
    Dedicated thread for video capture to eliminate I/O lag and queue buildup.
    """
    def __init__(
        self,
        device_index: int = 0,
        width: int = 1280,
        height: int = 720,
        target_fps: int = 30,
        api_preference: str = "DSHOW"
    ):
        self.device_index = device_index
        self.width = width
        self.height = height
        self.target_fps = target_fps
        self.api_preference_str = api_preference.upper()
        
        # Select OpenCV Backend
        if self.api_preference_str == "DSHOW":
            self.backend = cv2.CAP_DSHOW
        elif self.api_preference_str == "MSMF":
            self.backend = cv2.CAP_MSMF
        else:
            self.backend = cv2.CAP_ANY

        self.cap: Optional[cv2.VideoCapture] = None
        self.frame: Optional[np.ndarray] = None
        self.frame_timestamp: float = 0.0
        self.frame_id: int = 0
        
        self.is_running: bool = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        self.actual_fps: float = 0.0

    def _try_open(self, index: int, backend: int) -> Optional[cv2.VideoCapture]:
        """Attempts to open a camera index and backend, setting resolution and verifying first frame."""
        cap = None
        try:
            cap = cv2.VideoCapture(index, backend)
            if not cap.isOpened():
                cap.release()
                return None
            
            if backend in (cv2.CAP_DSHOW, cv2.CAP_ANY):
                try:
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                except Exception:
                    pass

            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            cap.set(cv2.CAP_PROP_FPS, self.target_fps)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Test reading frames to confirm stream
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.release()
                return None

            # If requested resolution is 720p/1080p but hardware is capped at <= 13 FPS (USB 2.0 YUY2 bottleneck):
            if self.target_fps >= 25 and self.width >= 1280:
                t0 = time.time()
                for _ in range(3):
                    cap.read()
                elapsed = time.time() - t0
                if elapsed > 0.22:
                    logger.warning(
                        f"Webcam hardware at {self.width}x{self.height} is limited to ~{3.0/elapsed:.1f} FPS "
                        "(hardware USB 2.0 uncompressed bottleneck). Auto-switching to 848x480 (16:9 widescreen) for smooth 30 FPS!"
                    )
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 848)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    self.width = 848
                    self.height = 480

            return cap
        except Exception as e:
            logger.debug(f"Failed opening camera index {index} with backend {backend}: {e}")
            if cap and cap.isOpened():
                cap.release()
            return None

    def start(self) -> "ThreadedCamera":
        """Opens camera and begins background capture thread."""
        logger.info(f"Opening camera index {self.device_index} (Backend: {self.api_preference_str})...")
        
        # 1. Try requested index and backend
        self.cap = self._try_open(self.device_index, self.backend)

        # 2. Try requested index with alternative backends (DSHOW first, then ANY, MSMF)
        if self.cap is None:
            for alt_backend, name in [(cv2.CAP_DSHOW, "DSHOW"), (cv2.CAP_ANY, "ANY"), (cv2.CAP_MSMF, "MSMF")]:
                if alt_backend != self.backend:
                    logger.info(f"Attempting fallback to backend {name} for device index {self.device_index}...")
                    self.cap = self._try_open(self.device_index, alt_backend)
                    if self.cap is not None:
                        self.backend = alt_backend
                        self.api_preference_str = name
                        break

        # 3. If device_index is still not opened, scan other indices [0, 1, 2, 3]
        if self.cap is None:
            logger.warning(f"Could not open camera at index {self.device_index}. Scanning other camera indices...")
            candidates = [i for i in [0, 1, 2, 3] if i != self.device_index]
            for cand in candidates:
                for alt_backend, name in [(cv2.CAP_DSHOW, "DSHOW"), (cv2.CAP_ANY, "ANY")]:
                    logger.info(f"Trying alternative camera index {cand} (Backend: {name})...")
                    self.cap = self._try_open(cand, alt_backend)
                    if self.cap is not None:
                        logger.info(f"Successfully found working camera on index {cand} with backend {name}!")
                        self.device_index = cand
                        self.backend = alt_backend
                        self.api_preference_str = name
                        break
                if self.cap is not None:
                    break

        if self.cap is None or not self.cap.isOpened():
            raise RuntimeError(
                f"Nenhuma webcam funcional foi encontrada nos índices testados. "
                f"Verifique se o cabo USB da câmera está firme, se a câmera não está em uso por outro aplicativo "
                f"(ex: Windows Camera, Zoom, Teams, navegador) e se o Windows permite acesso à câmera em Configurações > Privacidade > Câmera."
            )

        # Query actual negotiated settings
        actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = self.cap.get(cv2.CAP_PROP_FPS)
        logger.info(f"Camera configured: {actual_w}x{actual_h} @ {actual_fps:.1f} FPS (Requested: {self.width}x{self.height} @ {self.target_fps} FPS)")

        self.is_running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True, name="CameraCaptureThread")
        self.thread.start()
        return self

    def _capture_loop(self):
        """Worker loop continuously fetching the newest frame."""
        fps_counter = 0
        fps_timer = time.time()

        while self.is_running and self.cap and self.cap.isOpened():
            ret, raw_frame = self.cap.read()
            if not ret or raw_frame is None:
                time.sleep(0.005)
                continue

            now = time.time()
            fps_counter += 1
            if now - fps_timer >= 1.0:
                self.actual_fps = fps_counter / (now - fps_timer)
                fps_counter = 0
                fps_timer = now

            with self.lock:
                self.frame = raw_frame
                self.frame_timestamp = now
                self.frame_id += 1

    def read(self) -> Tuple[bool, Optional[np.ndarray], float, int]:
        """
        Returns the latest available frame.
        Returns: (success, frame_bgr, timestamp, frame_id)
        """
        with self.lock:
            if self.frame is None:
                return False, None, 0.0, 0
            return True, self.frame.copy(), self.frame_timestamp, self.frame_id

    def stop(self):
        """Stops the thread and releases the hardware device."""
        logger.info("Stopping camera capture thread...")
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        
        if self.cap and self.cap.isOpened():
            self.cap.release()
        logger.info("Camera released.")
