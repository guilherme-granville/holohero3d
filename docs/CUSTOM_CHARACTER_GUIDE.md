# 🦸 Guia de Importação de Modelos 3D Customizados

O **HoloHero 3D** é 100% genérico e agnóstico de personagem. Você pode importar qualquer modelo 3D humanoide customizado ou licenciado (desde que você possua os direitos de uso da marca).

---

## 1. Formatos Suportados

- **`.glb` / `.gltf`** (Recomendado para WebGL e Unity): Formato binário completo contendo malha, textura PBR, pesos de rigging (Skinning) e esqueleto.
- **`.fbx`**: Suportado nativamente no Unity 3D com Mecanim Humanoid Rig.

---

## 2. Padrão de Nomes de Ossos (Mixamo / VRM / Humanoid)

Para que o retargeting automático funcione perfeitamente sem necessidade de alterar código, o esqueleto do modelo 3D deve seguir os nomes padrão da indústria:

| Parte do Corpo | Nomes de Bone Reconhecidos |
|---|---|
| **Quadril / Raiz** | `Hips`, `Pelvis`, `Bip01_Pelvis`, `Root` |
| **Coluna** | `Spine`, `Spine1`, `Bip01_Spine` |
| **Peito** | `Chest`, `Spine2`, `UpperChest` |
| **Pescoço / Cabeça** | `Neck`, `Head`, `Bip01_Head` |
| **Ombro Esquerdo** | `LeftShoulder`, `Shoulder.L`, `mixamorig:LeftShoulder` |
| **Braço Esquerdo** | `LeftArm`, `LeftUpperArm`, `Arm.L`, `mixamorig:LeftArm` |
| **Antebraço Esquerdo** | `LeftForeArm`, `LeftLowerArm`, `ForeArm.L` |
| **Mão Esquerda** | `LeftHand`, `Hand.L`, `mixamorig:LeftHand` |
| **Ombro Direito** | `RightShoulder`, `Shoulder.R`, `mixamorig:RightShoulder` |
| **Braço Direito** | `RightArm`, `RightUpperArm`, `Arm.R`, `mixamorig:RightArm` |
| **Antebraço Direito** | `RightForeArm`, `RightLowerArm`, `ForeArm.R` |
| **Mão Direita** | `RightHand`, `Hand.R`, `mixamorig:RightHand` |
| **Coxa Esquerda** | `LeftUpLeg`, `LeftThigh`, `UpLeg.L` |
| **Canela Esquerda** | `LeftLeg`, `LeftKnee`, `Leg.L` |
| **Pé Esquerdo** | `LeftFoot`, `Foot.L` |
| **Coxa Direita** | `RightUpLeg`, `RightThigh`, `UpLeg.R` |
| **Canela Direita** | `RightLeg`, `RightKnee`, `Leg.R` |
| **Pé Direito** | `RightFoot`, `Foot.R` |

---

## 3. Como Importar no Live Viewer WebGL

1. Abra a tela do Live Viewer.
2. Pressione **`O`** no teclado ou clique no botão **`⚙️ OPERADOR`** no canto superior direito.
3. Na seção **HERÓI / AVATAR 3D**, selecione **"Importar Modelo Customizado..."** ou simplesmente arraste e solte o arquivo `.glb` ou `.gltf` na janela.
4. O modelo será instanciado imediatamente, assumindo a pose do visitante em tempo real.

---

## 4. Como Importar no Unity 3D

1. Arraste o arquivo `.fbx` ou `.glb` para a pasta:  
   `render-engine-unity/Assets/Characters/_CustomImports/`
2. No Inspector do modelo, vá na aba **Rig**:
   - Selecione **Animation Type: Humanoid**.
   - Clique em **Apply** e em **Configure...** para verificar se todos os ossos foram associados corretamente.
3. Arraste o Prefab para a cena e anexe o script `PoseRetargeter.cs`.
