"""
Advanced Dual-Engine Pose & Hand Estimator.
Combines MediaPipe Pose/Holistic with dedicated MediaPipe Hands (21 3D landmarks per hand)
and High-Precision Hand Gesture & Fist Biometrics Analysis.
"""

import cv2
import numpy as np
import mediapipe as mp
import time
import math
from typing import Optional, Dict, Any, List, Tuple
import logging

from pose.smoothing import LandmarkSmoother
from pose.hand_gesture import HandGestureAnalyzer

logger = logging.getLogger(__name__)

# Standard 33 MediaPipe Pose Landmark Names
LANDMARK_NAMES = [
    "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER",
    "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER",
    "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
    "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST",
    "LEFT_PINKY", "RIGHT_PINKY",
    "LEFT_INDEX", "RIGHT_INDEX",
    "LEFT_THUMB", "RIGHT_THUMB",
    "LEFT_HIP", "RIGHT_HIP",
    "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE",
    "LEFT_HEEL", "RIGHT_HEEL",
    "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX"
]

class PoseEstimator:
    """
    State-of-the-Art Dual Tracking Engine:
    - Full-body kinematics via MediaPipe Pose (33 3D world + normalized landmarks)
    - Dedicated High-Resolution MediaPipe Hands (21 3D landmarks per hand) for robust closed fists, pinches, and gestures
    - Geometric wrist association and velocity-adaptive One Euro temporal filtering
    """
    def __init__(
        self,
        model_complexity: int = 1,
        smooth_landmarks: bool = True,
        enable_segmentation: bool = False,
        smooth_segmentation: bool = False,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        filter_min_cutoff: float = 1.2,
        filter_beta: float = 0.02,
        filter_d_cutoff: float = 1.0
    ):
        self.model_complexity = model_complexity
        self.enable_segmentation = enable_segmentation
        
        # 1. Unified MediaPipe Holistic Solution (Body Pose + Native Wrist-ROI Hand Cropping)
        self.mp_holistic = mp.solutions.holistic
        self.holistic = self.mp_holistic.Holistic(
            static_image_mode=False,
            model_complexity=model_complexity,
            smooth_landmarks=smooth_landmarks,
            enable_segmentation=enable_segmentation,
            smooth_segmentation=smooth_segmentation,
            refine_face_landmarks=False,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )

        # 2. Gesture & Biometrics Analyzer
        self.gesture_analyzer = HandGestureAnalyzer()

        # 3. Adaptive One Euro Landmark Filter Banks
        self.smoother = LandmarkSmoother(
            num_landmarks=33,
            min_cutoff=filter_min_cutoff,
            beta=filter_beta,
            d_cutoff=filter_d_cutoff
        )
        self.lost_frames = 0

        self.mp_drawing = mp.solutions.drawing_utils

    def _estimate_fallback_gesture(self, landmarks: List[Dict[str, float]], side: str) -> Dict[str, Any]:
        """Estimates basic fist vs open hand gesture directly from 33 body pose landmarks when at distance."""
        is_left = (side == "left")
        w_idx = 15 if is_left else 16
        i_idx = 19 if is_left else 20
        e_idx = 13 if is_left else 14

        is_fist = False
        fist_score = 0.0
        curls = {"thumb": 0.0, "index": 0.0, "middle": 0.0, "ring": 0.0, "pinky": 0.0}

        if len(landmarks) > max(w_idx, i_idx, e_idx):
            w = landmarks[w_idx]
            i = landmarks[i_idx]
            e = landmarks[e_idx]

            # Forearm length reference (elbow to wrist)
            forearm = math.hypot(w["x"] - e["x"], w["y"] - e["y"])
            # Hand extension (wrist to index finger tip)
            hand_ext = math.hypot(i["x"] - w["x"], i["y"] - w["y"])

            if forearm > 0.01:
                ratio = hand_ext / forearm
                # When open, ratio is ~0.35-0.45; when curled into fist, ratio drops to ~0.15-0.22
                fist_score = float(np.clip(1.0 - (ratio - 0.16) / 0.18, 0.0, 1.0))
                is_fist = fist_score > 0.55
                for k in curls:
                    curls[k] = fist_score

        return {
            "detected": False,
            "is_fist": is_fist,
            "fist_score": fist_score,
            "is_open": not is_fist,
            "open_score": 1.0 - fist_score,
            "gesture": "FIST" if is_fist else "NEUTRAL",
            "curls": curls,
            "pinch_dist": 1.0,
            "palm_normal": {"x": 0.0, "y": 0.0, "z": -1.0}
        }

    def process(
        self,
        frame_bgr: np.ndarray,
        timestamp: float,
        roi: Optional[Tuple[float, float, float, float]] = None
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[np.ndarray]]:
        """
        Processes a video frame with MediaPipe Holistic tracking and returns:
        (detected, pose_data_dict, segmentation_mask)
        Supports optional ROI parameter (min_x, min_y, max_x, max_y) to isolate and track a specific person.
        """
        h, w = frame_bgr.shape[:2]

        # Calculate crop coordinates if an ROI is specified
        scale_x, scale_y = 1.0, 1.0
        offset_x, offset_y = 0.0, 0.0

        if roi is not None:
            min_x, min_y, max_x, max_y = roi
            rx1 = max(0, int(min_x * w))
            ry1 = max(0, int(min_y * h))
            rx2 = min(w, int(max_x * w))
            ry2 = min(h, int(max_y * h))

            crop_w = rx2 - rx1
            crop_h = ry2 - ry1
            if crop_w >= 50 and crop_h >= 50:
                target_bgr = frame_bgr[ry1:ry2, rx1:rx2]
                scale_x = crop_w / float(w)
                scale_y = crop_h / float(h)
                offset_x = rx1 / float(w)
                offset_y = ry1 / float(h)
            else:
                target_bgr = frame_bgr
        else:
            target_bgr = frame_bgr

        # Optimal inference downsampling to 960px width for fast 45-60 FPS tracking
        th, tw = target_bgr.shape[:2]
        if tw > 960:
            target_w = 960
            target_h = int(th * (960.0 / tw))
            small_bgr = cv2.resize(target_bgr, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
            frame_rgb = cv2.cvtColor(small_bgr, cv2.COLOR_BGR2RGB)
        else:
            frame_rgb = cv2.cvtColor(target_bgr, cv2.COLOR_BGR2RGB)

        frame_rgb.flags.writeable = False

        # Run single unified Holistic inference (Body pose + Automatic Wrist-ROI Hand Cropping)
        results = self.holistic.process(frame_rgb)

        frame_rgb.flags.writeable = True

        if not results.pose_landmarks:
            self.lost_frames += 1
            if self.lost_frames > 15:
                self.smoother.reset()
            return False, None, None

        self.lost_frames = 0

        # 1. Extract 33 Body Pose Landmarks mapped to full frame
        raw_landmarks = []
        for lm in results.pose_landmarks.landmark:
            raw_landmarks.append({
                "x": float(offset_x + lm.x * scale_x),
                "y": float(offset_y + lm.y * scale_y),
                "z": float(lm.z * scale_x),
                "visibility": float(lm.visibility)
            })

        # 2. Extract 3D World Landmarks (metric coordinates centered at hips)
        raw_world_landmarks = []
        if results.pose_world_landmarks:
            for wlm in results.pose_world_landmarks.landmark:
                raw_world_landmarks.append({
                    "x": float(wlm.x),
                    "y": float(wlm.y),
                    "z": float(wlm.z),
                    "visibility": float(wlm.visibility)
                })

        # Apply One Euro Filtering to Body Pose
        smooth_landmarks, smooth_world_landmarks = self.smoother.smooth(
            raw_landmarks, raw_world_landmarks, timestamp
        )

        # 3. Dedicated Hands from Holistic (Native Crop-ROI Tracking)
        raw_left_hand: Optional[List[Dict[str, float]]] = None
        raw_right_hand: Optional[List[Dict[str, float]]] = None

        if results.left_hand_landmarks:
            raw_left_hand = [
                {"x": float(offset_x + lm.x * scale_x), "y": float(offset_y + lm.y * scale_y), "z": float(lm.z * scale_x), "visibility": float(getattr(lm, "visibility", 1.0))}
                for lm in results.left_hand_landmarks.landmark
            ]

        if results.right_hand_landmarks:
            raw_right_hand = [
                {"x": float(offset_x + lm.x * scale_x), "y": float(offset_y + lm.y * scale_y), "z": float(lm.z * scale_x), "visibility": float(getattr(lm, "visibility", 1.0))}
                for lm in results.right_hand_landmarks.landmark
            ]

        # 4. Smooth Hand Keypoints
        smooth_left_hand = self.smoother.smooth_hand(raw_left_hand, "left", timestamp) if raw_left_hand else None
        smooth_right_hand = self.smoother.smooth_hand(raw_right_hand, "right", timestamp) if raw_right_hand else None

        # 5. Extract Gestures & Biometrics (Finger Curls, Fist Score, Palm Normal)
        if smooth_left_hand:
            left_hand_gesture = self.gesture_analyzer.analyze_hand(smooth_left_hand, "left")
        else:
            left_hand_gesture = self._estimate_fallback_gesture(smooth_landmarks, "left")

        if smooth_right_hand:
            right_hand_gesture = self.gesture_analyzer.analyze_hand(smooth_right_hand, "right")
        else:
            right_hand_gesture = self._estimate_fallback_gesture(smooth_landmarks, "right")

        # 6. Extract 3D Head Orientation (True Pitch, Yaw, Roll, Forward & Up Vectors)
        head_orientation = None
        raw_face = None
        if len(smooth_landmarks) >= 11:
            nose = smooth_landmarks[0]
            l_eye = smooth_landmarks[2]
            r_eye = smooth_landmarks[5]
            l_ear = smooth_landmarks[7]
            r_ear = smooth_landmarks[8]
            m_left = smooth_landmarks[9]
            m_right = smooth_landmarks[10]

            eye_mid_x = (l_eye["x"] + r_eye["x"]) * 0.5
            eye_mid_y = (l_eye["y"] + r_eye["y"]) * 0.5
            ear_mid_x = (l_ear["x"] + r_ear["x"]) * 0.5
            ear_mid_y = (l_ear["y"] + r_ear["y"]) * 0.5
            mouth_mid_x = (m_left["x"] + m_right["x"]) * 0.5
            mouth_mid_y = (m_left["y"] + m_right["y"]) * 0.5

            face_h = max(0.001, math.hypot(eye_mid_x - mouth_mid_x, eye_mid_y - mouth_mid_y))
            ear_dist = max(0.001, math.hypot(l_ear["x"] - r_ear["x"], l_ear["y"] - r_ear["y"]))

            # 1. Pitch: Vertical nose position relative to eye-mouth midpoint
            # When looking up: nose moves up towards/above eyes -> nose_offset_y is negative -> pitch_rad is positive
            # When looking down: nose moves down towards mouth -> nose_offset_y is positive -> pitch_rad is negative
            nose_offset_y = (nose["y"] - (eye_mid_y + mouth_mid_y) * 0.5) / face_h
            pitch_rad = float(np.clip(-nose_offset_y * 2.4, -1.2, 1.2))

            # 2. Yaw: Lateral nose position relative to eye midpoint
            nose_offset_x = (nose["x"] - eye_mid_x) / (ear_dist * 0.5)
            yaw_rad = float(np.clip(nose_offset_x * 1.9, -1.3, 1.3))

            # 3. Roll: Head tilt from eye level
            roll_rad = float(math.atan2(r_eye["y"] - l_eye["y"], r_eye["x"] - l_eye["x"]))

            # Compute orthonormal 3D Forward and Up Vectors in Three.js coordinates (+X Right, +Y Up, +Z Forward)
            cos_p = math.cos(pitch_rad)
            fwd_x = math.sin(yaw_rad) * cos_p
            fwd_y = math.sin(pitch_rad)
            fwd_z = math.cos(yaw_rad) * cos_p

            up_x = -math.sin(yaw_rad) * math.sin(pitch_rad)
            up_y = math.cos(pitch_rad)
            up_z = -math.cos(yaw_rad) * math.sin(pitch_rad)

            head_orientation = {
                "pitch": round(pitch_rad, 3),
                "yaw": round(yaw_rad, 3),
                "roll": round(roll_rad, 3),
                "pitch_deg": round(math.degrees(pitch_rad), 1),
                "yaw_deg": round(math.degrees(yaw_rad), 1),
                "forward": {"x": round(fwd_x, 3), "y": round(fwd_y, 3), "z": round(fwd_z, 3)},
                "up": {"x": round(up_x, 3), "y": round(up_y, 3), "z": round(up_z, 3)}
            }

            raw_face = [
                {"x": float(nose["x"]), "y": float(nose["y"]), "z": float(nose["z"])},
                {"x": float(mouth_mid_x), "y": float(mouth_mid_y), "z": float((m_left["z"] + m_right["z"])*0.5)},
                {"x": float(eye_mid_x), "y": float(eye_mid_y - face_h*0.5), "z": float((l_eye["z"] + r_eye["z"])*0.5)},
                {"x": float(l_ear["x"]), "y": float(l_ear["y"]), "z": float(l_ear["z"])},
                {"x": float(r_ear["x"]), "y": float(r_ear["y"]), "z": float(r_ear["z"])},
                {"x": float(l_eye["x"]), "y": float(l_eye["y"]), "z": float(l_eye["z"])},
                {"x": float(r_eye["x"]), "y": float(r_eye["y"]), "z": float(r_eye["z"])}
            ]

        smooth_face = self.smoother.smooth_face(raw_face, timestamp) if raw_face else None

        # Compute Bounding Box and Body Metrics
        xs = [lm["x"] for lm in smooth_landmarks]
        ys = [lm["y"] for lm in smooth_landmarks]
        bbox = {
            "min_x": max(0.0, float(min(xs))),
            "min_y": max(0.0, float(min(ys))),
            "max_x": min(1.0, float(max(xs))),
            "max_y": min(1.0, float(max(ys)))
        }

        left_shoulder = smooth_landmarks[11]
        right_shoulder = smooth_landmarks[12]
        left_hip = smooth_landmarks[23]
        right_hip = smooth_landmarks[24]
        
        shoulder_width = float(math.hypot(left_shoulder["x"] - right_shoulder["x"], left_shoulder["y"] - right_shoulder["y"]))
        torso_height = float(math.hypot(
            (left_shoulder["x"] + right_shoulder["x"])*0.5 - (left_hip["x"] + right_hip["x"])*0.5,
            (left_shoulder["y"] + right_shoulder["y"])*0.5 - (left_hip["y"] + right_hip["y"])*0.5
        ))

        pose_data = {
            "timestamp": timestamp,
            "detected": True,
            "landmarks": smooth_landmarks,
            "world_landmarks": smooth_world_landmarks,
            "left_hand_landmarks": smooth_left_hand,
            "right_hand_landmarks": smooth_right_hand,
            "left_hand_gesture": left_hand_gesture,
            "right_hand_gesture": right_hand_gesture,
            "face_landmarks": smooth_face,
            "head_orientation": head_orientation,
            "landmark_names": LANDMARK_NAMES,
            "bbox": bbox,
            "metrics": {
                "shoulder_width": shoulder_width,
                "torso_height": torso_height
            }
        }

        seg_mask = results.segmentation_mask if self.enable_segmentation else None
        return True, pose_data, seg_mask

    def draw_skeleton(self, frame_bgr: np.ndarray, pose_data: Optional[Dict[str, Any]]) -> np.ndarray:
        """
        Draws high-tech superhero HUD skeleton overlay with color-coded hand gestures and fist indicators.
        """
        if not pose_data or not pose_data.get("detected"):
            return frame_bgr

        annotated = frame_bgr.copy()
        h, w, _ = annotated.shape
        landmarks = pose_data["landmarks"]

        # Body connections list: (from_idx, to_idx) - (Arms are handled with high-precision hand wrists)
        connections = [
            (11, 12),                     # Shoulders
            (11, 13), (12, 14),          # Upper arms
            (11, 23), (12, 24), (23, 24), # Torso
            (23, 25), (25, 27), (27, 29), (29, 31), # Left leg & foot
            (24, 26), (26, 28), (28, 30), (30, 32), # Right leg & foot
            (0, 11), (0, 12)             # Head/Neck
        ]

        # Draw glowing body bones
        for start_idx, end_idx in connections:
            p1 = landmarks[start_idx]
            p2 = landmarks[end_idx]
            if p1.get("visibility", 1.0) > 0.35 and p2.get("visibility", 1.0) > 0.35:
                pt1 = (int(p1["x"] * w), int(p1["y"] * h))
                pt2 = (int(p2["x"] * w), int(p2["y"] * h))
                cv2.line(annotated, pt1, pt2, (255, 200, 0), 4, cv2.LINE_AA)
                cv2.line(annotated, pt1, pt2, (255, 255, 255), 2, cv2.LINE_AA)

        # Draw Forearms: Elbow (13/14) -> True Hand Wrist (hand_lms[0]) or fallback Pose Wrist (15/16)
        l_hand = pose_data.get("left_hand_landmarks")
        r_hand = pose_data.get("right_hand_landmarks")

        l_wrist_pt = (int(l_hand[0]["x"] * w), int(l_hand[0]["y"] * h)) if l_hand else (int(landmarks[15]["x"] * w), int(landmarks[15]["y"] * h))
        r_wrist_pt = (int(r_hand[0]["x"] * w), int(r_hand[0]["y"] * h)) if r_hand else (int(landmarks[16]["x"] * w), int(landmarks[16]["y"] * h))
        l_elbow_pt = (int(landmarks[13]["x"] * w), int(landmarks[13]["y"] * h))
        r_elbow_pt = (int(landmarks[14]["x"] * w), int(landmarks[14]["y"] * h))

        if landmarks[13].get("visibility", 1.0) > 0.35:
            cv2.line(annotated, l_elbow_pt, l_wrist_pt, (255, 200, 0), 4, cv2.LINE_AA)
            cv2.line(annotated, l_elbow_pt, l_wrist_pt, (255, 255, 255), 2, cv2.LINE_AA)

        if landmarks[14].get("visibility", 1.0) > 0.35:
            cv2.line(annotated, r_elbow_pt, r_wrist_pt, (255, 200, 0), 4, cv2.LINE_AA)
            cv2.line(annotated, r_elbow_pt, r_wrist_pt, (255, 255, 255), 2, cv2.LINE_AA)

        # Draw body joints
        for i, lm in enumerate(landmarks):
            if lm.get("visibility", 1.0) > 0.35:
                pt = (int(lm["x"] * w), int(lm["y"] * h))
                if i in (11, 12, 23, 24): # Torso hubs
                    cv2.circle(annotated, pt, 6, (255, 0, 255), -1, cv2.LINE_AA)
                elif i in (13, 14): # Elbows
                    cv2.circle(annotated, pt, 6, (0, 215, 255), -1, cv2.LINE_AA)
                elif i in (25, 26, 27, 28): # Knees & Ankles
                    cv2.circle(annotated, pt, 5, (255, 255, 0), -1, cv2.LINE_AA)
                else:
                    cv2.circle(annotated, pt, 3, (0, 255, 100), -1, cv2.LINE_AA)

        # Hand Finger Joint Connections (Standard 21 MediaPipe Hands Hierarchy)
        hand_conns = [
            (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
            (0, 5), (5, 6), (6, 7), (7, 8),        # Index
            (5, 9), (9, 10), (10, 11), (11, 12),   # Middle
            (9, 13), (13, 14), (14, 15), (15, 16), # Ring
            (13, 17), (17, 18), (18, 19), (19, 20), (0, 17) # Pinky & Palm base
        ]

        # Draw Left and Right Hands with Gesture Badges
        hands_to_draw = [
            ("LEFT", pose_data.get("left_hand_landmarks"), pose_data.get("left_hand_gesture"), (0, 240, 255)),
            ("RIGHT", pose_data.get("right_hand_landmarks"), pose_data.get("right_hand_gesture"), (255, 0, 240))
        ]

        for side_name, hand_lms, gesture_info, base_color in hands_to_draw:
            if not hand_lms or len(hand_lms) < 21:
                continue

            is_fist = gesture_info.get("is_fist", False) if gesture_info else False
            gesture = gesture_info.get("gesture", "NEUTRAL") if gesture_info else "NEUTRAL"
            fist_score = gesture_info.get("fist_score", 0.0) if gesture_info else 0.0

            # Dynamic color based on gesture (Gold/Orange for fist, Cyan/Magenta for open/neutral, Green for victory)
            if is_fist:
                line_color = (0, 140, 255) # Bright orange/gold for closed fist
                glow_color = (0, 69, 255)
            elif gesture == "OPEN_PALM":
                line_color = (0, 255, 128)
                glow_color = (0, 200, 100)
            elif gesture in ("VICTORY", "PEACE"):
                line_color = (255, 255, 0)
                glow_color = (200, 200, 0)
            elif gesture == "THUMBS_UP":
                line_color = (255, 100, 0)
                glow_color = (200, 50, 0)
            else:
                line_color = base_color
                glow_color = (255, 255, 255)

            # Draw Hand Bone Lines
            for c1, c2 in hand_conns:
                pt1 = (int(hand_lms[c1]["x"] * w), int(hand_lms[c1]["y"] * h))
                pt2 = (int(hand_lms[c2]["x"] * w), int(hand_lms[c2]["y"] * h))
                cv2.line(annotated, pt1, pt2, glow_color, 4, cv2.LINE_AA)
                cv2.line(annotated, pt1, pt2, line_color, 2, cv2.LINE_AA)

            # Draw Hand Joint Dots
            for j_idx, j_pt in enumerate(hand_lms):
                pt = (int(j_pt["x"] * w), int(j_pt["y"] * h))
                if j_idx in (4, 8, 12, 16, 20): # Fingertips
                    cv2.circle(annotated, pt, 6, (0, 255, 0) if not is_fist else (0, 100, 255), -1, cv2.LINE_AA)
                    cv2.circle(annotated, pt, 8, (255, 255, 255), 1, cv2.LINE_AA)
                else:
                    cv2.circle(annotated, pt, 3, (255, 255, 255), -1, cv2.LINE_AA)

            # Draw Hand Gesture Floating Badge above the hand
            wrist_px = (int(hand_lms[0]["x"] * w), int(hand_lms[0]["y"] * h))
            badge_x = max(10, min(w - 180, wrist_px[0] - 60))
            badge_y = max(30, wrist_px[1] - 35)

            badge_text = f"{side_name[0]}: {gesture}"
            if is_fist:
                badge_text += f" [{int(fist_score*100)}%]"

            (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
            cv2.rectangle(annotated, (badge_x - 4, badge_y - th - 6), (badge_x + tw + 6, badge_y + 4), (10, 10, 10), -1)
            cv2.rectangle(annotated, (badge_x - 4, badge_y - th - 6), (badge_x + tw + 6, badge_y + 4), line_color, 1)
            cv2.putText(annotated, badge_text, (badge_x, badge_y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.45, line_color, 1, cv2.LINE_AA)

        return annotated

    def close(self):
        """Releases MediaPipe resources."""
        if hasattr(self, 'holistic') and self.holistic:
            self.holistic.close()
