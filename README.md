# ⚡ HoloHero 3D ⚡

Sistema interativo profissional de **Realidade Aumentada e Visão Computacional em Tempo Real** para eventos, estandes, transmissões ao vivo e ativações de marca. Substitui instantaneamente qualquer pessoa em frente a uma webcam por um avatar 3D com rastreamento corporal completo, tracking biométrico individual de 21 juntas por mão, detecção de gestos (punho fechado, pinça, vitória, etc.), palco virtual 3D PBR e efeitos cinematográficos de superpoderes com partículas GPU e áudio espacial.

---

## 🌟 Principais Recursos

### 1. 🦾 Dual-Engine Motion Capture 60 FPS (Corpo + Mãos Dedicadas)
- **Rastreamento Corporal Completo (33 Pontos)**: Mapeamento em tempo real de cabeça, coluna, ombros, cotovelos, pulsos, quadris, joelhos e tornozelos.
- **Rastreamento Biométrico de Mãos (21 Juntas por Mão)**: Rastreamento anatômico de todas as falanges (proximal, intermediária, distal) do polegar, indicador, médio, anelar e mínimo.
- **Detecção Avançada de Gestos**: Reconhecimento instantâneo de **Mão Fechada (Fist / Punho Fechado)** com histerese temporal, **Palma Aberta**, **Pinça (Pinch)**, **Vitória (Peace)**, **Apontar**, **Joinha (Thumbs Up)** e **Rock/Horns**.
- **Fechamento de Contato com Zero Espaço (Zero-Gap Contact Closure)**: Correção geométrica de proporção de aspecto (16:9) e fechamento automático do espaço entre dedos ao fazer pinça ou juntar os dedos.
- **Rastreamento Anti-Inversão Espaço-Temporal**: Algoritmo cinemático contínuo que impede troca involuntária entre mão esquerda e direita quando as mãos se aproximam, tocam ou cruzam à frente do corpo.

### 2. 👤 Orientação da Cabeça 6-DOF com Pitch Vertical
- **Pitch 3D (Cima / Baixo)**: Rastreamento vertical da inclinação da cabeça com flexão cervical natural no pescoço.
- **Yaw 3D (Olhar para os Lados)** e **Roll 3D (Inclinação Lateral)**.

### 3. 🛡️ Cinemática 3D Métrica e Proteção Anti-Colisão
- **Percepção Real de Profundidade (Z-Depth)**: Vetores espaciais métricos para alcance de braços, socos e movimentos para frente/trás.
- **Guarda Anti-Penetração no Tronco**: As mãos nunca atravessam a caixa torácica quando puxadas para o corpo.
- **Alinhamento Inter-Mãos**: Quando as duas mãos se juntam (oração, palmas, contato), os punhos e palmas se encontram simetricamente no plano de contato.

### 4. 🎭 Troca de Modelos 3D em Tempo Real (`Models/`)
- Suporte nativo a avatares `.glb`, `.gltf` e `.fbx` com rigs humanoides (Mixamo, VRM, Blender).
- Basta colocar seus arquivos `.glb` dentro da pasta **`Models/`** na raiz do projeto.
- O sistema descobre e carrega os modelos automaticamente com normalização de escala e pose.

### 5. 🖥️ Modos de Apresentação e Controle Duplo
- **Tela de Apresentação Limpa (`/presentation.html`)**: Tela 100% limpa para TV, telão ou projeção, sem botões ou menus de interface. Pressione `F` para Tela Cheia.
- **Painel de Configuração e Operador (`/config.html`)**: Seletor de modelos 3D ao vivo, ajuste de iluminação, rotação de câmera, calibração de escala e espelhamento.
- **Privacidade 100%**: Nenhuma imagem real da câmera ou do visitante é exposta no telão; apenas o avatar 3D no palco sintético.

### 6. 💥 Efeitos Especiais de Superpoderes (VFX)
- 4 superpoderes cinematográficos disparados via teclado ou botão/pedal USB HID:
  1. **Cosmic Burst** (Explosão de energia cósmica)
  2. **Thunder Lightning** (Raios e tempestade elétrica)
  3. **Flaming Firestorm** (Fogo e labaredas de plasma)
  4. **Cosmic Web** (Teia de plasma e vórtice estelar)

---

## 📁 Estrutura do Repositório

