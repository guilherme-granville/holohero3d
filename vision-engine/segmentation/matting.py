"""
Person Segmentation and Background Matting Module.
Extracts alpha matte / segmentation masks to ensure real-world backgrounds are never leaked into the final output.
"""

import cv2
import numpy as np
import mediapipe as mp
from typing import Tuple, Optional

class BackgroundMatter:
    """
    Selfie segmentation and background suppression.
    """
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.mp_selfie = mp.solutions.selfie_segmentation
        self.segmenter = self.mp_selfie.SelfieSegmentation(model_selection=1) # 1 for landscape/full body

    def generate_mask(self, frame_bgr: np.ndarray) -> np.ndarray:
        """
        Generates an 8-bit single channel alpha mask (0=background, 255=person).
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self.segmenter.process(frame_rgb)
        
        if results.segmentation_mask is None:
            return np.zeros((frame_bgr.shape[0], frame_bgr.shape[1]), dtype=np.uint8)

        # Soft edge thresholding with bilateral blur
        mask = (results.segmentation_mask > self.threshold).astype(np.uint8) * 255
        mask = cv2.GaussianBlur(mask, (5, 5), 0)
        return mask

    def apply_virtual_backdrop(self, frame_bgr: np.ndarray, mask: np.ndarray, bg_color: Tuple[int, int, int] = (0, 0, 0)) -> np.ndarray:
        """
        Replaces background with solid color / chroma key.
        """
        norm_mask = mask.astype(float) / 255.0
        norm_mask = np.stack([norm_mask] * 3, axis=-1)
        
        bg = np.full_like(frame_bgr, bg_color, dtype=np.uint8)
        composite = (frame_bgr * norm_mask + bg * (1.0 - norm_mask)).astype(np.uint8)
        return composite

    def close(self):
        if self.segmenter:
            self.segmenter.close()
