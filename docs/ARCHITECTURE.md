# 🏛️ Arquitetura do Sistema - HoloHero 3D

Este documento detalha o fluxo de dados ponta a ponta, os protocolos de rede, as transformações de coordenadas e a estratégia de mitigação de latência do sistema.

---

## 1. Visão Geral da Arquitetura

O sistema é dividido em duas camadas principais desacopladas por comunicação em rede assíncrona local:

```
+-------------------------------------------------------------------------+
|                            CAMADA DE ENTRADA                            |
|             Webcam 1080p60 / Câmera Industrial (USB 3.0)                |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  PROCESS 1: PYTHON VISION ENGINE (Python 3.10)          |
|  - Threaded Camera Capture (Zero-Lag Ring Buffer, drop de frames)       |
|  - MediaPipe Pose 3D (33 Landmarks normalizados + World 3D métrico)     |
|  - One Euro Filter (Anti-Jitter adaptativo sem borracha temporal)       |
|  - Background Matting & Alpha Mask (Privacidade total)                  |
|  - Async WebSocket Server (ws://localhost:8765)                         |
+------------------------------------+------------------------------------+
                                     | JSON stream (60 FPS, < 15ms)
                                     v
+-------------------------------------------------------------------------+
|               PROCESS 2: 3D RENDER ENGINE (WebGL / Unity 3D)            |
|  - WebSocket Client com auto-reconnect                                  |
|  - Two-Bone IK Solver (Braços e Pernas) + FK (Cabeça, Coluna, Tronco)   |
|  - Humanoid Avatar Rig Retargeting (Mixamo / VRM compatível)            |
|  - Dynamic Auto-Scaling (ajuste pela altura estimada do usuário)         |
|  - Palco Virtual 3D Cinematográfico (Grade holográfica, iluminação PBR) |
|  - GPU Particle VFX (Explosão Cósmica, Raios, Chamas, Teias)            |
|  - Audio Synth FX (Web Audio / Unity AudioSource)                       |
|  - Painel de Operador & Controle de Telão / Fullscreen                  |
+-------------------------------------------------------------------------+
```

---

## 2. Pipeline de Visão Computacional

1. **Captura em Thread Dedicada (`ThreadedCamera`)**:
   - Utiliza backend `cv2.CAP_DSHOW` no Windows para inicialização instantânea e controle direto de buffer.
   - Fila circular de buffer tamanho 1 (`CAP_PROP_BUFFERSIZE = 1`). A função `read()` sempre consome o frame mais novo, eliminando o atraso de buffer comum no OpenCV padrão.
2. **Estimativa de Pose (`PoseEstimator`)**:
   - Processamento de 33 landmarks corporais.
   - Extração simultânea de:
     - `landmarks`: Coordenadas 2D/3D no espaço normalizado da imagem $[0.0, 1.0]$.
     - `world_landmarks`: Coordenadas métricas 3D em metros com origem no centro dos quadris.
3. **Filtro One Euro (`OneEuroFilter` & `LandmarkSmoother`)**:
   - Filtro adaptativo passa-baixas de 1ª ordem baseado na velocidade do sinal:
     $$\hat{X}_i = \alpha X_i + (1 - \alpha)\hat{X}_{i-1}$$
     $$f_c = f_{c,\min} + \beta |\dot{X}|$$
   - Em repouso ($|\dot{X}| \approx 0$), $f_c \to f_{c,\min}$ eliminando o tremor (*jitter*).
   - Em movimento rápido, $f_c$ aumenta dinamicamente, mantendo a resposta instantânea sem *lag*.

---

## 3. Protocolo de Comunicação WebSocket

- **Endpoint Padrão**: `ws://127.0.0.1:8765`
- **Formato**: JSON leve otimizado (tamanho médio ~2.5 KB por pacote a 60 Hz).

### Estrutura do Pacote `POSE_UPDATE`:
```json
{
  "type": "POSE_UPDATE",
  "timestamp": 1723984123.456,
  "server_time": 1723984123.468,
  "latency_ms": 12.3,
  "frame_id": 4520,
  "frame_dims": { "width": 1280, "height": 720 },
  "landmarks": [
    { "x": 0.512, "y": 0.345, "z": -0.12, "visibility": 0.98 },
    ... (33 itens)
  ],
  "world_landmarks": [
    { "x": 0.02, "y": 0.45, "z": -0.15, "visibility": 0.99 },
    ... (33 itens)
  ],
  "bbox": { "min_x": 0.25, "min_y": 0.15, "max_x": 0.75, "max_y": 0.92 },
  "metrics": {
    "shoulder_width": 0.38,
    "torso_height": 0.52
  }
}
```

### Eventos Especiais:
- `POSE_LOST`: Enviado quando a pessoa sai do enquadramento da câmera.
- `TRIGGER_POWER`: Disparo de efeito especial enviado pelo operador ou cliente para propagação na rede.

---

## 4. Retargeting e Rigging 3D

### Mapeamento de Coordenadas:
- **MediaPipe**: $X$ para a direita, $Y$ para baixo, $Z$ profundidade para a câmera.
- **Three.js / Unity**: $X$ para a direita (ou invertido no modo espelho), $Y$ para cima, $Z$ profundidade para o observador.

### Hierarquia de Ossos Humanoides:
- **Tronco e Coluna (FK)**:
  - O vetor do quadril aos ombros orienta a rotação da coluna (`Spine`/`Chest`).
  - O vetor do centro dos ombros ao nariz orienta a rotação da cabeça (`Head`).
- **Membros Superiores e Inferiores (Two-Bone IK & Vetorial)**:
  - Braço esquerdo: Ombro $\to$ Cotovelo $\to$ Pulso.
  - Perna esquerda: Quadril $\to$ Joelho $\to$ Tornozelo.
  - Quaternions de rotação calculados a partir da direção padrão em Pose T para a direção do landmark atual.

---

## 5. Orçamento de Latência Ponta a Ponta

| Etapa | Duração Média |
|---|---|
| Captura de Frame (USB 3.0 / 60 FPS) | ~4.0 ms |
| Inferência MediaPipe Pose + One Euro | ~8.5 ms |
| Serialização e Broadcast WebSocket Local | ~0.5 ms |
| Deserialização e Solução IK no Renderizador | ~1.0 ms |
| Renderização Three.js / Unity GPU | ~2.5 ms |
| **Latência Total Estimada** | **~16.5 ms (< 1 frame a 60 FPS)** |