```
3d-system/
├── Models/                         # COLOQUE SEUS ARQUIVOS .GLB AQUI
│   └── COLOQUE_SEUS_MODELOS_GLB_AQUI.txt
│
├── vision-engine/                  # Servidor de Visão Computacional (Python)
│   ├── main.py                     # Captura -> Pose -> Hands -> Gestos -> WebSocket & HTTP Server
│   ├── camera/capture.py           # Thread dedicada de captura de alta taxa
│   ├── pose/                       # PoseEstimator, HandGestureAnalyzer, OneEuroFilter
│   │   ├── pose_estimator.py       # Dual-pipeline MediaPipe Pose + Hands
│   │   ├── hand_gesture.py         # Analisador biométrico de curvatura e gestos
│   │   └── one_euro_filter.py      # Filtro adaptativo anti-jitter
│   ├── network/stream_server.py    # Servidor WebSocket assíncrono
│   └── tests/                      # Suíte de testes unitários automatizados
│
├── render-engine-web/              # Motor de Renderização WebGL / Three.js
│   ├── index.html                  # Interface Principal do Palco 3D
│   ├── presentation.html           # Tela Limpa para TV / Telão (Sem HUD)
│   ├── config.html                 # Painel de Controle e Troca de Modelos
│   ├── js/retargeting/             # BoneMapper e IKSolver 6-DOF
│   │   ├── bone_mapper.js          # Retargeting cinemático e 100% individual de dedos
│   │   └── ik_solver.js            # Solver analítico Two-Bone IK
│   ├── js/scene/                   # Palco Virtual, Iluminação PBR & Carregador Universal
│   │   ├── character_loader.js     # Auto-discovery e bind-pose de rigs GLB
│   │   └── stage.js                # Cenário 3D e render loop
│   ├── js/vfx/power_effects.js     # Sistema de partículas GPU e áudio sintetizado
│   └── js/ui/operator_ui.js        # HUD e telemetria em tempo real
│
├── render-engine-unity/            # Pacote para Unity 2022 LTS URP (C#)
├── docs/                           # Documentações e Guias de Arquitetura
└── installer/                      # Scripts de Execução Windows
    ├── run_all.bat                 # Inicialização com 1 clique (Servidor + Navegador)
    ├── run_vision.bat              # Inicia apenas o Vision Engine
    └── run_web_experience.bat      # Inicia apenas a interface Web
```

---

## 🚀 Como Executar

### 1. Pré-requisitos
- **Python 3.10** ou superior instalado.
- **Webcam** (USB 3.0 ou integrada).
- **Navegador Moderno** com aceleração WebGL habilitada (Google Chrome, Edge ou Brave recomendados).

### 2. Instalação das Dependências
```bash
pip install -r vision-engine/requirements.txt
```

### 3. Iniciar o Sistema (1 Clique)
Basta executar o script:
```bash
installer\run_all.bat
```

O sistema inicializará o Vision Engine com o servidor HTTP/WebSocket integrado na porta `8000` e abrirá a experiência automaticamente.

### 4. Acesso às Telas no Navegador:
- **Tela de Apresentação (TV / Telão)**: [http://127.0.0.1:8000/presentation.html](http://127.0.0.1:8000/presentation.html)
- **Painel de Configuração e Troca de Modelos**: [http://127.0.0.1:8000/config.html](http://127.0.0.1:8000/config.html)
- **Experiência Completa com HUD de Operador**: [http://127.0.0.1:8000/index.html](http://127.0.0.1:8000/index.html)

---

## 🎮 Controles e Atalhos de Teclado

| Tecla | Ação |
|---|---|
| **`ESPAÇO`** | Disparar Superpoder de Partículas VFX + Áudio Espacial |
| **`F`** | Alternar Modo Tela Cheia (*Fullscreen*) |
| **`O`** ou **`H`** | Exibir / Ocultar Painel de Controle e Métricas do Operador |
| **`M`** | Alternar Modo Espelho (*Mirror Mode*) |
| **`1` a `4`** | Alternar entre os 4 poderes (Cósmico, Raio, Fogo, Teia) |

---

## 🧪 Testes Automatizados

Para validar o funcionamento de todos os módulos e algoritmos de visão:
```bash
python -m unittest discover -s vision-engine/tests
```

---

## 📄 Licença

Projeto desenvolvido para ativações interativas em tempo real.
