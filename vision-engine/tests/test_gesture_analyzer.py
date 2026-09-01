import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from pose.hand_gesture import HandGestureAnalyzer

def test_gestures():
    analyzer = HandGestureAnalyzer()

    # 1. Simulate Open Hand
    open_hand = [{"x": 0.5, "y": 0.8, "z": 0.0}] # Wrist
    # Thumb 1..4
    for i in range(1, 5): open_hand.append({"x": 0.4 - i*0.04, "y": 0.7 - i*0.03, "z": 0.0})
    # Index 5..8
    for i in range(1, 5): open_hand.append({"x": 0.45, "y": 0.6 - i*0.06, "z": 0.0})
    # Middle 9..12
    for i in range(1, 5): open_hand.append({"x": 0.50, "y": 0.58 - i*0.07, "z": 0.0})
    # Ring 13..16
    for i in range(1, 5): open_hand.append({"x": 0.55, "y": 0.6 - i*0.06, "z": 0.0})
    # Pinky 17..20
    for i in range(1, 5): open_hand.append({"x": 0.60, "y": 0.62 - i*0.05, "z": 0.0})

    res_open = analyzer.analyze_hand(open_hand, "right")
    print("Open Hand Result:", res_open["gesture"], "Curls:", res_open["curls"], "Fist Score:", res_open["fist_score"])
    assert res_open["is_fist"] is False

    # 2. Simulate Closed Fist (tips folded close to knuckles/palm)
    fist_hand = [{"x": 0.5, "y": 0.8, "z": 0.0}] # Wrist
    # Thumb folded
    for i in range(1, 5): fist_hand.append({"x": 0.48 + i*0.01, "y": 0.7 + (1 if i<3 else -1)*0.02, "z": 0.02})
    # Index folded back towards palm (y ~ 0.65)
    for i in range(1, 5): fist_hand.append({"x": 0.46, "y": 0.65 + (i if i<=2 else 4-i)*0.02, "z": 0.03})
    # Middle folded back
    for i in range(1, 5): fist_hand.append({"x": 0.50, "y": 0.64 + (i if i<=2 else 4-i)*0.02, "z": 0.03})
    # Ring folded back
    for i in range(1, 5): fist_hand.append({"x": 0.54, "y": 0.65 + (i if i<=2 else 4-i)*0.02, "z": 0.03})
    # Pinky folded back
    for i in range(1, 5): fist_hand.append({"x": 0.58, "y": 0.66 + (i if i<=2 else 4-i)*0.02, "z": 0.03})

    res_fist = analyzer.analyze_hand(fist_hand, "right")
    print("Fist Hand Result:", res_fist["gesture"], "Curls:", res_fist["curls"], "Fist Score:", res_fist["fist_score"])
    assert res_fist["is_fist"] is True

    print("ALL GESTURE TESTS PASSED!")

if __name__ == "__main__":
    test_gestures()
