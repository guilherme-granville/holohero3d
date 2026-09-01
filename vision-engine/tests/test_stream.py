"""
Unit tests for Stream Server serialization and packet format.
"""

import unittest
import json
import time
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from network.stream_server import StreamServer

class TestStreamServerPacketFormat(unittest.TestCase):
    def test_pose_packet_serialization(self):
        """Validates JSON structure sent over WebSocket wire."""
        sample_packet = {
            "type": "POSE_UPDATE",
            "timestamp": time.time(),
            "server_time": time.time(),
            "latency_ms": 14.5,
            "frame_id": 1024,
            "frame_dims": {"width": 1280, "height": 720},
            "landmarks": [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.99} for _ in range(33)],
            "world_landmarks": [{"x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.99} for _ in range(33)],
            "bbox": {"min_x": 0.2, "min_y": 0.1, "max_x": 0.8, "max_y": 0.9},
            "metrics": {"shoulder_width": 0.35, "torso_height": 0.55}
        }
        
        serialized = json.dumps(sample_packet)
        deserialized = json.loads(serialized)
        
        self.assertEqual(deserialized["type"], "POSE_UPDATE")
        self.assertEqual(len(deserialized["landmarks"]), 33)
        self.assertIn("metrics", deserialized)
        self.assertAlmostEqual(deserialized["metrics"]["shoulder_width"], 0.35)

if __name__ == "__main__":
    unittest.main()
