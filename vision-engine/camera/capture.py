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
        target_fps: int = 60,
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

    def start(self) -> "ThreadedCamera":
        """Opens camera and begins background capture thread."""
        logger.info(f"Opening camera index {self.device_index} (Backend: {self.api_preference_str})...")
        self.cap = cv2.VideoCapture(self.device_index, self.backend)
        
        if not self.cap.isOpened():
            # Fallback to default backend
            logger.warning(f"Backend {self.api_preference_str} failed to open camera {self.device_index}, attempting fallback...")
            fallback_backend = cv2.CAP_DSHOW if self.backend == cv2.CAP_MSMF else cv2.CAP_MSMF
            self.cap = cv2.VideoCapture(self.device_index, fallback_backend)
            if not self.cap.isOpened():
                self.cap = cv2.VideoCapture(self.device_index)

        if self.backend == cv2.CAP_DSHOW:
            # For DirectShow on Windows, set FOURCC first
            try:
                self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            except Exception:
                pass

        # Request resolution and target frame rate
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.target_fps)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

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
