import os
import sys
import numpy as np
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from pose.person_selector import PersonSelector, PersonCandidate

def test_person_selector():
    selector = PersonSelector(min_detection_confidence=0.3)
    frame = np.zeros((480, 848, 3), dtype=np.uint8)

    # 1. Test empty frame
    cands = selector.detect_people(frame, time.time())
    assert isinstance(cands, list)
    print("Test 1 Passed: Empty frame detection handled properly")

    # 2. Add simulated candidates (Person 1 on left, Person 2 on right)
    p1 = PersonCandidate(1, (0.1, 0.2, 0.4, 0.9), (0.2, 0.2, 0.1, 0.15))
    p1.label = "Pessoa 1 (Esquerda)"
    p2 = PersonCandidate(2, (0.6, 0.2, 0.9, 0.9), (0.7, 0.2, 0.1, 0.15))
    p2.label = "Pessoa 2 (Direita)"
    selector.candidates = [p1, p2]

    # Test summary for web UI
    summary = selector.get_people_summary()
    assert len(summary) == 2
    assert summary[0]["label"] == "Pessoa 1 (Esquerda)"
    assert summary[1]["label"] == "Pessoa 2 (Direita)"
    print("Test 2 Passed: People summary formatted correctly for Web UI")

    # 3. Test select by point (click on right person)
    # Click at x=0.75, y=0.5 (inside Person 2)
    selected_id = selector.select_by_point(0.75, 0.5)
    assert selected_id == 2, f"Expected Person 2 selected, got {selected_id}"
    assert selector.selected_id == 2
    roi = selector.get_tracking_roi()
    assert roi is not None
    assert roi[0] < 0.65 and roi[2] > 0.85
    print("Test 3 Passed: Selection by click correctly locked onto Person 2 with ROI padding")

    # 4. Test cycling (TAB key)
    next_id = selector.cycle_next()
    assert next_id == 1, f"Expected cycle to Person 1, got {next_id}"
    print("Test 4 Passed: Cycling via TAB works")

    # 5. Test unlock / Auto mode
    selector.set_selected(None)
    assert selector.selected_id is None
    assert selector.get_tracking_roi() is None
    print("Test 5 Passed: Reset to Auto mode works")

    selector.close()
    print("\nALL PERSON SELECTOR UNIT TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_person_selector()
