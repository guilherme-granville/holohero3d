"""
High-Precision Hand Gesture & Biometrics Analyzer.
Calculates finger curl ratios, fist confidence, palm normal orientation,
and recognized gesture classification with temporal hysteresis.
"""

import math
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

class HandGestureAnalyzer:
    """
    Analyzes 21 MediaPipe hand landmarks to extract:
    - Individual finger curl ratios (0.0 = fully open, 1.0 = fully closed fist)
    - Fist / Clenched Hand confidence and boolean
    - Open Palm confidence
    - Hand Gestures: FIST, OPEN_PALM, POINTING, VICTORY, THUMBS_UP, ROCK, PINCH, NEUTRAL
    - 3D Palm Normal vector & wrist orientation
    """
    def __init__(self):
        # Hysteresis state memory
        self.prev_is_fist = {"left": False, "right": False}
        self.prev_gesture = {"left": "NEUTRAL", "right": "NEUTRAL"}
        self.gesture_hold_count = {"left": 0, "right": 0}

    @staticmethod
    def _dist(p1: Dict[str, float], p2: Dict[str, float]) -> float:
        """Euclidean distance in 3D (or 2D fallback)."""
        dx = p1["x"] - p2["x"]
        dy = p1["y"] - p2["y"]
        dz = (p1.get("z", 0.0) - p2.get("z", 0.0)) * 0.8 # Scale Z slightly for normalized coords
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    @staticmethod
    def _angle(v1: np.ndarray, v2: np.ndarray) -> float:
        """Angle between two vectors in radians."""
        n1 = np.linalg.norm(v1)
        n2 = np.linalg.norm(v2)
        if n1 < 1e-6 or n2 < 1e-6:
            return 0.0
        cos_val = np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0)
        return math.acos(cos_val)

    def analyze_hand(self, landmarks: List[Dict[str, float]], side: str = "right") -> Dict[str, Any]:
        """
        Analyzes a single hand (21 landmarks) and returns detailed biometric metrics.
        """
        if not landmarks or len(landmarks) < 21:
            return {
                "detected": False,
                "is_fist": False,
                "fist_score": 0.0,
                "is_open": False,
                "open_score": 0.0,
                "gesture": "UNKNOWN",
                "curls": {"thumb": 0.0, "index": 0.0, "middle": 0.0, "ring": 0.0, "pinky": 0.0},
                "pinch_dist": 1.0,
                "palm_normal": {"x": 0.0, "y": 0.0, "z": -1.0}
            }

        wrist = landmarks[0]
        thumb_cmc = landmarks[1]
        thumb_mcp = landmarks[2]
        thumb_ip  = landmarks[3]
        thumb_tip = landmarks[4]

        index_mcp = landmarks[5]
        index_pip = landmarks[6]
        index_dip = landmarks[7]
        index_tip = landmarks[8]

        mid_mcp   = landmarks[9]
        mid_pip   = landmarks[10]
        mid_dip   = landmarks[11]
        mid_tip   = landmarks[12]

        ring_mcp  = landmarks[13]
        ring_pip  = landmarks[14]
        ring_dip  = landmarks[15]
        ring_tip  = landmarks[16]

        pinky_mcp = landmarks[17]
        pinky_pip = landmarks[18]
        pinky_dip = landmarks[19]
        pinky_tip = landmarks[20]

        # 1. Palm Scale Reference (Wrist to Middle Knuckle MCP)
        palm_size = max(0.001, self._dist(wrist, mid_mcp))

        # Helper to compute finger curl ratio (0.0 = extended, 1.0 = curled into fist)
        def compute_finger_curl(mcp, pip, dip, tip) -> float:
            # Metric A: Tip distance to MCP normalized by bone length (MCP->PIP)
            mcp_pip_len = max(0.001, self._dist(mcp, pip))
            tip_mcp_dist = self._dist(tip, mcp)
            ratio_mcp = tip_mcp_dist / (mcp_pip_len * 2.2) # ~1.0 when open, ~0.25 when closed

            # Metric B: Tip distance to Wrist vs MCP distance to Wrist
            tip_wrist_dist = self._dist(tip, wrist)
            mcp_wrist_dist = self._dist(mcp, wrist)
            ratio_wrist = tip_wrist_dist / (mcp_wrist_dist + 0.001)

            # Metric C: Joint angles (MCP->PIP vs DIP->TIP)
            v_prox = np.array([pip["x"] - mcp["x"], pip["y"] - mcp["y"], (pip.get("z", 0.0) - mcp.get("z", 0.0))])
            v_dist = np.array([tip["x"] - dip["x"], tip["y"] - dip["y"], (tip.get("z", 0.0) - dip.get("z", 0.0))])
            flex_angle = self._angle(v_prox, v_dist) # 0 rad when straight, ~pi when folded

            # Combined Curl Score (0.0 to 1.0)
            curl_ext = 1.0 - np.clip(ratio_mcp, 0.0, 1.0)
            curl_wrist = 1.0 - np.clip((ratio_wrist - 0.7) / 0.8, 0.0, 1.0)
            curl_angle = np.clip(flex_angle / 2.6, 0.0, 1.0)

            curl_final = (curl_ext * 0.45) + (curl_wrist * 0.25) + (curl_angle * 0.30)
            return float(np.clip(curl_final, 0.0, 1.0))

        index_curl = compute_finger_curl(index_mcp, index_pip, index_dip, index_tip)
        mid_curl   = compute_finger_curl(mid_mcp, mid_pip, mid_dip, mid_tip)
        ring_curl  = compute_finger_curl(ring_mcp, ring_pip, ring_dip, ring_tip)
        pinky_curl = compute_finger_curl(pinky_mcp, pinky_pip, pinky_dip, pinky_tip)

        # Thumb Curl calculation
        thumb_tip_to_pinky_mcp = self._dist(thumb_tip, pinky_mcp) / palm_size
        thumb_tip_to_index_mcp = self._dist(thumb_tip, index_mcp) / palm_size
        thumb_tip_to_wrist     = self._dist(thumb_tip, wrist) / palm_size

        v_t_prox = np.array([thumb_mcp["x"] - thumb_cmc["x"], thumb_mcp["y"] - thumb_cmc["y"], 0])
        v_t_dist = np.array([thumb_tip["x"] - thumb_ip["x"], thumb_tip["y"] - thumb_ip["y"], 0])
        thumb_angle = self._angle(v_t_prox, v_t_dist)

        thumb_curl_raw = 1.0 - np.clip((thumb_tip_to_pinky_mcp - 0.35) / 0.75, 0.0, 1.0) * 0.6 \
                         - np.clip((thumb_tip_to_wrist - 0.4) / 0.6, 0.0, 1.0) * 0.4
        thumb_curl = float(np.clip(thumb_curl_raw + (thumb_angle / math.pi) * 0.3, 0.0, 1.0))

        curls = {
            "thumb": round(thumb_curl, 3),
            "index": round(index_curl, 3),
            "middle": round(mid_curl, 3),
            "ring": round(ring_curl, 3),
            "pinky": round(pinky_curl, 3)
        }

        # 2. Fist Score & Classification
        # 4 main fingers carry 85% of fist weight
        four_finger_avg = (index_curl + mid_curl + ring_curl + pinky_curl) * 0.25
        min_four_finger = min(index_curl, mid_curl, ring_curl, pinky_curl)
        fist_score = float(np.clip((four_finger_avg * 0.6) + (min_four_finger * 0.3) + (thumb_curl * 0.1), 0.0, 1.0))

        # Fist Hysteresis
        fist_thresh_enter = 0.62
        fist_thresh_exit  = 0.45
        was_fist = self.prev_is_fist.get(side, False)
        if was_fist:
            is_fist = fist_score > fist_thresh_exit
        else:
            is_fist = fist_score > fist_thresh_enter
        self.prev_is_fist[side] = is_fist

        # 3. Open Palm Score
        open_score = float(np.clip(1.0 - four_finger_avg, 0.0, 1.0))
        is_open = (four_finger_avg < 0.28) and (thumb_curl < 0.45)

        # 4. Pinch & Finger Contact Detection
        pinch_dist = float(self._dist(thumb_tip, index_tip) / palm_size)
        is_pinch = pinch_dist < 0.30

        dist_thumb_middle = float(self._dist(thumb_tip, mid_tip) / palm_size)
        dist_index_middle = float(self._dist(index_tip, mid_tip) / palm_size)
        dist_middle_ring  = float(self._dist(mid_tip, ring_tip) / palm_size)
        dist_ring_pinky   = float(self._dist(ring_tip, pinky_tip) / palm_size)

        finger_spreads = {
            "thumb_index": round(pinch_dist, 3),
            "thumb_middle": round(dist_thumb_middle, 3),
            "index_middle": round(dist_index_middle, 3),
            "middle_ring": round(dist_middle_ring, 3),
            "ring_pinky": round(dist_ring_pinky, 3)
        }

        # 5. Gesture Recognition
        # Thumbs up check: thumb pointing up (negative Y in screen coords), 4 fingers closed
        thumb_dir_y = thumb_tip["y"] - thumb_mcp["y"]
        is_thumbs_up = (thumb_dir_y < -0.04) and (thumb_curl < 0.35) and (four_finger_avg > 0.55)

        # Pointing: Index extended, others closed
        is_pointing = (index_curl < 0.30) and (mid_curl > 0.55) and (ring_curl > 0.55) and (pinky_curl > 0.55)

        # Victory / Peace: Index + Middle extended, others closed
        is_victory = (index_curl < 0.32) and (mid_curl < 0.32) and (ring_curl > 0.55) and (pinky_curl > 0.55)

        # Rock / Horns: Index + Pinky extended, Middle + Ring closed
        is_rock = (index_curl < 0.35) and (pinky_curl < 0.35) and (mid_curl > 0.55) and (ring_curl > 0.55)

        if is_fist:
            gesture = "FIST"
        elif is_thumbs_up:
            gesture = "THUMBS_UP"
        elif is_pointing:
            gesture = "POINTING"
        elif is_victory:
            gesture = "VICTORY"
        elif is_rock:
            gesture = "ROCK"
        elif is_pinch:
            gesture = "PINCH"
        elif is_open:
            gesture = "OPEN_PALM"
        else:
            gesture = "NEUTRAL"

        # 6. Compute 3D Palm Normal & Orientation Vector
        p_wrist = np.array([wrist["x"], wrist["y"], wrist.get("z", 0.0)])
        p_index = np.array([index_mcp["x"], index_mcp["y"], index_mcp.get("z", 0.0)])
        p_pinky = np.array([pinky_mcp["x"], pinky_mcp["y"], pinky_mcp.get("z", 0.0)])
        p_middle = np.array([mid_mcp["x"], mid_mcp["y"], mid_mcp.get("z", 0.0)])

        v_forward = p_middle - p_wrist
        v_side = p_index - p_pinky
        norm_f = np.linalg.norm(v_forward)
        norm_s = np.linalg.norm(v_side)

        if norm_f > 1e-5 and norm_s > 1e-5:
            v_forward = v_forward / norm_f
            v_side = v_side / norm_s
            palm_normal = np.cross(v_forward, v_side)
            norm_pn = np.linalg.norm(palm_normal)
            if norm_pn > 1e-5:
                palm_normal = palm_normal / norm_pn
            else:
                palm_normal = np.array([0.0, 0.0, -1.0])
        else:
            palm_normal = np.array([0.0, 0.0, -1.0])

        return {
            "detected": True,
            "side": side,
            "is_fist": bool(is_fist),
            "fist_score": round(fist_score, 3),
            "is_open": bool(is_open),
            "open_score": round(open_score, 3),
            "is_pinch": bool(is_pinch),
            "pinch_dist": round(pinch_dist, 3),
            "finger_spreads": finger_spreads,
            "gesture": gesture,
            "curls": curls,
            "palm_normal": {
                "x": round(float(palm_normal[0]), 3),
                "y": round(float(palm_normal[1]), 3),
                "z": round(float(palm_normal[2]), 3)
            }
        }
