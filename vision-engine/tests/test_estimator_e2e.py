import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import cv2
import numpy as np
import time
from pose.pose_estimator import PoseEstimator

def test_estimator():
    estimator = PoseEstimator(model_complexity=1, smooth_landmarks=True)
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    # Put a white circle to simulate image
    cv2.circle(frame, (640, 360), 100, (255, 255, 255), -1)

    t0 = time.time()
    detected, pose_data, mask = estimator.process(frame, t0)
    print("Process executed successfully. Detected:", detected)

    # Test drawing on frame
    annotated = estimator.draw_skeleton(frame, pose_data)
    assert annotated.shape == frame.shape
    print("Skeleton drawing executed successfully.")

    estimator.close()
    print("ALL TESTS PASSED!")

if __name__ == "__main__":
    test_estimator()
