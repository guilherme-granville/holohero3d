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
        
        # 1. Primary Full-Body Pose Solution
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=model_complexity,
            smooth_landmarks=smooth_landmarks,
            enable_segmentation=enable_segmentation,
            smooth_segmentation=smooth_segmentation,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )

        # 2. Dedicated High-Precision Hands Solution (Tracks fists, curls, gestures robustly)
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            model_complexity=1,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )

        # 3. Gesture & Biometrics Analyzer
        self.gesture_analyzer = HandGestureAnalyzer()

        # 4. Adaptive One Euro Landmark Filter Banks
        self.smoother = LandmarkSmoother(
            num_landmarks=33,
            min_cutoff=filter_min_cutoff,
            beta=filter_beta,
            d_cutoff=filter_d_cutoff
        )

        # Persistent hand identity tracking (prevents left/right hand flipping)
        self.prev_hand_pts = {"left": None, "right": None}

        self.mp_drawing = mp.solutions.drawing_utils

    def process(self, frame_bgr: np.ndarray, timestamp: float) -> Tuple[bool, Optional[Dict[str, Any]], Optional[np.ndarray]]:
        """
        Processes a video frame with dual-engine tracking and returns:
        (detected, pose_data_dict, segmentation_mask)
        """
        h, w = frame_bgr.shape[:2]
        
        # Optimal inference downsampling to 960px width for fast 45-60 FPS tracking
        if w > 960:
            target_w = 960
            target_h = int(h * (960.0 / w))
            small_bgr = cv2.resize(frame_bgr, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
            frame_rgb = cv2.cvtColor(small_bgr, cv2.COLOR_BGR2RGB)
        else:
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        frame_rgb.flags.writeable = False

        # Run Pose and Dedicated Hands inferences
        pose_results = self.pose.process(frame_rgb)
        hands_results = self.hands.process(frame_rgb)

        frame_rgb.flags.writeable = True

        if not pose_results.pose_landmarks:
            self.smoother.reset()
            return False, None, None

        # 1. Extract 33 Body Pose Landmarks
        raw_landmarks = []
        for lm in pose_results.pose_landmarks.landmark:
            raw_landmarks.append({
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(lm.visibility)
            })

        # 2. Extract 3D World Landmarks (metric coordinates centered at hips)
        raw_world_landmarks = []
        if pose_results.pose_world_landmarks:
            for wlm in pose_results.pose_world_landmarks.landmark:
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

        # 3. Spatio-Temporal Kinematic Hand Association (Zero-Swap Tracking Memory + Forearm Ray Cost)
        raw_left_hand: Optional[List[Dict[str, float]]] = None
        raw_right_hand: Optional[List[Dict[str, float]]] = None

        l_wrist = smooth_landmarks[15] if len(smooth_landmarks) > 15 else None
        r_wrist = smooth_landmarks[16] if len(smooth_landmarks) > 16 else None
        l_elbow = smooth_landmarks[13] if len(smooth_landmarks) > 13 else None
        r_elbow = smooth_landmarks[14] if len(smooth_landmarks) > 14 else None

        prev_l = self.prev_hand_pts.get("left")
        prev_r = self.prev_hand_pts.get("right")

        def hand_distance(pts_a, pts_b):
            if not pts_a or not pts_b:
                return 999.0
            return math.hypot(pts_a[0]["x"] - pts_b[0]["x"], pts_a[0]["y"] - pts_b[0]["y"])

        def point_distance(pt_a, pt_b):
            if not pt_a or not pt_b:
                return 999.0
            return math.hypot(pt_a["x"] - pt_b["x"], pt_a["y"] - pt_b["y"])

        if hands_results.multi_hand_landmarks:
            detected_hands = []
            for hand_idx, hand_lms in enumerate(hands_results.multi_hand_landmarks):
                pts = [
                    {"x": float(lm.x), "y": float(lm.y), "z": float(lm.z), "visibility": 1.0}
                    for lm in hand_lms.landmark
                ]
                detected_hands.append({"pts": pts, "wrist": pts[0], "mcp": pts[9]})

            def compute_arm_cost(h, side):
                wrist = l_wrist if side == "left" else r_wrist
                elbow = l_elbow if side == "left" else r_elbow
                prev_pts = prev_l if side == "left" else prev_r

                cost = 0.0
                # 1. Pose Wrist distance
                if wrist:
                    cost += point_distance(h["wrist"], wrist) * 2.0
                # 2. Forearm alignment (vector from elbow to wrist)
                if elbow and wrist:
                    arm_vec_x = wrist["x"] - elbow["x"]
                    arm_vec_y = wrist["y"] - elbow["y"]
                    h_vec_x = h["wrist"]["x"] - elbow["x"]
                    h_vec_y = h["wrist"]["y"] - elbow["y"]
                    cost += math.hypot(arm_vec_x - h_vec_x, arm_vec_y - h_vec_y) * 1.5
                # 3. Temporal Tracking Memory: Hands cannot swap in a single frame
                if prev_pts:
                    cost += hand_distance(h["pts"], prev_pts) * 3.5
                return cost

            if len(detected_hands) == 1:
                h0 = detected_hands[0]
                cost_l = compute_arm_cost(h0, "left")
                cost_r = compute_arm_cost(h0, "right")
                if cost_l <= cost_r:
                    raw_left_hand = h0["pts"]
                else:
                    raw_right_hand = h0["pts"]

            elif len(detected_hands) >= 2:
                h0, h1 = detected_hands[0], detected_hands[1]
                # Option A: h0 is Left, h1 is Right
                cost_a = compute_arm_cost(h0, "left") + compute_arm_cost(h1, "right")
                # Option B: h0 is Right, h1 is Left
                cost_b = compute_arm_cost(h0, "right") + compute_arm_cost(h1, "left")

                if cost_a <= cost_b:
                    raw_left_hand = h0["pts"]
                    raw_right_hand = h1["pts"]
                else:
                    raw_left_hand = h1["pts"]
                    raw_right_hand = h0["pts"]

        # Synthesize fallback from Pose landmarks if a hand is temporarily missing
        def synthesize_hand_from_pose(wrist_lm, index_lm):
            if not wrist_lm or not index_lm:
                return None
            w_x, w_y, w_z = wrist_lm["x"], wrist_lm["y"], wrist_lm.get("z", 0.0)
            i_x, i_y, i_z = index_lm["x"], index_lm["y"], index_lm.get("z", 0.0)
            fwd_x, fwd_y, fwd_z = i_x - w_x, i_y - w_y, i_z - w_z
            synth_pts = []
            for k in range(21):
                scale = (k % 4 + 1) * 0.25
                synth_pts.append({
                    "x": float(w_x + fwd_x * scale),
                    "y": float(w_y + fwd_y * scale),
                    "z": float(w_z + fwd_z * scale),
                    "visibility": 0.8
                })
            return synth_pts

        if not raw_left_hand and len(smooth_landmarks) >= 20 and smooth_landmarks[15].get("visibility", 1.0) > 0.4:
            raw_left_hand = synthesize_hand_from_pose(smooth_landmarks[15], smooth_landmarks[19])

        if not raw_right_hand and len(smooth_landmarks) >= 21 and smooth_landmarks[16].get("visibility", 1.0) > 0.4:
            raw_right_hand = synthesize_hand_from_pose(smooth_landmarks[16], smooth_landmarks[20])

        # Update persistent tracking memory
        self.prev_hand_pts["left"] = raw_left_hand
        self.prev_hand_pts["right"] = raw_right_hand

        # 4. Smooth Hand Keypoints
        smooth_left_hand = self.smoother.smooth_hand(raw_left_hand, "left", timestamp) if raw_left_hand else None
        smooth_right_hand = self.smoother.smooth_hand(raw_right_hand, "right", timestamp) if raw_right_hand else None

        # 5. Extract Gestures & Biometrics (Finger Curls, Fist Score, Palm Normal)
        left_hand_gesture = self.gesture_analyzer.analyze_hand(smooth_left_hand, "left") if smooth_left_hand else {
            "detected": False, "is_fist": False, "fist_score": 0.0, "is_open": False, "open_score": 0.0,
            "gesture": "UNKNOWN", "curls": {"thumb": 0.0, "index": 0.0, "middle": 0.0, "ring": 0.0, "pinky": 0.0},
            "pinch_dist": 1.0, "palm_normal": {"x": 0.0, "y": 0.0, "z": -1.0}
        }

        right_hand_gesture = self.gesture_analyzer.analyze_hand(smooth_right_hand, "right") if smooth_right_hand else {
            "detected": False, "is_fist": False, "fist_score": 0.0, "is_open": False, "open_score": 0.0,
            "gesture": "UNKNOWN", "curls": {"thumb": 0.0, "index": 0.0, "middle": 0.0, "ring": 0.0, "pinky": 0.0},
            "pinch_dist": 1.0, "palm_normal": {"x": 0.0, "y": 0.0, "z": -1.0}
        }

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

        seg_mask = pose_results.segmentation_mask if self.enable_segmentation else None
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
        if hasattr(self, 'pose') and self.pose:
            self.pose.close()
        if hasattr(self, 'hands') and self.hands:
            self.hands.close()
