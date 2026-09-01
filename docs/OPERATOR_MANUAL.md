# 🎮 Manual do Operador de Estande / Eventos

Este manual foi escrito em linguagem simples e prática para promotores, recepcionistas e operadores de estande.

---

## 1. Como Ligar o Sistema (Início do Turno)

1. Certifique-se de que a webcam USB e o cabo HDMI da TV/telão estão conectados ao computador.
2. Dê um duplo clique no atalho da área de trabalho ou no arquivo:
   `installer/run_all.bat`
3. Duas janelas serão abertas automaticamente:
   - Uma janela de terminal/câmera (processamento de visão computacional).
   - Uma janela da experiência 3D no navegador / aplicação.
4. Na janela 3D, pressione **`F`** para colocar em **Tela Cheia** na TV principal.
5. Pronto! O sistema está ativo e aguardando o primeiro visitante.

---

## 2. Como Funciona a Interação com o Visitante

1. **Posicionamento**: Peça para o visitante ficar em pé na marcação no chão, a cerca de 2 metros da tela.
2. **Transformação**: Em menos de 1 segundo, o corpo do visitante será substituído pelo herói 3D que repete seus movimentos como um espelho mágico!
3. **Disparo do Poder**: Diga para o visitante abrir os braços e pisar no pedal do chão ou pressione a **Barra de Espaço** no teclado para disparar a explosão de partículas e som de impacto!

---

## 3. Atalhos de Teclado Úteis

| Tecla | Ação |
|---|---|
| **`ESPAÇO`** | Dispara o Superpoder com partículas e som |
| **`F`** | Liga / Desliga modo Tela Cheia (*Fullscreen*) |
| **`O`** ou **`H`** | Abre / Fecha o Painel de Controle do Operador |
| **`1`** | Seleciona efeito: *Cosmic Energy Burst* (Violeta/Ciano) |
| **`2`** | Seleciona efeito: *Thunder Lightning* (Raios) |
| **`3`** | Seleciona efeito: *Flaming Firestorm* (Fogo) |
| **`4`** | Seleciona efeito: *Cosmic Web* (Teias Cósmicas) |

---

## 4. Solução Rápida de Problemas (*Troubleshooting*)

### A tela está preta ou diz "DESCONECTADO":
- Verifique se a janela do Vision Engine (terminal preto) ainda está aberta.
- Se tiver fechado, execute novamente o arquivo `installer/run_vision.bat`.
- Pressione **`O`** para abrir o painel do operador e clique no botão azul **Reconectar**.

### O avatar não se mexe quando a pessoa entra:
- Certifique-se de que a pessoa está inteira visível na câmera (da cabeça aos tornozelos).
- Verifique se a iluminação do local não está muito escura.
- Verifique se ninguém está passando na frente da lente da câmera.

### O movimento do braço parece invertido:
- Pressione **`O`** para abrir o painel do operador e marque/desmarque a caixa **"Espelhar Movimentos (Modo Espelho)"**.
