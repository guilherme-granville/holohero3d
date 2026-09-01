# 🖥️ Guia de Hardware e Instalação em Eventos - Superhero Live Experience 3D

Este guia orienta o time técnico na escolha, montagem e calibração de hardware para ativações presenciais, feiras e estandes.

---

## 1. Especificações de Hardware

### Requisitos Mínimos:
- **Processador (CPU)**: Intel Core i5 (10ª geração ou superior) / AMD Ryzen 5 3600
- **Placa de Vídeo (GPU)**: NVIDIA GTX 1660 Super / RTX 2060 (6 GB VRAM ou superior)
- **Memória RAM**: 16 GB DDR4 Dual-Channel
- **Armazenamento**: SSD NVMe com 20 GB de espaço livre
- **Câmera**: Webcam USB 3.0 (1080p a 60 FPS com lente grande-angular)
- **Sistema Operacional**: Windows 10 ou 11 64-bit

### Configuração Recomendada para Grandes Eventos (Turnos de 8h+ a 60 FPS cravados):
- **Processador (CPU)**: Intel Core i7 / i9 (12ª a 14ª geração) ou AMD Ryzen 7 / 9
- **Placa de Vídeo (GPU)**: NVIDIA RTX 3070 / 4070 / 4080 (8 GB+ VRAM)
- **Memória RAM**: 32 GB DDR4/DDR5
- **Câmera**: Câmera USB 3.0 Industrial ou PTZ de baixa latência (ex: OBSBOT Tail Air, Logitech Brio 4K / StreamCam)
- **Exibição**: TV 4K / Telão LED com taxa de atualização de 60Hz+ e modo de jogo ativado (baixo input lag)
- **Cabo HDMI**: HDMI 2.0 ou 2.1 de alta qualidade (ou extensor HDMI via fibra óptica para distâncias superiores a 5m)

---

## 2. Posicionamento da Câmera e Área de Interação

```
[ CÂMERA USB ] (Altura: 1.4m - 1.6m do chão)
      |
      | Ângulo: 0° (apontando reto para o peito/tronco)
      v
  [ ZONA DE INTERAÇÃO DO PARTICIPANTE ]
  (Distância da câmera: 2.0m a 3.0m)
  (Largura livre: 2.0m para abertura total de braços)
      ^
      |
[ TELÃO / TV PRINCIPAL ] (Visível para o participante como um espelho mágico)
```

### Recomendações de Posicionamento:
1. **Altura da Câmera**: Instale a câmera entre **1,40m e 1,60m** do chão, posicionada centralizada logo abaixo ou acima da TV/telão.
2. **Distância Focal**: O participante deve ficar posicionado a uma distância entre **2,0 e 3,0 metros** da câmera para que seu corpo inteiro (da cabeça aos tornozelos) caiba no campo de visão (FOV).
3. **Iluminação**:
   - Evite luz solar direta vinda por trás do usuário (contra-luz / silhueta escura).
   - Utilize iluminação frontal difusa (ex: 2 ring lights ou softboxes a 45° do usuário).

---

## 3. Disparadores Físicos de Efeito Especial (Opcional)

Para criar uma experiência física para o visitante:
- **Pedal de Chão USB (HID Keyboard Foot Switch)**: Configurado para enviar o caractere `ESPAÇO` (KeyCode 32). Quando o visitante pisa no pedal demarcado no chão, o superpoder é disparado imediatamente.
- **Botão de Arcade USB (USB Gamepad/Buzzer)**: Conectado a uma interface USB Arcade (Zero Delay Encoder) mapeado como botão 1 ou Barra de Espaço.
