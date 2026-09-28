"""
One Euro Filter Implementation for Landmark Smoothing.
Reference: Casiez, G., Roussel, N. and Vogel, D. (2012).
"1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems".

Provides adaptive filtering: high smoothing when stationary (low jitter)
and low smoothing when moving fast (zero perceptible latency/rubbery effect).
"""

import math
import numpy as np
from typing import Optional, List, Dict, Union

class LowPassFilter:
    """Standard first-order exponential smoothing filter."""
    def __init__(self, alpha: float = 0.5):
        self.alpha = alpha
        self.hat_x_prev: Optional[np.ndarray] = None

    def reset(self):
        self.hat_x_prev = None

    def filter(self, x: np.ndarray, alpha: Optional[float] = None) -> np.ndarray:
        if alpha is not None:
            self.alpha = alpha

        if self.hat_x_prev is None:
            hat_x = np.array(x, dtype=np.float64)
        else:
            hat_x = self.alpha * np.array(x, dtype=np.float64) + (1.0 - self.alpha) * self.hat_x_prev
        
        self.hat_x_prev = hat_x
        return hat_x


class OneEuroFilter:
    """
    One Euro Filter for N-dimensional vectors (e.g. [x, y, z] landmark).
    """
    def __init__(
        self,
        min_cutoff: float = 1.0,
        beta: float = 0.007,
        d_cutoff: float = 1.0
    ):
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        
        self.x_filter = LowPassFilter()
        self.dx_filter = LowPassFilter()
        self.t_prev: Optional[float] = None

    def _smoothing_factor(self, t_e: float, cutoff: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
        r = 2.0 * math.pi * cutoff * t_e
        return r / (r + 1.0)

    def _exponential_smoothing(self, a: Union[float, np.ndarray], x: np.ndarray, x_prev: np.ndarray) -> np.ndarray:
        return a * x + (1.0 - a) * x_prev

    def reset(self):
        self.x_filter.reset()
        self.dx_filter.reset()
        self.t_prev = None

    def filter(self, x: Union[List[float], np.ndarray], timestamp: float) -> np.ndarray:
        """
        Filters input vector x at the given timestamp (seconds).
        """
        x_val = np.array(x, dtype=np.float64)
        
        if self.t_prev is None:
            self.t_prev = timestamp
            self.x_filter.hat_x_prev = x_val
            self.dx_filter.hat_x_prev = np.zeros_like(x_val)
            return x_val

        t_raw = timestamp - self.t_prev
        # Guard against zero or negative delta time
        if t_raw <= 1e-4:
            return self.x_filter.hat_x_prev if self.x_filter.hat_x_prev is not None else x_val
        
        # Clamp delta time to avoid derivative explosion on tiny intervals or runaway on pauses
        t_e = float(np.clip(t_raw, 0.012, 0.12))
        self.t_prev = timestamp

        # Compute signal derivative
        x_prev = self.x_filter.hat_x_prev
        dx = (x_val - x_prev) / t_e

        # Filter derivative
        a_d = self._smoothing_factor(t_e, self.d_cutoff)
        hat_dx = self.dx_filter.filter(dx, a_d)

        # Compute adaptive cutoff frequency with bounded speed
        speed = np.clip(np.abs(hat_dx), 0.0, 20.0)
        cutoff = self.min_cutoff + self.beta * speed

        # Filter main signal with adaptive cutoff
        a = self._smoothing_factor(t_e, cutoff)
        hat_x = self.x_filter.filter(x_val, a)

        return hat_x


class LandmarkSmoother:
    """
    Manages banks of One Euro Filters for 33 full-body landmarks,
    21 left hand landmarks, 21 right hand landmarks, and face landmarks.
    """
    def __init__(self, num_landmarks: int = 33, min_cutoff: float = 1.0, beta: float = 0.007, d_cutoff: float = 1.0):
        self.num_landmarks = num_landmarks
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        
        # Filters for normalized pose coordinates
        self.filters: List[OneEuroFilter] = [
            OneEuroFilter(min_cutoff=min_cutoff, beta=beta, d_cutoff=d_cutoff)
            for _ in range(num_landmarks)
        ]
        # Separate filters for world 3D pose coordinates (meters)
        self.world_filters: List[OneEuroFilter] = [
            OneEuroFilter(min_cutoff=min_cutoff, beta=beta, d_cutoff=d_cutoff)
            for _ in range(num_landmarks)
        ]

        # Filters for 21 Left Hand Landmarks (calibrated for low jitter and fast response)
        self.left_hand_filters: List[OneEuroFilter] = [
            OneEuroFilter(min_cutoff=1.2, beta=0.008, d_cutoff=1.0)
            for _ in range(21)
        ]

        # Filters for 21 Right Hand Landmarks (calibrated for low jitter and fast response)
        self.right_hand_filters: List[OneEuroFilter] = [
            OneEuroFilter(min_cutoff=1.2, beta=0.008, d_cutoff=1.0)
            for _ in range(21)
        ]

        # Filters for Face keypoints
        self.face_filters: List[OneEuroFilter] = [
            OneEuroFilter(min_cutoff=1.2, beta=0.008, d_cutoff=1.0)
            for _ in range(10)
        ]

    def reset(self):
        for f in self.filters:
            f.reset()
        for f in self.world_filters:
            f.reset()
        for f in self.left_hand_filters:
            f.reset()
        for f in self.right_hand_filters:
            f.reset()
        for f in self.face_filters:
            f.reset()

    def smooth(self, landmarks: List[Dict[str, float]], world_landmarks: Optional[List[Dict[str, float]]], timestamp: float):
        """
        Applies filtering to standard normalized landmarks and optional world 3D landmarks.
        """
        if not landmarks or len(landmarks) != self.num_landmarks:
            return landmarks, world_landmarks

        smoothed_norm = []
        for i in range(self.num_landmarks):
            raw = [
                landmarks[i]["x"],
                landmarks[i]["y"],
                landmarks[i]["z"],
                landmarks[i].get("visibility", 1.0)
            ]
            smoothed = self.filters[i].filter(raw, timestamp)
            smoothed_norm.append({
                "x": float(smoothed[0]),
                "y": float(smoothed[1]),
                "z": float(smoothed[2]),
                "visibility": float(smoothed[3])
            })

        smoothed_world = []
        if world_landmarks and len(world_landmarks) == self.num_landmarks:
            for i in range(self.num_landmarks):
                raw = [
                    world_landmarks[i]["x"],
                    world_landmarks[i]["y"],
                    world_landmarks[i]["z"],
                    world_landmarks[i].get("visibility", 1.0)
                ]
                smoothed = self.world_filters[i].filter(raw, timestamp)
                smoothed_world.append({
                    "x": float(smoothed[0]),
                    "y": float(smoothed[1]),
                    "z": float(smoothed[2]),
                    "visibility": float(smoothed[3])
                })
        else:
            smoothed_world = world_landmarks

        return smoothed_norm, smoothed_world

    def smooth_hand(self, hand_landmarks: Optional[List[Dict[str, float]]], side: str, timestamp: float) -> Optional[List[Dict[str, float]]]:
        if not hand_landmarks or len(hand_landmarks) != 21:
            return hand_landmarks

        filters = self.left_hand_filters if side == "left" else self.right_hand_filters
        smoothed_hand = []
        for i in range(21):
            raw = [
                hand_landmarks[i]["x"],
                hand_landmarks[i]["y"],
                hand_landmarks[i]["z"],
                hand_landmarks[i].get("visibility", 1.0)
            ]
            smoothed = filters[i].filter(raw, timestamp)
            smoothed_hand.append({
                "x": float(smoothed[0]),
                "y": float(smoothed[1]),
                "z": float(smoothed[2]),
                "visibility": float(smoothed[3])
            })
        return smoothed_hand

    def smooth_face(self, face_landmarks: Optional[List[Dict[str, float]]], timestamp: float) -> Optional[List[Dict[str, float]]]:
        if not face_landmarks:
            return face_landmarks
        n = min(len(face_landmarks), len(self.face_filters))
        smoothed_face = []
        for i in range(n):
            raw = [
                face_landmarks[i]["x"],
                face_landmarks[i]["y"],
                face_landmarks[i]["z"]
            ]
            smoothed = self.face_filters[i].filter(raw, timestamp)
            smoothed_face.append({
                "x": float(smoothed[0]),
                "y": float(smoothed[1]),
                "z": float(smoothed[2])
            })
        return smoothed_face
