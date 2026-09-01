"""
Unit tests for One Euro Filter and Landmark Smoothing.
"""

import unittest
import numpy as np
import time
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pose.smoothing import OneEuroFilter, LandmarkSmoother

class TestOneEuroFilter(unittest.TestCase):
    def test_filter_static_signal_reduces_variance(self):
        """Stationary signal with Gaussian noise should have significantly reduced jitter/variance."""
        filter_instance = OneEuroFilter(min_cutoff=1.0, beta=0.007, d_cutoff=1.0)
        
        np.random.seed(42)
        true_val = 0.5
        noise = np.random.normal(0, 0.05, 100)
        
        raw_samples = []
        filtered_samples = []
        
        current_time = 1000.0
        dt = 1.0 / 60.0  # 60 FPS
        
        for n in noise:
            val = true_val + n
            raw_samples.append(val)
            filtered = filter_instance.filter([val], current_time)
            filtered_samples.append(filtered[0])
            current_time += dt

        raw_var = np.var(raw_samples[20:])
        filtered_var = np.var(filtered_samples[20:])
        
        # Filtered signal variance must be substantially lower than raw noisy input
        self.assertLess(filtered_var, raw_var * 0.4)

    def test_filter_fast_motion_responsiveness(self):
        """A rapid step change should be followed quickly without excessive latency."""
        filter_instance = OneEuroFilter(min_cutoff=1.0, beta=0.01, d_cutoff=1.0)
        
        current_time = 0.0
        dt = 1.0 / 60.0
        
        # Steady state at 0.0
        for _ in range(30):
            filter_instance.filter([0.0], current_time)
            current_time += dt
            
        # Step jump to 1.0
        responses = []
        for _ in range(25):
            res = filter_instance.filter([1.0], current_time)
            responses.append(res[0])
            current_time += dt

        # After frames at 60 FPS, the response should closely approach 1.0
        self.assertGreater(responses[-1], 0.85)

    def test_landmark_smoother_format(self):
        """LandmarkSmoother handles 33 points correctly."""
        smoother = LandmarkSmoother(num_landmarks=33)
        landmarks = [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99} for _ in range(33)]
        world_landmarks = [{"x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.99} for _ in range(33)]
        
        smoothed_norm, smoothed_world = smoother.smooth(landmarks, world_landmarks, time.time())
        self.assertEqual(len(smoothed_norm), 33)
        self.assertEqual(len(smoothed_world), 33)
        self.assertAlmostEqual(smoothed_norm[0]["x"], 0.5, places=3)

if __name__ == "__main__":
    unittest.main()
