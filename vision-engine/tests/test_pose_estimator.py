"""
Unit tests for Pose Estimator data structures and landmark geometry.
"""

import unittest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pose.pose_estimator import PoseEstimator, LANDMARK_NAMES

class TestPoseEstimatorStructure(unittest.TestCase):
    def test_landmark_names_count(self):
        """Standard MediaPipe Pose model must contain exactly 33 defined joints."""
        self.assertEqual(len(LANDMARK_NAMES), 33)
        self.assertEqual(LANDMARK_NAMES[0], "NOSE")
        self.assertEqual(LANDMARK_NAMES[11], "LEFT_SHOULDER")
        self.assertEqual(LANDMARK_NAMES[12], "RIGHT_SHOULDER")
        self.assertEqual(LANDMARK_NAMES[15], "LEFT_WRIST")
        self.assertEqual(LANDMARK_NAMES[16], "RIGHT_WRIST")
        self.assertEqual(LANDMARK_NAMES[23], "LEFT_HIP")
        self.assertEqual(LANDMARK_NAMES[24], "RIGHT_HIP")

    def test_synthetic_black_frame_processing(self):
        """Testing estimator behavior on blank image (should return detected=False)."""
        estimator = PoseEstimator(model_complexity=0, enable_segmentation=False)
        black_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        detected, pose_data, seg_mask = estimator.process(black_frame, 1.0)
        
        self.assertFalse(detected)
        self.assertIsNone(pose_data)
        estimator.close()

if __name__ == "__main__":
    unittest.main()
