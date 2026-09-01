/**
 * ==============================================================================
 * UNIVERSAL 3D CHARACTER GENERATOR & SMART GLB/GLTF RIG RETARGETING LOADER
 * ==============================================================================
 * - Discovers and resolves bones across Mixamo, Unreal, Blender/Rigify, VRM, ReadyPlayerMe, XPS, Games
 * - Auto Upright Alignment: automatically detects if model is exported in Z-Up (lying down) and stands it upright (+Y)
 * - Universal Bounding-Box Normalizer: forces any arbitrary 3D model to exact 1.80m base height
 * - Grounding and Centering: perfectly centers character at (0, 0, 0) with feet on floor (Y = 0)
 * - Dynamic rest-vector calculation (v_rest) from physical joint positions in rest pose
 * - Caches bind world quaternions, bind local quaternions, bind parent world quaternions, and rest vectors
 */

class CharacterLoader {
    constructor(scene) {
        this.scene = scene;
        this.gltfLoader = new THREE.GLTFLoader();
        this.activeCharacter = null;
    }

    /**
     * Creates procedural hero armature with high-fidelity PBR superhero mesh
     */
    createProceduralHero(preset = "cyber_iron") {
        if (this.activeCharacter && this.activeCharacter.root) {
            this.scene.remove(this.activeCharacter.root);
        }

        const root = new THREE.Group();
        root.name = "HoloHero_3D_Root";

        let primaryColor, secondaryColor, accentColor, glowColor;
        let metalness = 0.92, roughness = 0.18;

        if (preset === "cyber_iron" || preset === "default_hero") {
            primaryColor = 0x8a0f1a;
            secondaryColor = 0xc59b27;
            accentColor = 0x1c2438;
            glowColor = 0x00f0ff;
        } else if (preset === "cosmic_knight" || preset === "cosmic_guardian") {
            primaryColor = 0x0d1117;
            secondaryColor = 0x3d1d6d;
            accentColor = 0x1f1633;
            glowColor = 0xbf00ff;
        } else {
            primaryColor = 0x0e2454;
            secondaryColor = 0x1b4332;
            accentColor = 0x081c15;
            glowColor = 0x00ff88;
        }

        const primaryMat = new THREE.MeshStandardMaterial({ color: primaryColor, metalness: metalness, roughness: roughness });
        const goldMat = new THREE.MeshStandardMaterial({ color: secondaryColor, metalness: 0.95, roughness: 0.12 });
        const darkUnderMat = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.4, roughness: 0.6 });
        const glowMat = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2.5, metalness: 0.1, roughness: 0.1 });
        const eyesGlowMat = new THREE.MeshBasicMaterial({ color: glowColor });

        // SKELETON HIERARCHY
        const hips = new THREE.Group();
        hips.name = "Hips";
        hips.position.set(0, 0.95, 0);
        root.add(hips);

        const spine = new THREE.Group();
        spine.name = "Spine";
        spine.position.set(0, 0.15, 0);
        hips.add(spine);

        const chest = new THREE.Group();
        chest.name = "Chest";
        chest.position.set(0, 0.22, 0);
        spine.add(chest);

        const neck = new THREE.Group();
        neck.name = "Neck";
        neck.position.set(0, 0.26, 0);
        chest.add(neck);

        const head = new THREE.Group();
        head.name = "Head";
        head.position.set(0, 0.08, 0);
        neck.add(head);

        // HEAD
        const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), primaryMat);
        cranium.position.set(0, 0.06, -0.01);
        cranium.scale.set(0.95, 1.1, 1.05);
        cranium.castShadow = true;
        head.add(cranium);

        const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.1), goldMat);
        faceplate.position.set(0, 0.04, 0.07);
        faceplate.rotation.x = -0.1;
        faceplate.castShadow = true;
        head.add(faceplate);

        const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 4), primaryMat);
        jaw.position.set(0, -0.06, 0.06);
        jaw.rotation.x = Math.PI;
        jaw.rotation.y = Math.PI / 4;
        head.add(jaw);

        const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, 0.03), eyesGlowMat);
        leftEye.position.set(0.04, 0.06, 0.12);
        leftEye.rotation.z = -0.2;
        head.add(leftEye);

        const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, 0.03), eyesGlowMat);
        rightEye.position.set(-0.04, 0.06, 0.12);
        rightEye.rotation.z = 0.2;
        head.add(rightEye);

        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.04), glowMat);
        crest.position.set(0, 0.13, 0.08);
        head.add(crest);

        const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 16), darkUnderMat);
        neck.add(neckMesh);

        // CHEST
        const leftPec = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.12), primaryMat);
        leftPec.position.set(0.11, 0.1, 0.08);
        leftPec.rotation.z = -0.08;
        leftPec.rotation.y = 0.08;
        leftPec.castShadow = true;
        chest.add(leftPec);

        const rightPec = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.12), primaryMat);
        rightPec.position.set(-0.11, 0.1, 0.08);
        rightPec.rotation.z = 0.08;
        rightPec.rotation.y = -0.08;
        rightPec.castShadow = true;
        chest.add(rightPec);

        const reactorOuter = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 16, 32), goldMat);
        reactorOuter.position.set(0, 0.1, 0.145);
        chest.add(reactorOuter);

        const reactorCore = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 24), glowMat);
        reactorCore.rotation.x = Math.PI / 2;
        reactorCore.position.set(0, 0.1, 0.14);
        chest.add(reactorCore);

        const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.1), primaryMat);
        backPlate.position.set(0, 0.08, -0.09);
        backPlate.castShadow = true;
        chest.add(backPlate);

        for (let row = 0; row < 3; row++) {
            const abY = 0.06 - row * 0.07;
            const leftAb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.08), goldMat);
            leftAb.position.set(0.06, abY, 0.07);
            leftAb.castShadow = true;
            spine.add(leftAb);

            const rightAb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.08), goldMat);
            rightAb.position.set(-0.06, abY, 0.07);
            rightAb.castShadow = true;
            spine.add(rightAb);
        }

        const spineColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.22, 16), darkUnderMat);
        spine.add(spineColumn);

        // PELVIS
        const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.18, 16), primaryMat);
        pelvisMesh.castShadow = true;
        hips.add(pelvisMesh);

        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), goldMat);
        buckle.position.set(0, 0.06, 0.16);
        hips.add(buckle);

        const buckleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.045), glowMat);
        buckleGlow.position.set(0, 0.06, 0.165);
        hips.add(buckleGlow);

        // ARMS - Character Left is Screen Right (+X)
        const leftUpperArm = new THREE.Group();
        leftUpperArm.name = "LeftUpperArm";
        leftUpperArm.position.set(0.28, 0.18, 0);
        chest.add(leftUpperArm);

        const leftPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), goldMat);
        leftPauldron.position.set(0.06, 0.04, 0);
        leftPauldron.scale.set(1.2, 0.8, 1.0);
        leftPauldron.castShadow = true;
        leftUpperArm.add(leftPauldron);

        const leftBicep = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 16), primaryMat);
        leftBicep.position.set(0.14, 0, 0);
        leftBicep.rotation.z = -Math.PI / 2;
        leftBicep.castShadow = true;
        leftUpperArm.add(leftBicep);

        const leftLowerArm = new THREE.Group();
        leftLowerArm.name = "LeftLowerArm";
        leftLowerArm.position.set(0.3, 0, 0);
        leftUpperArm.add(leftLowerArm);

        const leftElbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), goldMat);
        leftLowerArm.add(leftElbowCap);

        const leftGauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.24, 16), goldMat);
        leftGauntlet.position.set(0.13, 0, 0);
        leftGauntlet.rotation.z = -Math.PI / 2;
        leftGauntlet.castShadow = true;
        leftLowerArm.add(leftGauntlet);

        const leftHandGlove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), primaryMat);
        leftHandGlove.position.set(0.27, 0, 0);
        leftLowerArm.add(leftHandGlove);

        const leftRepulsor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), glowMat);
        leftRepulsor.rotation.z = Math.PI / 2;
        leftRepulsor.position.set(0.28, 0, 0);
        leftLowerArm.add(leftRepulsor);

        // ARMS - Character Right is Screen Left (-X)
        const rightUpperArm = new THREE.Group();
        rightUpperArm.name = "RightUpperArm";
        rightUpperArm.position.set(-0.28, 0.18, 0);
        chest.add(rightUpperArm);

        const rightPauldron = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), goldMat);
        rightPauldron.position.set(-0.06, 0.04, 0);
        rightPauldron.scale.set(1.2, 0.8, 1.0);
        rightPauldron.castShadow = true;
        rightUpperArm.add(rightPauldron);

        const rightBicep = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 16), primaryMat);
        rightBicep.position.set(-0.14, 0, 0);
        rightBicep.rotation.z = Math.PI / 2;
        rightBicep.castShadow = true;
        rightUpperArm.add(rightBicep);

        const rightLowerArm = new THREE.Group();
        rightLowerArm.name = "RightLowerArm";
        rightLowerArm.position.set(-0.3, 0, 0);
        rightUpperArm.add(rightLowerArm);

        const rightElbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), goldMat);
        rightLowerArm.add(rightElbowCap);

        const rightGauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.24, 16), goldMat);
        rightGauntlet.position.set(-0.13, 0, 0);
        rightGauntlet.rotation.z = Math.PI / 2;
        rightGauntlet.castShadow = true;
        rightLowerArm.add(rightGauntlet);

        const rightHandGlove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), primaryMat);
        rightHandGlove.position.set(-0.27, 0, 0);
        rightLowerArm.add(rightHandGlove);

        const rightRepulsor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), glowMat);
        rightRepulsor.rotation.z = -Math.PI / 2;
        rightRepulsor.position.set(-0.28, 0, 0);
        rightLowerArm.add(rightRepulsor);

        // LEGS
        const leftUpperLeg = new THREE.Group();
        leftUpperLeg.name = "LeftUpperLeg";
        leftUpperLeg.position.set(0.12, -0.08, 0);
        hips.add(leftUpperLeg);

        const leftThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.32, 16), primaryMat);
        leftThigh.position.set(0, -0.2, 0);
        leftThigh.castShadow = true;
        leftUpperLeg.add(leftThigh);

        const leftThighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.08), goldMat);
        leftThighPlate.position.set(0, -0.2, 0.05);
        leftThighPlate.castShadow = true;
        leftUpperLeg.add(leftThighPlate);

        const leftLowerLeg = new THREE.Group();
        leftLowerLeg.name = "LeftLowerLeg";
        leftLowerLeg.position.set(0, -0.42, 0);
        leftUpperLeg.add(leftLowerLeg);

        const leftKneeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), goldMat);
        leftKneeGuard.position.set(0, 0, 0.05);
        leftLowerLeg.add(leftKneeGuard);

        const leftShin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.3, 16), primaryMat);
        leftShin.position.set(0, -0.18, 0);
        leftShin.castShadow = true;
        leftLowerLeg.add(leftShin);

        const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), goldMat);
        leftBoot.position.set(0, -0.36, 0.05);
        leftBoot.castShadow = true;
        leftLowerLeg.add(leftBoot);

        // RIGHT LEG
        const rightUpperLeg = new THREE.Group();
        rightUpperLeg.name = "RightUpperLeg";
        rightUpperLeg.position.set(-0.12, -0.08, 0);
        hips.add(rightUpperLeg);

        const rightThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.32, 16), primaryMat);
        rightThigh.position.set(0, -0.2, 0);
        rightThigh.castShadow = true;
        rightUpperLeg.add(rightThigh);

        const rightThighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.08), goldMat);
        rightThighPlate.position.set(0, -0.2, 0.05);
        rightThighPlate.castShadow = true;
        rightUpperLeg.add(rightThighPlate);

        const rightLowerLeg = new THREE.Group();
        rightLowerLeg.name = "RightLowerLeg";
        rightLowerLeg.position.set(0, -0.42, 0);
        rightUpperLeg.add(rightLowerLeg);

        const rightKneeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), goldMat);
        rightKneeGuard.position.set(0, 0, 0.05);
        rightLowerLeg.add(rightKneeGuard);

        const rightShin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.3, 16), primaryMat);
        rightShin.position.set(0, -0.18, 0);
        rightShin.castShadow = true;
        rightLowerLeg.add(rightShin);

        const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), goldMat);
        rightBoot.position.set(0, -0.36, 0.05);
        rightBoot.castShadow = true;
        rightLowerLeg.add(rightBoot);

        // HAND ANCHORS
        const leftHandAnchor = new THREE.Object3D();
        leftHandAnchor.position.set(0.3, 0, 0);
        leftLowerArm.add(leftHandAnchor);

        const rightHandAnchor = new THREE.Object3D();
        rightHandAnchor.position.set(-0.3, 0, 0);
        rightLowerArm.add(rightHandAnchor);

        this.scene.add(root);
        root.updateMatrixWorld(true);

        // Bind transform & dynamic rest vector caching for procedural skeleton
        const bonesList = [
            { bone: hips, restDir: new THREE.Vector3(0, 1, 0) },
            { bone: spine, restDir: new THREE.Vector3(0, 1, 0) },
            { bone: chest, restDir: new THREE.Vector3(0, 1, 0) },
            { bone: neck, restDir: new THREE.Vector3(0, 1, 0) },
            { bone: head, restDir: new THREE.Vector3(0, 1, 0) },
            { bone: leftUpperArm, restDir: new THREE.Vector3(1, 0, 0) },
            { bone: leftLowerArm, restDir: new THREE.Vector3(1, 0, 0) },
            { bone: rightUpperArm, restDir: new THREE.Vector3(-1, 0, 0) },
            { bone: rightLowerArm, restDir: new THREE.Vector3(-1, 0, 0) },
            { bone: leftUpperLeg, restDir: new THREE.Vector3(0, -1, 0) },
            { bone: leftLowerLeg, restDir: new THREE.Vector3(0, -1, 0) },
            { bone: rightUpperLeg, restDir: new THREE.Vector3(0, -1, 0) },
            { bone: rightLowerLeg, restDir: new THREE.Vector3(0, -1, 0) }
        ];

        bonesList.forEach(({ bone, restDir }) => {
            bone.userData.bindLocalQuat = bone.quaternion.clone();
            bone.userData.bindWorldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
            bone.userData.bindParentWorldQuat = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
            bone.userData.bindLocalPos = bone.position.clone();
            bone.userData.bindWorldPos = bone.getWorldPosition(new THREE.Vector3());
            bone.userData.restWorldDir = restDir.clone().normalize();
        });

        this.activeCharacter = {
            root: root,
            isSkinnedMesh: false,
            baseHeight: 0.95,
            skinnedMeshes: [],
            bones: {
                hips: hips,
                spine: spine,
                chest: chest,
                neck: neck,
                head: head,
                leftUpperArm: leftUpperArm,
                leftLowerArm: leftLowerArm,
                rightUpperArm: rightUpperArm,
                rightLowerArm: rightLowerArm,
                leftUpperLeg: leftUpperLeg,
                leftLowerLeg: leftLowerLeg,
                rightUpperLeg: rightUpperLeg,
                rightLowerLeg: rightLowerLeg
            },
            leftHandAnchor: leftHandAnchor,
            rightHandAnchor: rightHandAnchor
        };

        return this.activeCharacter;
    }

    /**
     * Re-computes and caches bind pose transforms and dynamic rest direction vectors (v_rest)
     */
    cacheBindPose(character) {
        if (!character) return;
        const bones = character.bones || {};
        const allBones = character.allBones || Object.values(bones).filter(Boolean);

        if (character.root) {
            character.root.updateMatrixWorld(true);
        }

        allBones.forEach(b => {
            if (!b) return;
            b.userData.bindWorldQuat = b.getWorldQuaternion(new THREE.Quaternion());
            b.userData.bindParentWorldQuat = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
            b.userData.bindLocalQuat = b.quaternion.clone();
            b.userData.bindWorldPos = b.getWorldPosition(new THREE.Vector3());
            b.userData.bindLocalPos = b.position.clone();
        });

        const computeRestDir = (fromBone, toBone, defaultDir, excludePatterns = []) => {
            if (fromBone && toBone) {
                const pFrom = fromBone.getWorldPosition(new THREE.Vector3());
                const pTo = toBone.getWorldPosition(new THREE.Vector3());
                const dir = new THREE.Vector3().subVectors(pTo, pFrom);
                if (dir.lengthSq() > 0.0001) {
                    return dir.normalize();
                }
            }
            if (fromBone && fromBone.children && fromBone.children.length > 0) {
                const invalidPatterns = ["eye", "jaw", "mouth", "hair", "ear", "collar", "hood", "cloth", "jiggle", "twist", "helper", "fx", "prop", "weapon", ...excludePatterns];
                const validChild = fromBone.children.find(c => {
                    if (!c.isBone && c.type !== "Bone") return false;
                    const cName = (c.name || "").toLowerCase();
                    return !invalidPatterns.some(p => cName.includes(p));
                });
                if (validChild) {
                    const pFrom = fromBone.getWorldPosition(new THREE.Vector3());
                    const pTo = validChild.getWorldPosition(new THREE.Vector3());
                    const dir = new THREE.Vector3().subVectors(pTo, pFrom);
                    if (dir.lengthSq() > 0.0001) {
                        return dir.normalize();
                    }
                }
            }
            return defaultDir.clone().normalize();
        };

        if (bones.leftUpperArm) {
            bones.leftUpperArm.userData.restWorldDir = computeRestDir(bones.leftUpperArm, bones.leftLowerArm, new THREE.Vector3(1, 0, 0));
        }
        if (bones.leftLowerArm) {
            bones.leftLowerArm.userData.restWorldDir = computeRestDir(bones.leftLowerArm, bones.leftHand, bones.leftUpperArm?.userData?.restWorldDir || new THREE.Vector3(1, 0, 0));
        }
        if (bones.leftHand) {
            bones.leftHand.userData.restWorldDir = computeRestDir(bones.leftHand, character.fingers?.left?.middle?.[0] || character.leftHandAnchor, bones.leftLowerArm?.userData?.restWorldDir || new THREE.Vector3(1, 0, 0));
        }
        if (bones.rightUpperArm) {
            bones.rightUpperArm.userData.restWorldDir = computeRestDir(bones.rightUpperArm, bones.rightLowerArm, new THREE.Vector3(-1, 0, 0));
        }
        if (bones.rightLowerArm) {
            bones.rightLowerArm.userData.restWorldDir = computeRestDir(bones.rightLowerArm, bones.rightHand, bones.rightUpperArm?.userData?.restWorldDir || new THREE.Vector3(-1, 0, 0));
        }
        if (bones.rightHand) {
            bones.rightHand.userData.restWorldDir = computeRestDir(bones.rightHand, character.fingers?.right?.middle?.[0] || character.rightHandAnchor, bones.rightLowerArm?.userData?.restWorldDir || new THREE.Vector3(-1, 0, 0));
        }
        if (bones.leftUpperLeg) {
            bones.leftUpperLeg.userData.restWorldDir = computeRestDir(bones.leftUpperLeg, bones.leftLowerLeg, new THREE.Vector3(0, -1, 0));
        }
        if (bones.leftLowerLeg) {
            bones.leftLowerLeg.userData.restWorldDir = computeRestDir(bones.leftLowerLeg, bones.leftFoot, bones.leftUpperLeg?.userData?.restWorldDir || new THREE.Vector3(0, -1, 0));
        }
        if (bones.rightUpperLeg) {
            bones.rightUpperLeg.userData.restWorldDir = computeRestDir(bones.rightUpperLeg, bones.rightLowerLeg, new THREE.Vector3(0, -1, 0));
        }
        if (bones.rightLowerLeg) {
            bones.rightLowerLeg.userData.restWorldDir = computeRestDir(bones.rightLowerLeg, bones.rightFoot, bones.rightUpperLeg?.userData?.restWorldDir || new THREE.Vector3(0, -1, 0));
        }
        if (bones.spine) {
            bones.spine.userData.restWorldDir = computeRestDir(bones.spine, bones.chest || bones.neck, new THREE.Vector3(0, 1, 0));
        }
        if (bones.chest) {
            bones.chest.userData.restWorldDir = computeRestDir(bones.chest, bones.neck || bones.head, new THREE.Vector3(0, 1, 0));
        }
        if (bones.neck) {
            bones.neck.userData.restWorldDir = computeRestDir(bones.neck, bones.head, new THREE.Vector3(0, 1, 0));
        }
        if (bones.head) {
            // Head rest vector is strictly straight UP (0, 1, 0) to avoid any misalignment from facial/eye/jaw bones
            bones.head.userData.restWorldDir = new THREE.Vector3(0, 1, 0);
        }

        // Cache finger bones bind pose and dynamic rest vectors
        const cacheFingerGroup = (fingerMap, side) => {
            if (!fingerMap) return;
            for (const [fName, joints] of Object.entries(fingerMap)) {
                if (!joints || joints.length === 0) continue;
                for (let i = 0; i < joints.length; i++) {
                    const bone = joints[i];
                    if (!bone) continue;
                    bone.userData.bindWorldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
                    bone.userData.bindParentWorldQuat = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
                    bone.userData.bindLocalQuat = bone.quaternion.clone();
                    bone.userData.bindWorldPos = bone.getWorldPosition(new THREE.Vector3());
                    bone.userData.bindLocalPos = bone.position.clone();

                    let restDir = null;
                    if (i + 1 < joints.length && joints[i + 1]) {
                        // Vector from this joint to the next real joint in the finger chain
                        const pFrom = bone.getWorldPosition(new THREE.Vector3());
                        const pTo = joints[i + 1].getWorldPosition(new THREE.Vector3());
                        const d = new THREE.Vector3().subVectors(pTo, pFrom);
                        if (d.lengthSq() > 0.00001) {
                            restDir = d.normalize();
                        }
                    } else if (i > 0 && joints[i - 1]) {
                        // For the distal/tip bone, naturally project forward along the segment from previous joint (prev -> curr)
                        // This avoids querying dummy leaf child nodes (_end/_nub) which often have perpendicular/corrupted offsets
                        const pPrev = joints[i - 1].getWorldPosition(new THREE.Vector3());
                        const pCurr = bone.getWorldPosition(new THREE.Vector3());
                        const d = new THREE.Vector3().subVectors(pCurr, pPrev);
                        if (d.lengthSq() > 0.00001) {
                            restDir = d.normalize();
                        }
                    }

                    if (!restDir) {
                        restDir = (i > 0 && joints[i - 1]?.userData?.restWorldDir) 
                            ? joints[i - 1].userData.restWorldDir.clone() 
                            : (bones[side + "Hand"]?.userData?.restWorldDir || (side === "left" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0)));
                    }

                    bone.userData.restWorldDir = restDir.clone().normalize();
                }
            }
        };

        if (character.fingers) {
            cacheFingerGroup(character.fingers.left, "left");
            cacheFingerGroup(character.fingers.right, "right");
        }
    }

    /**
     * Universal Smart GLTF/GLB Loader with Auto-Upright Normalization & Rig Discovery
     */
    loadCustomGLB(fileOrUrl, onLoaded, onError) {
        const onLoadCallback = (gltf) => {
            if (this.activeCharacter && this.activeCharacter.root) {
                this.scene.remove(this.activeCharacter.root);
            }

            const modelWrapper = new THREE.Group();
            modelWrapper.name = "Custom_3D_Avatar_Wrapper";

            const model = gltf.scene;
            const allBones = [];
            const skinnedMeshes = [];
            let isRigged = false;

            // 1. Gather all actual THREE.Bone objects and SkinnedMeshes
            model.traverse((child) => {
                child.matrixAutoUpdate = true;
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.frustumCulled = false;
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => { m.side = THREE.DoubleSide; });
                        } else {
                            child.material.side = THREE.DoubleSide;
                        }
                    }
                }
                if (child.isSkinnedMesh) {
                    child.frustumCulled = false;
                    skinnedMeshes.push(child);
                    if (child.skeleton && child.skeleton.bones) {
                        for (const b of child.skeleton.bones) {
                            if (!allBones.includes(b)) allBones.push(b);
                        }
                        isRigged = true;
                    }
                }
                if (child.isBone || child.type === "Bone") {
                    if (!allBones.includes(child)) allBones.push(child);
                    isRigged = true;
                }
            });

            // Also check all scene nodes for bones if none found yet
            if (allBones.length === 0) {
                model.traverse((child) => {
                    const lowName = child.name.toLowerCase();
                    if (lowName.includes("hips") || lowName.includes("pelvis") || lowName.includes("spine") || 
                        lowName.includes("arm") || lowName.includes("leg") || lowName.includes("humerus") || 
                        lowName.includes("femur") || lowName.includes("thigh") || lowName.includes("elbow") || 
                        lowName.includes("knee") || lowName.includes("tibia") || lowName.includes("skull")) {
                        if (!allBones.includes(child)) allBones.push(child);
                        isRigged = true;
                    }
                });
            }

            console.log(`[CharacterLoader] Loading '${fileOrUrl.name || fileOrUrl}' | IsRigged: ${isRigged} | Total Bones: ${allBones.length} | SkinnedMeshes: ${skinnedMeshes.length}`);

            modelWrapper.add(model);
            this.scene.add(modelWrapper);
            modelWrapper.updateMatrixWorld(true);

            // 2. Robust Anatomical & Standard Rig Resolver with Strict Side Discrimination
            const getSide = (name) => {
                const low = name.toLowerCase();
                if (low.includes("left") || low.includes("mixamorigleft") || low.includes("bip01l") || low.includes("bip_l")) {
                    return "left";
                }
                if (low.includes("right") || low.includes("mixamorigright") || low.includes("bip01r") || low.includes("bip_r")) {
                    return "right";
                }
                // Regex boundary checking for isolated .l / _l / l_ vs .r / _r / r_
                // Note: exclude lumbar (l1-l5) vertebrae from being flagged as left arm/leg
                if (/(^|[._\-])l([._\-\d]|$)/i.test(low) && !/^[ltc]\d+/i.test(low)) {
                    return "left";
                }
                if (/(^|[._\-])r([._\-\d]|$)/i.test(low)) {
                    return "right";
                }
                return "center";
            };

            const findBone = (patterns, side = null, excludes = []) => {
                const combinedExcludes = [...excludes, "jiggle", "helper", "twist", "nub", "socket", "fx"];
                for (const bone of allBones) {
                    const rawName = bone.name;
                    const low = rawName.toLowerCase();
                    const clean = low.replace(/[^a-z0-9]/g, "");

                    // Check exclusions
                    const isEx = combinedExcludes.some(ex => clean.includes(ex.toLowerCase().replace(/[^a-z0-9]/g, "")));
                    if (isEx) continue;

                    // Filter out non-bone hash filenames (.fbx, .obj, .gltf)
                    if (low.endsWith(".fbx") || low.endsWith(".obj") || low.endsWith(".gltf")) continue;

                    const boneSide = getSide(rawName);
                    if (side && boneSide !== "center" && boneSide !== side) {
                        continue;
                    }

                    for (const pat of patterns) {
                        const patClean = pat.toLowerCase().replace(/[^a-z0-9]/g, "");
                        if (low.includes(pat.toLowerCase()) || patClean === clean || (patClean.length >= 3 && clean.includes(patClean))) {
                            if (side) {
                                if (boneSide === side) return bone;
                            } else {
                                return bone;
                            }
                        }
                    }
                }
                return null;
            };

            const bones = {
                // Pelvis / Hips
                hips: findBone(
                    ["mixamorighips", "pelvis", "b_pelvis", "c_hips", "bip01pelvis", "bip_pelvis", "hips", "waist", "root_bone", "hip_bn", "torso_origin"],
                    null,
                    ["rootnode", "scene", "armature", "camera", "light", "skeletal", "object"]
                ) || findBone(["root"], null, ["rootnode", "scene", "armature", "skeletal", "object"]),

                // Lower Spine / Lumbar
                spine: findBone(
                    ["mixamorigspine", "spine_01", "spine01", "spine1", "spine_a", "l5", "l4", "l3", "l2", "l1", "lumbar", "bip01spine", "spine_bn", "spine"],
                    null,
                    ["spine2", "spine3", "spine02", "spine03", "chest", "neck", "head", "arm", "leg", "scapula", "root", "skeletal", "scene", "object"]
                ),

                // Chest / Thoracic
                chest: findBone(
                    ["mixamorigspine2", "mixamorigspine1", "sternum", "th7", "th6", "th5", "th4", "t6", "t5", "t4", "spine_02", "spine_03", "spine02", "spine2", "chest", "upperchest", "upper_chest", "bip01spine2"],
                    null,
                    ["neck", "head", "jaw", "scapula", "clavicle", "root", "skeletal", "scene", "object"]
                ),

                // Neck / Cervical
                neck: findBone(
                    ["mixamorighneck", "neck_01", "neck01", "neck1", "c7", "c6", "c5", "c4", "c3", "cervical", "bip01neck", "neck_bn", "neck"],
                    null,
                    ["head", "skull", "jaw", "root", "skeletal", "scene", "object"]
                ),

                // Head / Skull / Cranium
                head: findBone(
                    ["mixamorighead", "skull", "cranium", "head_01", "head01", "bip01head", "head_bn", "head"],
                    null,
                    ["end", "top", "nub", "neck", "hair", "eye", "ear", "jaw", "jawbone", "root", "scene", "object"]
                ),

                // Face / Jaw / Mouth (for orientation and facial features)
                face: findBone(
                    ["jaw", "mouth", "nose", "beak", "chin", "snout", "jaw_bn", "face"],
                    null,
                    ["root", "scene", "jiggle", "end", "eye"]
                ),

                // Eyes (for facial orientation detection)
                leftEye: findBone(["lefteye", "eye_l", "l_eye", "mixamoriglefteye", "eye_left"], "left"),
                rightEye: findBone(["righteye", "eye_r", "r_eye", "mixamorigrighteye", "eye_right"], "right"),

                // Left Shoulder / Clavicle
                leftShoulder: findBone(
                    ["leftshoulder", "clavicle", "shoulder", "scapula", "clavicle_bn", "arm_clavicle"],
                    "left",
                    ["humerus", "arm", "elbow", "forearm", "hand"]
                ),

                // Left Upper Arm / Humerus
                leftUpperArm: findBone(
                    ["leftarm", "upperarm", "humerus", "arm_01", "bicep", "arm_01_bn", "arm"],
                    "left",
                    ["shoulder", "clavicle", "distal", "base", "forearm", "elbow", "lower", "hand", "finger", "scapula", "roll"]
                ),

                // Left Lower Arm / Forearm / Elbow / Radius / Ulna
                leftLowerArm: findBone(
                    ["leftforearm", "forearm", "elbow", "radius", "ulna", "lowerarm", "arm_02_bn"],
                    "left",
                    ["upper", "shoulder", "clavicle", "humerus", "hand", "wrist", "finger", "roll"]
                ),

                // Left Hand / Wrist
                leftHand: findBone(
                    ["lefthand", "hand", "wrist", "arm_03_bn"],
                    "left",
                    ["pointer", "middle", "ring", "pinkie", "thumb", "finger", "index"]
                ),

                // Right Shoulder / Clavicle
                rightShoulder: findBone(
                    ["rightshoulder", "clavicle", "shoulder", "scapula", "clavicle_bn", "arm_clavicle"],
                    "right",
                    ["humerus", "arm", "elbow", "forearm", "hand"]
                ),

                // Right Upper Arm / Humerus
                rightUpperArm: findBone(
                    ["rightarm", "upperarm", "humerus", "arm_01", "bicep", "arm_01_bn", "arm"],
                    "right",
                    ["shoulder", "clavicle", "distal", "base", "forearm", "elbow", "lower", "hand", "finger", "scapula", "roll"]
                ),

                // Right Lower Arm / Forearm / Elbow / Radius / Ulna
                rightLowerArm: findBone(
                    ["rightforearm", "forearm", "elbow", "radius", "ulna", "lowerarm", "arm_02_bn"],
                    "right",
                    ["upper", "shoulder", "clavicle", "humerus", "hand", "wrist", "finger", "roll"]
                ),

                // Right Hand / Wrist
                rightHand: findBone(
                    ["righthand", "hand", "wrist", "arm_03_bn"],
                    "right",
                    ["pointer", "middle", "ring", "pinkie", "thumb", "finger", "index"]
                ),

                // Left Upper Leg / Thigh / Femur
                leftUpperLeg: findBone(
                    ["leftupleg", "leftthigh", "thigh", "femur", "hip_n", "upperleg", "upleg", "leg_01_bn", "leg_hip"],
                    "left",
                    ["calf", "shin", "knee", "patella", "foot", "toe", "lower", "ankle"]
                ),

                // Left Lower Leg / Knee / Shin / Tibia
                leftLowerLeg: findBone(
                    ["leftleg", "leftshin", "leftcalf", "knee_n", "tibia", "shin", "calf", "lowerleg", "knee_bn", "leg_02_bn", "leg_knee"],
                    "left",
                    ["patella", "thigh", "up", "foot", "toe", "ankle", "femur", "hip"]
                ),

                // Left Foot / Ankle
                leftFoot: findBone(
                    ["leftfoot", "ankle_n", "foot1", "foot", "ankle", "leg_03_bn", "leg_ankle"],
                    "left",
                    ["toe", "heel"]
                ),

                // Left Toe
                leftToe: findBone(
                    ["lefttoe", "toe_l", "toe0_l", "l_toe", "l_toe0", "toe"],
                    "left",
                    ["heel"]
                ),

                // Right Upper Leg / Thigh / Femur
                rightUpperLeg: findBone(
                    ["rightupleg", "rightthigh", "thigh", "femur", "hip_n", "upperleg", "upleg", "leg_01_bn", "leg_hip"],
                    "right",
                    ["calf", "shin", "knee", "patella", "foot", "toe", "lower", "ankle"]
                ),

                // Right Lower Leg / Knee / Shin / Tibia
                rightLowerLeg: findBone(
                    ["rightleg", "rightshin", "rightcalf", "knee_n", "tibia", "shin", "calf", "lowerleg", "knee_bn", "leg_02_bn", "leg_knee"],
                    "right",
                    ["patella", "thigh", "up", "foot", "toe", "ankle", "femur", "hip"]
                ),

                // Right Foot / Ankle
                rightFoot: findBone(
                    ["rightfoot", "ankle_n", "foot1", "foot", "ankle", "leg_03_bn", "leg_ankle"],
                    "right",
                    ["toe", "heel"]
                ),

                // Right Toe
                rightToe: findBone(
                    ["righttoe", "toe_r", "toe0_r", "r_toe", "r_toe0", "toe"],
                    "right",
                    ["heel"]
                )
            };

            // Resolve Finger Joints for Both Hands (Thumb, Index, Middle, Ring, Pinky)
            const resolveFingers = (side) => {
                const aliases = {
                    thumb: ["thumb", "finger01", "finger0"],
                    index: ["pointer", "index", "finger02", "finger1"],
                    middle: ["middle", "finger03", "finger2", "mid"],
                    ring: ["ring", "finger04", "finger3"],
                    pinky: ["pinkie", "pinky", "little", "finger05", "finger4"]
                };
                const fingerMap = {};
                for (const [fName, patList] of Object.entries(aliases)) {
                    fingerMap[fName] = [];
                    for (let j = 1; j <= 4; j++) {
                        const pats = [];
                        for (const alias of patList) {
                            pats.push(
                                `${alias}${j}`, `${alias}_${j}`, `${alias}_0${j}`, `${alias}.${j}`,
                                `${alias}${j}_${side[0]}`, `${alias}_${j}_${side[0]}`, `${alias}_0${j}_${side[0]}`,
                                `${side[0]}_${alias}${j}`, `${side[0]}_${alias}_${j}`,
                                `lefthand${alias}${j}`, `righthand${alias}${j}`,
                                `${alias}_${side[0]}_${j}`, `${alias}_${side[0]}_0${j}`
                            );
                        }
                        const b = findBone(pats, side, ["end", "meta", "metacarpal"]);
                        if (b) {
                            fingerMap[fName].push(b);
                        }
                    }
                }
                return fingerMap;
            };

            const leftFingers = isRigged ? resolveFingers("left") : {};
            const rightFingers = isRigged ? resolveFingers("right") : {};

            // Fallback parent-child chains
            if (!bones.chest) bones.chest = bones.spine;
            if (!bones.spine && bones.chest) bones.spine = bones.chest;
            if (!bones.neck && bones.head && bones.head.parent) bones.neck = bones.head.parent;

            // 3. SKELETON-AWARE UPRIGHT ALIGNMENT (Prevents models from lying down or flipping)
            modelWrapper.updateMatrixWorld(true);

            if (isRigged && bones.hips && (bones.head || bones.neck || bones.chest)) {
                const pHips = bones.hips.getWorldPosition(new THREE.Vector3());
                const pHead = (bones.head || bones.neck || bones.chest).getWorldPosition(new THREE.Vector3());
                const spineVec = new THREE.Vector3().subVectors(pHead, pHips).normalize();

                console.log(`[CharacterLoader] Detected spine vector: (${spineVec.x.toFixed(2)}, ${spineVec.y.toFixed(2)}, ${spineVec.z.toFixed(2)})`);

                if (spineVec.y < 0.6) {
                    if (spineVec.z > 0.4) {
                        console.log("[CharacterLoader] Character lying on back (+Z). Rotating -90deg on X to stand upright!");
                        model.rotation.x = -Math.PI / 2;
                    } else if (spineVec.z < -0.4) {
                        console.log("[CharacterLoader] Character lying on stomach (-Z). Rotating +90deg on X to stand upright!");
                        model.rotation.x = Math.PI / 2;
                    } else if (spineVec.x > 0.4) {
                        console.log("[CharacterLoader] Character lying on right (+X). Rotating -90deg on Z to stand upright!");
                        model.rotation.z = -Math.PI / 2;
                    } else if (spineVec.x < -0.4) {
                        console.log("[CharacterLoader] Character lying on left (-X). Rotating +90deg on Z to stand upright!");
                        model.rotation.z = Math.PI / 2;
                    }
                    modelWrapper.updateMatrixWorld(true);
                }
            } else {
                // Static mesh orientation fallback
                const rawBox = new THREE.Box3().setFromObject(model);
                const rawSize = rawBox.getSize(new THREE.Vector3());
                if (rawSize.z > rawSize.y * 1.3 && rawSize.z > rawSize.x * 1.1) {
                    console.log("[CharacterLoader] Detected static Z-Up model. Rotating -90deg on X to stand upright!");
                    model.rotation.x = -Math.PI / 2;
                    modelWrapper.updateMatrixWorld(true);
                }
            }

            // 3.1 COMPREHENSIVE SKELETON-AWARE FORWARD FACING CHECK (Ensures 100% of models face camera +Z)
            modelWrapper.updateMatrixWorld(true);

            if (isRigged) {
                let detectedForwardVec = null;
                let detectionMethod = "none";

                // Method A: Shoulders span cross Up (Most authoritative anatomical humanoid method)
                const bLeft = bones.leftUpperArm || bones.leftShoulder;
                const bRight = bones.rightUpperArm || bones.rightShoulder;
                if (bLeft && bRight) {
                    const pLeft = bLeft.getWorldPosition(new THREE.Vector3());
                    const pRight = bRight.getWorldPosition(new THREE.Vector3());
                    // Vector from Right Shoulder to Left Shoulder (Points along +X when character faces camera +Z)
                    const vShoulder = new THREE.Vector3().subVectors(pLeft, pRight);
                    const shoulderDist = vShoulder.length();

                    if (shoulderDist > 0.05) {
                        const vUp = new THREE.Vector3(0, 1, 0);
                        // Forward normal = (Left - Right) x Up
                        // In Three.js: (+X) x (+Y) = (0, 0, 1) = +Z (Forward towards camera)
                        const vForward = new THREE.Vector3().crossVectors(vShoulder.normalize(), vUp).normalize();
                        if (Math.abs(vForward.x) > 0.05 || Math.abs(vForward.z) > 0.05) {
                            detectedForwardVec = vForward;
                            detectionMethod = `Shoulder Cross (${vForward.x.toFixed(2)}, ${vForward.z.toFixed(2)})`;
                        }
                    }
                }

                // Method B: Eyes / Face / Jaw relative to Head / Neck
                if (!detectedForwardVec && (bones.head || bones.neck)) {
                    const pHead = (bones.head || bones.neck).getWorldPosition(new THREE.Vector3());
                    const faceBone = bones.face || bones.leftEye || bones.rightEye || allBones.find(b => {
                        const low = b.name.toLowerCase();
                        return (low.includes("jaw") || low.includes("mouth") || low.includes("nose") || low.includes("beak") || low.includes("chin") || low.includes("snout") || low.includes("face") || low.includes("eye")) && !low.includes("jiggle") && !low.includes("end");
                    });
                    if (faceBone) {
                        const pFace = faceBone.getWorldPosition(new THREE.Vector3());
                        const vFace = new THREE.Vector3().subVectors(pFace, pHead);
                        vFace.y = 0; // Project to XZ plane
                        if (vFace.lengthSq() > 0.0001) {
                            detectedForwardVec = vFace.normalize();
                            detectionMethod = `Face/Eyes Vector (${vFace.x.toFixed(2)}, ${vFace.z.toFixed(2)})`;
                        }
                    }
                }

                // Method C: Toes relative to Feet (Ankle)
                if (!detectedForwardVec && (bones.leftToe || bones.rightToe) && (bones.leftFoot || bones.rightFoot)) {
                    const toeBone = bones.leftToe || bones.rightToe;
                    const footBone = (toeBone === bones.leftToe ? bones.leftFoot : bones.rightFoot) || bones.leftFoot || bones.rightFoot;
                    if (toeBone && footBone) {
                        const pToe = toeBone.getWorldPosition(new THREE.Vector3());
                        const pFoot = footBone.getWorldPosition(new THREE.Vector3());
                        const vToe = new THREE.Vector3().subVectors(pToe, pFoot);
                        vToe.y = 0; // Project to XZ plane
                        if (vToe.lengthSq() > 0.0001) {
                            detectedForwardVec = vToe.normalize();
                            detectionMethod = `Toes Vector (${vToe.x.toFixed(2)}, ${vToe.z.toFixed(2)})`;
                        }
                    }
                }

                if (detectedForwardVec) {
                    // Target forward is +Z (0, 0, 1)
                    // Current forward is (detectedForwardVec.x, 0, detectedForwardVec.z)
                    // Angle between current forward and +Z:
                    const currentAngle = Math.atan2(detectedForwardVec.x, detectedForwardVec.z);
                    // Snap to nearest 90 degrees (0, PI/2, PI, -PI/2)
                    const snapAngle = Math.round(currentAngle / (Math.PI / 2)) * (Math.PI / 2);

                    console.log(`[CharacterLoader] Detected model orientation via ${detectionMethod}: currentAngle=${(currentAngle * 180 / Math.PI).toFixed(1)}°, snapAngle=${(snapAngle * 180 / Math.PI).toFixed(1)}°`);

                    if (Math.abs(snapAngle) > 0.01) {
                        console.log(`[CharacterLoader] Auto-Aligning model to face camera (+Z): rotating ${(-snapAngle * 180 / Math.PI).toFixed(1)}° on Y`);
                        model.rotation.y -= snapAngle;
                        modelWrapper.updateMatrixWorld(true);
                    } else {
                        console.log("[CharacterLoader] Model already correctly facing camera (+Z)!");
                    }
                }
            }

            // 4. UNIVERSAL SCALE NORMALIZATION (~1.80m target height) & GROUNDING (Y = 0)
            modelWrapper.updateMatrixWorld(true);

            const initialBox = new THREE.Box3().setFromObject(model);
            let characterHeight = initialBox.getSize(new THREE.Vector3()).y;

            if (isRigged && (bones.head || bones.neck) && (bones.leftFoot || bones.rightFoot || bones.leftLowerLeg || bones.rightLowerLeg)) {
                const topY = (bones.head || bones.neck).getWorldPosition(new THREE.Vector3()).y + 0.15;
                const footL = bones.leftFoot ? bones.leftFoot.getWorldPosition(new THREE.Vector3()).y : initialBox.min.y;
                const footR = bones.rightFoot ? bones.rightFoot.getWorldPosition(new THREE.Vector3()).y : initialBox.min.y;
                const bottomY = Math.min(footL, footR, initialBox.min.y);
                const skeletalHeight = topY - bottomY;
                if (skeletalHeight > 0.2) {
                    characterHeight = skeletalHeight;
                }
            }

            const targetHeight = 1.80;
            const scaleFactor = (characterHeight > 0.05) ? (targetHeight / characterHeight) : 1.0;

            console.log(`[CharacterLoader] Measured Character Height: ${characterHeight.toFixed(3)}m | Scale Factor: ${scaleFactor.toFixed(4)}`);

            model.scale.multiplyScalar(scaleFactor);
            modelWrapper.updateMatrixWorld(true);

            // Center at (0, 0, 0) and place bottom at Y = 0 (Feet on Floor - No Floating!)
            const finalGroundedBox = new THREE.Box3().setFromObject(model);
            const finalCenter = finalGroundedBox.getCenter(new THREE.Vector3());

            model.position.x -= finalCenter.x;
            model.position.z -= finalCenter.z;
            model.position.y -= finalGroundedBox.min.y;
            modelWrapper.updateMatrixWorld(true);

            // 5. Hand Anchors for Superpower Particle VFX
            const leftHandAnchor = new THREE.Object3D();
            leftHandAnchor.name = "VFX_LeftHandAnchor";
            if (bones.leftHand) {
                bones.leftHand.add(leftHandAnchor);
            } else if (bones.leftLowerArm) {
                leftHandAnchor.position.set(0.25, 0, 0);
                bones.leftLowerArm.add(leftHandAnchor);
            } else {
                modelWrapper.add(leftHandAnchor);
            }

            const rightHandAnchor = new THREE.Object3D();
            rightHandAnchor.name = "VFX_RightHandAnchor";
            if (bones.rightHand) {
                bones.rightHand.add(rightHandAnchor);
            } else if (bones.rightLowerArm) {
                rightHandAnchor.position.set(-0.25, 0, 0);
                bones.rightLowerArm.add(rightHandAnchor);
            } else {
                modelWrapper.add(rightHandAnchor);
            }

            this.activeCharacter = {
                root: modelWrapper,
                model: model,
                isSkinnedMesh: isRigged,
                baseHeight: 0.95,
                skinnedMeshes: skinnedMeshes,
                allBones: allBones,
                bones: isRigged ? bones : null,
                fingers: isRigged ? { left: leftFingers, right: rightFingers } : null,
                leftHandAnchor: leftHandAnchor,
                rightHandAnchor: rightHandAnchor
            };

            // 6. CACHE BIND TRANSFORMS & DYNAMIC REST DIRECTION VECTORS (v_rest)
            if (isRigged) {
                this.cacheBindPose(this.activeCharacter);
            }

            console.log("[CharacterLoader] Configured character rig:", {
                hips: bones.hips ? bones.hips.name : "none",
                spine: bones.spine ? bones.spine.name : "none",
                chest: bones.chest ? bones.chest.name : "none",
                neck: bones.neck ? bones.neck.name : "none",
                head: bones.head ? bones.head.name : "none",
                leftUpperArm: bones.leftUpperArm ? bones.leftUpperArm.name : "none",
                leftLowerArm: bones.leftLowerArm ? bones.leftLowerArm.name : "none",
                leftHand: bones.leftHand ? bones.leftHand.name : "none",
                rightUpperArm: bones.rightUpperArm ? bones.rightUpperArm.name : "none",
                rightLowerArm: bones.rightLowerArm ? bones.rightLowerArm.name : "none",
                rightHand: bones.rightHand ? bones.rightHand.name : "none",
                leftUpperLeg: bones.leftUpperLeg ? bones.leftUpperLeg.name : "none",
                leftLowerLeg: bones.leftLowerLeg ? bones.leftLowerLeg.name : "none",
                rightUpperLeg: bones.rightUpperLeg ? bones.rightUpperLeg.name : "none",
                rightLowerLeg: bones.rightLowerLeg ? bones.rightLowerLeg.name : "none"
            });

            if (onLoaded) onLoaded(this.activeCharacter);
        };

        if (typeof fileOrUrl === "string") {
            this.gltfLoader.load(fileOrUrl, onLoadCallback, undefined, onError);
        } else {
            const reader = new FileReader();
            reader.readAsArrayBuffer(fileOrUrl);
            reader.onload = (e) => {
                this.gltfLoader.parse(e.target.result, '', onLoadCallback, onError);
            };
        }
    }
}
