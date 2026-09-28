import os
import sys
import numpy as np
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from pose.pose_estimator import PoseEstimator

def test_roi_processing():
    estimator = PoseEstimator(model_complexity=1, smooth_landmarks=True)
    frame = np.zeros((480, 848, 3), dtype=np.uint8)
    
    # Test normal full-frame process
    detected, pose_data, mask = estimator.process(frame, time.time())
    print("Full frame process works. Detected:", detected)

    # Test process with ROI parameter [min_x, min_y, max_x, max_y]
    roi = (0.2, 0.1, 0.8, 0.9)
    # Check if we support roi in estimator.process
    print("ROI test script ready.")
    estimator.close()

if __name__ == "__main__":
    test_roi_processing()
