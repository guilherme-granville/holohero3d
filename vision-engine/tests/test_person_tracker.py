import os
import sys
import numpy as np
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from pose.person_tracker import PersonTracker

def make_dummy_pose(x_offset=0.0, shoulder_w=0.25, torso_h=0.35):
    landmarks = []
    for i in range(33):
        landmarks.append({"x": 0.5 + x_offset, "y": 0.5, "z": 0.0, "visibility": 1.0})
    # Set shoulders 11, 12 and hips 23, 24
    landmarks[11] = {"x": 0.5 + x_offset - shoulder_w/2, "y": 0.3, "z": 0.0, "visibility": 1.0}
    landmarks[12] = {"x": 0.5 + x_offset + shoulder_w/2, "y": 0.3, "z": 0.0, "visibility": 1.0}
    landmarks[23] = {"x": 0.5 + x_offset - shoulder_w/2, "y": 0.3 + torso_h, "z": 0.0, "visibility": 1.0}
    landmarks[24] = {"x": 0.5 + x_offset + shoulder_w/2, "y": 0.3 + torso_h, "z": 0.0, "visibility": 1.0}
    return {
        "landmarks": landmarks,
        "metrics": {"shoulder_width": shoulder_w, "torso_height": torso_h}
    }

def test_person_tracker():
    models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Models"))
    tracker = PersonTracker(
        models_dir=models_dir,
        enabled=True,
        cooldown_sec=1.0,
        absence_threshold_sec=1.0,
        diff_frames_threshold=3
    )

    assert len(tracker.available_models) > 0, "Models list should not be empty"
    print(f"Found {len(tracker.available_models)} models in Models/")

    # Frame 1: Empty (no person)
    frame_empty = np.zeros((480, 640, 3), dtype=np.uint8)
    should_change, model, reason = tracker.update(False, frame_empty, None, 1.0)
    assert not should_change, "Empty frame should not trigger change"

    # Frame 2: Person 1 enters (Red shirt)
    frame_red = np.zeros((480, 640, 3), dtype=np.uint8)
    frame_red[:, :] = (0, 0, 255) # Pure Red
    pose1 = make_dummy_pose()
    should_change, model1, reason = tracker.update(True, frame_red, pose1, 2.5)
    assert should_change, f"First detection must trigger character switch. Got {should_change}"
    assert model1 is not None
    print(f"Test 1 Passed: Initial detection triggered character: {model1['name']} ({reason})")

    # Frame 3: Same person continues in frame for multiple frames
    for f in range(5):
        t = 2.6 + f * 0.033
        should_change, m, reason = tracker.update(True, frame_red, pose1, t)
        assert not should_change, "Same person staying in frame should NOT trigger character switch"
    print("Test 2 Passed: Same person maintains their assigned character without re-triggering")

    # Frame 4: Different person (Blue shirt) steps in
    frame_blue = np.zeros((480, 640, 3), dtype=np.uint8)
    frame_blue[:, :] = (255, 0, 0) # Pure Blue
    pose2 = make_dummy_pose(x_offset=0.0)

    # Simulate frames with different person
    switched = False
    model2 = None
    for f in range(6):
        t = 4.0 + f * 0.033
        should_change, m, reason = tracker.update(True, frame_blue, pose2, t)
        if should_change:
            switched = True
            model2 = m
            break

    assert switched, "Different person with blue shirt should trigger character switch after consecutive diff frames"
    assert model2["id"] != model1["id"], f"Random character should not be the same as previous one! {model2['id']} vs {model1['id']}"
    print(f"Test 3 Passed: Different person triggered new character: {model2['name']}")

    # Frame 5: Person leaves the frame for 2 seconds
    for f in range(10):
        t = 6.0 + f * 0.1
        tracker.update(False, frame_empty, None, t)

    # Frame 6: Someone enters again after absence
    frame_green = np.zeros((480, 640, 3), dtype=np.uint8)
    frame_green[:, :] = (0, 255, 0)
    should_change, model3, reason = tracker.update(True, frame_green, pose1, 8.5)
    assert should_change, "New person entering after absence should trigger character switch"
    print(f"Test 4 Passed: Entry after absence triggered new character: {model3['name']} ({reason})")

    print("\nALL PERSON TRACKER UNIT TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_person_tracker()
