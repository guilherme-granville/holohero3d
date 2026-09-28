"""
HoloHero 3D - Multi-Person Detection & Target Selector.
Detects all people in the camera field of view, allows the operator to click
or select which specific person to track (via OpenCV window, hotkeys 1-9/TAB,
or Web UI), and isolates that person via dynamic ROI-guided pose tracking.
"""

import cv2
import math
import time
import logging
import numpy as np
import mediapipe as mp
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

class PersonCandidate:
    """Representa uma pessoa detectada em cena."""
    def __init__(self, person_id: int, body_bbox: Tuple[float, float, float, float], face_bbox: Optional[Tuple[float, float, float, float]] = None):
        self.person_id = person_id  # 1-indexed (Pessoa 1, Pessoa 2...)
        self.body_bbox = body_bbox   # (min_x, min_y, max_x, max_y) normalizado [0, 1]
        self.face_bbox = face_bbox   # (fx, fy, fw, fh) normalizado
        self.last_seen = time.time()
        self.is_selected = False
        self.label = f"Pessoa {person_id}"

    @property
    def center(self) -> Tuple[float, float]:
        bx1, by1, bx2, by2 = self.body_bbox
        return ((bx1 + bx2) * 0.5, (by1 + by2) * 0.5)


class PersonSelector:
    """
    Gerencia a detecção de múltiplos participantes e permite a seleção
    precisa de quem o avatar 3D deve seguir.
    """
    def __init__(self, min_detection_confidence: float = 0.32):
        self.mp_face = mp.solutions.face_detection
        # model_selection=1: full-range detector otimizado para participantes a até 5m de distância
        self.detector = self.mp_face.FaceDetection(
            model_selection=1,
            min_detection_confidence=min_detection_confidence
        )

        self.candidates: List[PersonCandidate] = []
        self.selected_id: Optional[int] = None # ID do participante fixado/ativo
        self.target_changed: bool = False      # Flag indicando troca/aquisição de alvo para sorteio de herói
        self.active_roi: Optional[Tuple[float, float, float, float]] = None
        self.last_pose_bbox: Optional[Tuple[float, float, float, float]] = None
        self.last_detect_time = 0.0
        self.detect_interval = 0.12 # Roda detecção facial a cada ~120ms para máxima fluidez

    def close(self):
        if self.detector:
            self.detector.close()

    def detect_people(self, frame_bgr: np.ndarray, timestamp: float) -> List[PersonCandidate]:
        """Detecta todas as pessoas na cena usando BlazeFace Full-Range e projeta caixas corporais."""
        if timestamp - self.last_detect_time < self.detect_interval and self.candidates:
            return self.candidates

        self.last_detect_time = timestamp
        h, w = frame_bgr.shape[:2]

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False
        results = self.detector.process(frame_rgb)
        frame_rgb.flags.writeable = True

        raw_candidates = []
        if results.detections:
            for det in results.detections:
                r_box = det.location_data.relative_bounding_box
                fx, fy, fw, fh = r_box.xmin, r_box.ymin, r_box.width, r_box.height

                # Centro do rosto
                fc_x = fx + fw * 0.5

                # Projeção aproximada do corpo humano a partir da proporção da cabeça
                body_w = max(0.18, fw * 3.4)
                body_h = max(0.48, fh * 7.5)

                bx1 = max(0.0, fc_x - body_w * 0.5)
                bx2 = min(1.0, fc_x + body_w * 0.5)
                by1 = max(0.0, fy - fh * 0.35)
                by2 = min(1.0, by1 + body_h)

                raw_candidates.append({
                    "body_bbox": (bx1, by1, bx2, by2),
                    "face_bbox": (fx, fy, fw, fh),
                    "center_x": fc_x
                })

        # Rastreia e preserva IDs existentes por proximidade espacial
        matched_candidates = []
        assigned_pids = set()
        now = time.time()

        for c in raw_candidates:
            fc_x = c["center_x"]
            # Encontra candidato prévio mais próximo
            best_prev = None
            best_dist = 0.28
            for prev in self.candidates:
                if prev.person_id in assigned_pids:
                    continue
                dist = abs(fc_x - prev.center[0])
                if dist < best_dist:
                    best_dist = dist
                    best_prev = prev

            if best_prev is not None:
                pid = best_prev.person_id
                assigned_pids.add(pid)
                # Suaviza transição de caixa
                prev_b = best_prev.body_bbox
                meas_b = c["body_bbox"]
                smooth_b = (
                    prev_b[0] * 0.75 + meas_b[0] * 0.25,
                    prev_b[1] * 0.75 + meas_b[1] * 0.25,
                    prev_b[2] * 0.75 + meas_b[2] * 0.25,
                    prev_b[3] * 0.75 + meas_b[3] * 0.25
                )
                cand = PersonCandidate(pid, smooth_b, c["face_bbox"])
                cand.last_seen = now
            else:
                # Novo participante: encontra menor ID livre
                pid = 1
                while pid in assigned_pids or any(prev.person_id == pid for prev in self.candidates if now - prev.last_seen < 2.0):
                    pid += 1
                assigned_pids.add(pid)
                cand = PersonCandidate(pid, c["body_bbox"], c["face_bbox"])
                cand.last_seen = now

            if self.selected_id == cand.person_id:
                cand.is_selected = True

            matched_candidates.append(cand)

        # Ordena visualmente da esquerda para a direita para nomes e rótulos
        matched_candidates.sort(key=lambda c: c.center[0])
        for i, cand in enumerate(matched_candidates):
            if len(matched_candidates) > 1:
                if i == 0:
                    cand.label = f"Pessoa {cand.person_id} (Esquerda)"
                elif i == len(matched_candidates) - 1:
                    cand.label = f"Pessoa {cand.person_id} (Direita)"
                else:
                    cand.label = f"Pessoa {cand.person_id} (Centro)"
            else:
                cand.label = f"Pessoa {cand.person_id}"

        # Se alguém sumiu temporariamente da detecção facial mas era o alvo selecionado, preserva por 1.5s
        if not any(c.person_id == self.selected_id for c in matched_candidates) and self.selected_id is not None:
            prev_cand = next((c for c in self.candidates if c.person_id == self.selected_id), None)
            if prev_cand and (now - prev_cand.last_seen < 1.5):
                prev_cand.is_selected = True
                matched_candidates.append(prev_cand)

        self.candidates = matched_candidates

        # AUTO-LOCK: Quando encontrar uma pessoa (ou quando a pessoa anterior saiu de cena),
        # fixa automaticamente nela e mantém a fixação mesmo que outros entrem!
        if self.candidates:
            locked_cand = next((c for c in self.candidates if c.person_id == self.selected_id), None)
            if locked_cand is None:
                # Escolhe o participante mais central no palco
                target = min(self.candidates, key=lambda c: abs(c.center[0] - 0.5))
                self.set_selected(target.person_id)
                self.target_changed = True
                logger.info(f"🎯 [PersonSelector] Participante detectado! Fixando automaticamente na {target.label} (ID: {target.person_id})")
        else:
            if self.selected_id is not None:
                self.selected_id = None
                self.active_roi = None
                self.target_changed = True

        return self.candidates

    def select_by_point(self, norm_x: float, norm_y: float) -> Optional[int]:
        """
        Seleciona a pessoa quando o operador clica em qualquer ponto dela no preview.
        Retorna o person_id selecionado.
        """
        best_cand = None
        min_dist = float("inf")

        for cand in self.candidates:
            bx1, by1, bx2, by2 = cand.body_bbox
            # Clique direto dentro da caixa corporal
            if bx1 <= norm_x <= bx2 and by1 <= norm_y <= by2:
                self.set_selected(cand.person_id)
                logger.info(f"🎯 Pessoa {cand.person_id} selecionada por clique!")
                return cand.person_id

            # Ou proximidade com o centro
            cx, cy = cand.center
            dist = math.hypot(norm_x - cx, norm_y - cy)
            if dist < min_dist:
                min_dist = dist
                best_cand = cand

        # Se clicou razoavelmente perto (< 0.28 de distância normalizada)
        if best_cand and min_dist < 0.28:
            self.set_selected(best_cand.person_id)
            logger.info(f"🎯 Pessoa {best_cand.person_id} selecionada por aproximação!")
            return best_cand.person_id

        return self.selected_id

    def set_selected(self, person_id: Optional[int]):
        """Define o ID da pessoa a ser rastreada com lock exclusivo."""
        prev_id = self.selected_id
        self.selected_id = person_id
        for c in self.candidates:
            c.is_selected = (c.person_id == person_id)

        if person_id is not None:
            cand = next((c for c in self.candidates if c.person_id == person_id), None)
            if cand:
                bx1, by1, bx2, by2 = cand.body_bbox
                w_cand = bx2 - bx1
                h_cand = by2 - by1
                margin_x = max(0.12, w_cand * 0.40)
                margin_y = max(0.10, h_cand * 0.35)
                self.active_roi = (
                    max(0.0, bx1 - margin_x),
                    max(0.0, by1 - margin_y),
                    min(1.0, bx2 + margin_x),
                    min(1.0, by2 + margin_y)
                )
        else:
            self.active_roi = None

        if prev_id != person_id:
            self.target_changed = True

    def cycle_next(self) -> Optional[int]:
        """Alterna ciclicamente entre as pessoas detectadas (tecla TAB)."""
        if not self.candidates:
            self.set_selected(None)
            return None

        if self.selected_id is None:
            self.set_selected(self.candidates[0].person_id)
            return self.selected_id

        curr_idx = -1
        for i, c in enumerate(self.candidates):
            if c.person_id == self.selected_id:
                curr_idx = i
                break

        next_idx = (curr_idx + 1) % len(self.candidates)
        self.set_selected(self.candidates[next_idx].person_id)
        return self.selected_id

    def get_tracking_roi(self) -> Optional[Tuple[float, float, float, float]]:
        """
        Retorna a região da imagem (min_x, min_y, max_x, max_y) para isolar o tracking da pessoa selecionada.
        - Se houver apenas 1 pessoa em cena: retorna None (full frame estável e com máxima fidelidade).
        - Se houver 2 ou mais pessoas: isola a pessoa fixada com margem ampla e deadband para que o tracking
          não pule ou sofra interferência dos outros participantes.
        """
        if self.selected_id is None:
            self.active_roi = None
            return None

        # Com 1 participante em cena, o full frame garante máxima fluidez e precisão
        if len(self.candidates) <= 1:
            self.active_roi = None
            return None

        cand = next((c for c in self.candidates if c.person_id == self.selected_id), None)
        if not cand:
            return self.active_roi

        bx1, by1, bx2, by2 = cand.body_bbox
        w_cand = bx2 - bx1
        h_cand = by2 - by1
        # Margem generosa para que movimentos amplos de braços e passos não cortem os limites
        margin_x = max(0.12, w_cand * 0.40)
        margin_y = max(0.10, h_cand * 0.35)

        desired_roi = (
            max(0.0, bx1 - margin_x),
            max(0.0, by1 - margin_y),
            min(1.0, bx2 + margin_x),
            min(1.0, by2 + margin_y)
        )

        if self.active_roi is None:
            self.active_roi = desired_roi
            return self.active_roi

        # Deadband / Histerese: só desloca a janela de corte se a pessoa se mover mais de 10%
        curr_cx = (self.active_roi[0] + self.active_roi[2]) * 0.5
        curr_cy = (self.active_roi[1] + self.active_roi[3]) * 0.5
        new_cx = (desired_roi[0] + desired_roi[2]) * 0.5
        new_cy = (desired_roi[1] + desired_roi[3]) * 0.5

        if math.hypot(new_cx - curr_cx, new_cy - curr_cy) > 0.10:
            self.active_roi = (
                self.active_roi[0] * 0.85 + desired_roi[0] * 0.15,
                self.active_roi[1] * 0.85 + desired_roi[1] * 0.15,
                self.active_roi[2] * 0.85 + desired_roi[2] * 0.15,
                self.active_roi[3] * 0.85 + desired_roi[3] * 0.15
            )

        return self.active_roi

    def update_with_pose(self, pose_data: Optional[Dict[str, Any]]):
        """Atualiza a posição da pessoa fixada com base nos landmarks do esqueleto detectado."""
        if not pose_data or not pose_data.get("detected"):
            return

        landmarks = pose_data.get("landmarks")
        if not landmarks or len(landmarks) < 15:
            return

        xs = [lm["x"] for lm in landmarks if lm.get("visibility", 1.0) > 0.35]
        ys = [lm["y"] for lm in landmarks if lm.get("visibility", 1.0) > 0.35]
        if not xs or not ys:
            return

        min_x = max(0.0, min(xs))
        max_x = min(1.0, max(xs))
        min_y = max(0.0, min(ys))
        max_y = min(1.0, max(ys))

        # Suavização da caixa de tracking com EMA
        self.last_pose_bbox = (min_x, min_y, max_x, max_y)
        if self.selected_id is not None:
            cand = next((c for c in self.candidates if c.person_id == self.selected_id), None)
            if cand:
                px1, py1, px2, py2 = cand.body_bbox
                cand.body_bbox = (
                    px1 * 0.85 + min_x * 0.15,
                    py1 * 0.85 + min_y * 0.15,
                    px2 * 0.85 + max_x * 0.15,
                    py2 * 0.85 + max_y * 0.15
                )
                cand.last_seen = time.time()

    def draw_hud(self, frame_bgr: np.ndarray) -> np.ndarray:
        """Desenha mira tática na pessoa fixada e caixas de identificação interativas nas outras pessoas."""
        h, w = frame_bgr.shape[:2]

        for cand in self.candidates:
            bx1, by1, bx2, by2 = cand.body_bbox
            x1, y1 = int(bx1 * w), int(by1 * h)
            x2, y2 = int(bx2 * w), int(by2 * h)

            is_selected = (cand.person_id == self.selected_id)

            if is_selected:
                # Retículo de Mira Cibernética / Target Lock (Verde Ciano Neon)
                color = (0, 255, 136)
                
                # Cantoneiras táticas reforçadas
                corner_len = max(18, min(36, int((x2 - x1) * 0.22)))
                # Top-Left
                cv2.line(frame_bgr, (x1, y1), (x1 + corner_len, y1), color, 3)
                cv2.line(frame_bgr, (x1, y1), (x1, y1 + corner_len), color, 3)
                # Top-Right
                cv2.line(frame_bgr, (x2, y1), (x2 - corner_len, y1), color, 3)
                cv2.line(frame_bgr, (x2, y1), (x2, y1 + corner_len), color, 3)
                # Bottom-Left
                cv2.line(frame_bgr, (x1, y2), (x1 + corner_len, y2), color, 3)
                cv2.line(frame_bgr, (x1, y2), (x1, y2 - corner_len), color, 3)
                # Bottom-Right
                cv2.line(frame_bgr, (x2, y2), (x2 - corner_len, y2), color, 3)
                cv2.line(frame_bgr, (x2, y2), (x2, y2 - corner_len), color, 3)

                # Caixa com linha fina
                cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), color, 1)

                # Mira central no tronco
                cx = int((x1 + x2) * 0.5)
                cy = int(y1 + (y2 - y1) * 0.35)
                cv2.circle(frame_bgr, (cx, cy), 7, color, 1)
                cv2.line(frame_bgr, (cx - 12, cy), (cx + 12, cy), color, 1)
                cv2.line(frame_bgr, (cx, cy - 12), (cx, cy + 12), color, 1)

                # Badge Superior de Alvo Travado
                badge_text = f"TARGET LOCKED: {cand.label.upper()}"
                (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
                cv2.rectangle(frame_bgr, (x1, max(0, y1 - 25)), (x1 + tw + 14, y1), (15, 30, 20), -1)
                cv2.rectangle(frame_bgr, (x1, max(0, y1 - 25)), (x1 + tw + 14, y1), color, 1)
                cv2.putText(frame_bgr, badge_text, (x1 + 7, max(14, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 255, 136), 1)

            else:
                # IDENTIFICAÇÃO DAS OUTRAS PESSOAS PARA SELEÇÃO
                color = (0, 185, 255) # Dourado / Âmbar
                cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), color, 1)

                # Badge informativo no topo
                badge_text = f"[{cand.person_id}] CLIQUE OU TECLE {cand.person_id}"
                (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.40, 1)
                cv2.rectangle(frame_bgr, (x1, max(0, y1 - 24)), (x1 + tw + 12, y1), (25, 20, 10), -1)
                cv2.rectangle(frame_bgr, (x1, max(0, y1 - 24)), (x1 + tw + 12, y1), color, 1)
                cv2.putText(frame_bgr, badge_text, (x1 + 6, max(12, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 255, 255), 1)

                # Círculo com número de atalho acima da pessoa
                top_cx = int((x1 + x2) * 0.5)
                top_cy = max(18, y1 - 36)
                cv2.circle(frame_bgr, (top_cx, top_cy), 12, (20, 20, 20), -1)
                cv2.circle(frame_bgr, (top_cx, top_cy), 12, color, 2)
                cv2.putText(frame_bgr, str(cand.person_id), (top_cx - 4, top_cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

        return frame_bgr

    def get_people_summary(self) -> List[Dict[str, Any]]:
        """Gera lista serializável em JSON para sincronização via WebSocket com o painel web."""
        summary = []
        for cand in self.candidates:
            bx1, by1, bx2, by2 = cand.body_bbox
            summary.append({
                "id": cand.person_id,
                "label": cand.label,
                "is_selected": (cand.person_id == self.selected_id),
                "bbox": {"min_x": bx1, "min_y": by1, "max_x": bx2, "max_y": by2}
            })
        return summary
