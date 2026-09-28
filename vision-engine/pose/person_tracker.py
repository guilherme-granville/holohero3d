"""
HoloHero 3D - Person Identity & Appearance Tracker.
Detects when a new or different person enters the camera field of view,
extracting clothing/torso HSV color histograms and geometric proportions,
and automatically triggers random 3D character selection.
"""

import os
import re
import cv2
import math
import time
import random
import logging
import urllib.parse
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

def format_model_name(filename: str) -> str:
    """Converts a model filename into a clean, human-readable display title."""
    name = os.path.splitext(filename)[0]
    name = re.sub(r'^(?:imagetostl\.com[_\-\s]*)+', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[\-_]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    
    words = name.split(' ')
    capitalized = []
    for w in words:
        if not w:
            continue
        if w.upper() in ['3D', 'MCU', 'MR', 'PBR', 'DC', 'GLB', 'GLTF', 'HD', 'HQ']:
            capitalized.append(w.upper())
        elif w.lower() == 'spiderman':
            capitalized.append('Spider-Man')
        elif w.lower() == 'deadpool':
            capitalized.append('Deadpool')
        else:
            capitalized.append(w.capitalize())
            
    res = ' '.join(capitalized)
    res = res.replace('Spider Man', 'Spider-Man')
    res = res.replace('Dead Pool', 'Deadpool')
    res = res.replace('Spiderverse', 'Spider-Verse')
    res = res.replace('Spider Verse', 'Spider-Verse')
    res = res.replace('Spidermanacross', 'Spider-Man Across')
    return res if res else filename


class PersonTracker:
    """
    Rastreia a presença e assinatura visual da pessoa em cena.
    Identifica quando uma pessoa diferente entra na câmera e sorteia um novo personagem 3D.
    """
    def __init__(
        self,
        models_dir: str,
        enabled: bool = True,
        cooldown_sec: float = 3.5,
        absence_threshold_sec: float = 1.3,
        appearance_diff_threshold: float = 0.42,
        proportions_diff_threshold: float = 0.30,
        diff_frames_threshold: int = 8
    ):
        self.models_dir = models_dir
        self.enabled = enabled
        self.cooldown_sec = cooldown_sec
        self.absence_threshold_sec = absence_threshold_sec
        self.appearance_diff_threshold = appearance_diff_threshold
        self.proportions_diff_threshold = proportions_diff_threshold
        self.diff_frames_threshold = diff_frames_threshold

        # Tracking state
        self.is_present = False
        self.absence_start_time = 0.0
        self.last_detection_time = 0.0
        self.last_switch_time = 0.0
        self.last_person_signature: Optional[Dict[str, Any]] = None
        self.consecutive_diff_frames = 0
        
        # Currently active model
        self.active_model: Optional[Dict[str, Any]] = None
        self.banner_text: Optional[str] = None
        self.banner_until: float = 0.0

        # Scan available models
        self.available_models: List[Dict[str, Any]] = []
        self.refresh_models()

    def refresh_models(self) -> List[Dict[str, Any]]:
        """Scans models_dir for .glb and .gltf files and formats them for the web client."""
        models = []
        if os.path.isdir(self.models_dir):
            for f in sorted(os.listdir(self.models_dir)):
                low = f.lower()
                if low.endswith(".glb") or low.endswith(".gltf"):
                    f_path = os.path.join(self.models_dir, f)
                    try:
                        size_mb = os.path.getsize(f_path) / (1024 * 1024)
                    except OSError:
                        size_mb = 0.0
                    
                    name = format_model_name(f)
                    tag = "Modelo 3D"
                    if "skeleton" in low or "esqueleto" in low:
                        tag = "Anatômico / Rigged"
                    elif any(k in low for k in ["spider", "miranha", "venom", "goblin", "pool", "kingpin", "mysterio", "prowler", "hero", "flash", "batman", "superman", "iron", "d.va", "dva", "rivals", "fortnite", "shrek"]):
                        tag = "Super-Herói / Rigged"
                    elif "remy" in low or "mixamo" in low:
                        tag = "Mixamo / Rigged"
                    else:
                        tag = "Modelo 3D / Rigged"

                    encoded_name = urllib.parse.quote(f)
                    models.append({
                        "id": f,
                        "name": name,
                        "filename": f,
                        "url": f"/models/{encoded_name}",
                        "size": f"{size_mb:.1f} MB",
                        "tag": tag
                    })

        self.available_models = models
        return models

    def get_random_model(self) -> Optional[Dict[str, Any]]:
        """Picks a random 3D model, avoiding repeating the currently active one."""
        if not self.available_models:
            self.refresh_models()
        if not self.available_models:
            return None

        current_id = self.active_model.get("id") if self.active_model else None
        candidates = [m for m in self.available_models if m["id"] != current_id]
        if not candidates:
            candidates = self.available_models

        chosen = random.choice(candidates)
        self.active_model = chosen
        return chosen

    def extract_signature(self, frame: Any, pose_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extrai características biométricas e de vestimenta da pessoa:
        - Histograma de cor HSV do tronco (roupa)
        - Proporções corporais (largura de ombros / altura de tronco)
        - Posição relativa do tronco
        """
        landmarks = pose_data.get("landmarks")
        if not landmarks or len(landmarks) < 25:
            return None

        h, w = frame.shape[:2]

        # Pontos de ombros (11, 12) e quadris (23, 24)
        l_sh = landmarks[11]
        r_sh = landmarks[12]
        l_hip = landmarks[23]
        r_hip = landmarks[24]

        x_coords = [l_sh["x"], r_sh["x"], l_hip["x"], r_hip["x"]]
        y_coords = [l_sh["y"], r_sh["y"], l_hip["y"], r_hip["y"]]

        min_x = max(0, int(min(x_coords) * w))
        max_x = min(w, int(max(x_coords) * w))
        min_y = max(0, int(min(y_coords) * h))
        max_y = min(h, int(max(y_coords) * h))

        crop_w = max_x - min_x
        crop_h = max_y - min_y

        hist = None
        if crop_w >= 18 and crop_h >= 18:
            torso_patch = frame[min_y:max_y, min_x:max_x]
            try:
                hsv = cv2.cvtColor(torso_patch, cv2.COLOR_BGR2HSV)
                # 16 bins para matiz (Hue), 8 bins para saturação
                raw_hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 25, 256])
                cv2.normalize(raw_hist, raw_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
                hist = raw_hist
            except Exception as e:
                logger.debug(f"Error computing histogram: {e}")

        # Métricas geométricas
        metrics = pose_data.get("metrics", {})
        shoulder_width = metrics.get("shoulder_width", math.hypot(l_sh["x"] - r_sh["x"], l_sh["y"] - r_sh["y"]))
        torso_height = metrics.get("torso_height", math.hypot((l_sh["x"] + r_sh["x"])*0.5 - (l_hip["x"] + r_hip["x"])*0.5,
                                                              (l_sh["y"] + r_sh["y"])*0.5 - (l_hip["y"] + r_hip["y"])*0.5))
        body_ratio = shoulder_width / max(0.01, torso_height)

        center_x = (l_sh["x"] + r_sh["x"] + l_hip["x"] + r_hip["x"]) * 0.25
        center_y = (l_sh["y"] + r_sh["y"] + l_hip["y"] + r_hip["y"]) * 0.25

        return {
            "hist": hist,
            "shoulder_width": shoulder_width,
            "torso_height": torso_height,
            "body_ratio": body_ratio,
            "center": (center_x, center_y),
            "timestamp": time.time()
        }

    def compare_signatures(self, sig1: Dict[str, Any], sig2: Dict[str, Any]) -> Tuple[bool, float, str]:
        """
        Compara duas assinaturas visuais.
        Retorna (is_different, diff_score, reason).
        """
        hist1 = sig1.get("hist")
        hist2 = sig2.get("hist")

        # 1. Comparação de vestimenta/cores do tronco via Bhattacharyya e Correlação
        bhat_dist = 0.0
        corr = 1.0
        if hist1 is not None and hist2 is not None:
            try:
                bhat_dist = cv2.compareHist(hist1, hist2, cv2.HISTCMP_BHATTACHARYYA)
                corr = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
            except Exception:
                pass

        # 2. Comparação de proporções anatômicas (largura/altura do tronco)
        ratio1 = sig1.get("body_ratio", 1.0)
        ratio2 = sig2.get("body_ratio", 1.0)
        ratio_diff = abs(ratio1 - ratio2) / max(0.01, (ratio1 + ratio2) * 0.5)

        # 3. Deslocamento súbito do centro de massa (teleporte / pessoa diferente assumindo)
        c1 = sig1.get("center", (0.5, 0.5))
        c2 = sig2.get("center", (0.5, 0.5))
        pos_dist = math.hypot(c1[0] - c2[0], c1[1] - c2[1])

        # Avaliação de diferença
        if bhat_dist >= self.appearance_diff_threshold or corr <= 0.40:
            return True, bhat_dist, f"Aparência/Cores diferentes (Bhattacharyya: {bhat_dist:.2f}, Corr: {corr:.2f})"
        
        if ratio_diff >= self.proportions_diff_threshold:
            return True, ratio_diff, f"Proporções corporais diferentes (Diff: {ratio_diff*100:.1f}%)"

        if pos_dist >= 0.38:
            return True, pos_dist, f"Troca abrupta de posição na cena (Dist: {pos_dist:.2f})"

        return False, bhat_dist, "Mesma pessoa"

    def update(
        self,
        detected: bool,
        frame: Any,
        pose_data: Optional[Dict[str, Any]],
        current_time: float
    ) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Atualiza o rastreamento a cada frame.
        Retorna (should_change, chosen_model, reason).
        """
        if not self.enabled:
            return False, None, "auto_switch_disabled"

        # Caso 1: Nenhuma pessoa detectada no frame
        if not detected or not pose_data:
            if self.is_present:
                self.is_present = False
                self.absence_start_time = current_time
                self.consecutive_diff_frames = 0
            return False, None, "no_person"

        # Caso 2: Pessoa detectada no frame
        curr_sig = self.extract_signature(frame, pose_data)

        # A) Pessoa entrou após ausência ou primeira detecção
        if not self.is_present:
            absence_duration = current_time - self.absence_start_time if self.absence_start_time > 0 else 999.0
            self.is_present = True
            self.last_detection_time = current_time

            # Se ausente por mais que o limiar de ausência (ex: 1.3s) ou se é a 1ª detecção:
            if self.last_person_signature is None or absence_duration >= self.absence_threshold_sec:
                is_different = True
                reason = "Nova pessoa entrou em cena!"
                if self.last_person_signature is not None and curr_sig is not None:
                    is_diff, score, diff_reason = self.compare_signatures(self.last_person_signature, curr_sig)
                    if absence_duration < 2.5 and not is_diff:
                        # Mesma pessoa retornou rápido (ex: piscou tracking ou pegou algo no chão)
                        is_different = False

                if is_different:
                    chosen = self.get_random_model()
                    self.last_switch_time = current_time
                    self.last_person_signature = curr_sig
                    self.consecutive_diff_frames = 0
                    self.set_banner(f"NOVO USUARIO! HERÓI: {chosen['name'].upper() if chosen else ''}")
                    return True, chosen, reason
                else:
                    self.last_person_signature = curr_sig
                    return False, None, "mesma_pessoa_retornou"

            self.last_person_signature = curr_sig
            return False, None, "retomada_rapida"

        # B) Pessoa já estava presente continuamente (rastreando)
        self.last_detection_time = current_time
        if curr_sig is None:
            return False, None, "no_signature"

        if self.last_person_signature is None:
            self.last_person_signature = curr_sig
            return False, None, "initialized_signature"

        # Verifica se a pessoa na frente mudou (ex: outra pessoa entrou na frente)
        is_diff, score, diff_reason = self.compare_signatures(self.last_person_signature, curr_sig)

        if is_diff:
            self.consecutive_diff_frames += 1
            time_since_last_switch = current_time - self.last_switch_time

            # Requer que a diferença persista por alguns frames para evitar ruído momentâneo,
            # e respeite o cooldown para não trocar sem parar.
            if self.consecutive_diff_frames >= self.diff_frames_threshold and time_since_last_switch >= self.cooldown_sec:
                chosen = self.get_random_model()
                self.last_switch_time = current_time
                self.last_person_signature = curr_sig
                self.consecutive_diff_frames = 0
                reason = f"Pessoa diferente detectada: {diff_reason}"
                self.set_banner(f"PESSOA DIFERENTE! HERÓI: {chosen['name'].upper() if chosen else ''}")
                return True, chosen, reason
        else:
            self.consecutive_diff_frames = max(0, self.consecutive_diff_frames - 1)
            # Atualização suave da assinatura para se adaptar à iluminação da sala
            if score < 0.20:
                self.last_person_signature = curr_sig

        return False, None, "tracking_same_person"

    def set_banner(self, text: str, duration: float = 3.0):
        """Sets a HUD banner text for the OpenCV preview."""
        self.banner_text = text
        self.banner_until = time.time() + duration

    def set_manual_model(self, model: Dict[str, Any]):
        """Call when user manually picks a model to keep state synced."""
        self.active_model = model
        self.last_switch_time = time.time()
