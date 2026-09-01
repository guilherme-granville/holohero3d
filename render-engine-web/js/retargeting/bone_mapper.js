/**
 * ==============================================================================
 * REAL-TIME 3D BONE MAPPER & RETARGETING ENGINE (6-DOF ARM & WRIST TWIST CAPABLE)
 * ==============================================================================
 * - Full 6-DOF hand orientation with dynamic Palm Normal (Wrist & Forearm Twist / Pronation / Supination)
 * - True 3D spatial arm retargeting using MediaPipe 3D metric world vectors
 * - Parent-space kinematic retargeting: adapts seamlessly to any GLB/GLTF rig (Mixamo, Blender, VRM, A-Pose, T-Pose)
 * - Sequential parent-to-child world matrix propagation (arms, forearms, hands, fingers, legs, spine, head)
 * - Natural mirror-mode spatial movement across the 3D stage
 * - Numerically stable quaternion rotation solver (Zero NaNs, zero singularities, zero gimbal flips)
 */

class BoneMapper {
    constructor() {
        this.isMirrored = false;
        this.scaleMultiplier = 1.0;
        this.ikSensitivity = 1.0;
        this.depthSensitivity = 1.2;
        this.lateralSensitivity = 1.0;
        this.autoScale = false;
    }

    /**
     * Converts normalized MediaPipe pose landmark to 3D stage coordinate space
     */
    toVector3(lm) {
        if (!lm) return new THREE.Vector3();
        let rawX = lm.x;
        if (this.isMirrored) {
            rawX = 1.0 - rawX;
        }
        const vx = (rawX - 0.5) * 2.0;
        const vy = -(lm.y - 0.5) * 2.0;
        const vz = -(lm.z || 0) * 2.0;
        return new THREE.Vector3(vx, vy, vz);
    }

    /**
     * Converts MediaPipe 3D World Landmark (meters) to Three.js stage coordinate space
     */
    toWorldVector3(wlm) {
        if (!wlm) return null;
        let rawX = wlm.x;
        if (this.isMirrored) {
            rawX = -rawX;
        }
        return new THREE.Vector3(rawX, -wlm.y, -wlm.z);
    }

    /**
     * Numerically stable quaternion calculation between two arbitrary 3D direction vectors.
     * Prevents NaN artifacts on anti-parallel or colinear vectors.
     */
    _getRotationBetween(vFrom, vTo) {
        const u = vFrom.clone().normalize();
        const v = vTo.clone().normalize();
        const dot = THREE.MathUtils.clamp(u.dot(v), -1.0, 1.0);

        if (dot >= 0.999999) {
            return new THREE.Quaternion(); // Identity
        }

        if (dot <= -0.999999) {
            let ortho = new THREE.Vector3(0, 1, 0).cross(u);
            if (ortho.lengthSq() < 0.001) {
                ortho = new THREE.Vector3(1, 0, 0).cross(u);
            }
            ortho.normalize();
            return new THREE.Quaternion().setFromAxisAngle(ortho, Math.PI);
        }

        const cross = new THREE.Vector3().crossVectors(u, v);
        const q = new THREE.Quaternion(cross.x, cross.y, cross.z, 1 + dot);
        return q.normalize();
    }

    /**
     * Retargets an individual bone using parent-space rotation deltas and bind pose
     */
    _retargetBone(bone, targetWorldDir, slerpFactor = 0.65) {
        if (!bone || !targetWorldDir || targetWorldDir.lengthSq() < 0.0001) return;

        const restWorldDir = bone.userData.restWorldDir;
        if (!restWorldDir || restWorldDir.lengthSq() < 0.0001) return;

        const bindLocalQuat = bone.userData.bindLocalQuat;
        if (!bindLocalQuat) return;

        // Current parent world rotation
        const parentWorldQuat = new THREE.Quaternion();
        if (bone.parent) {
            bone.parent.updateWorldMatrix(true, false);
            bone.parent.getWorldQuaternion(parentWorldQuat);
        }

        // Bind parent world rotation
        const bindParentWorldQuat = bone.userData.bindParentWorldQuat || new THREE.Quaternion();

        // Convert targetWorldDir to parent bone's local space
        const targetParentDir = targetWorldDir.clone().applyQuaternion(parentWorldQuat.clone().invert()).normalize();

        // Convert restWorldDir to parent bone's local space in bind pose
        const restParentDir = restWorldDir.clone().applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();

        // Rotation from restParentDir to targetParentDir in parent coordinate frame
        const qDelta = this._getRotationBetween(restParentDir, targetParentDir);

        // Local target rotation = qDelta * bindLocalQuat
        const targetLocalQuat = qDelta.clone().multiply(bindLocalQuat);

        if (!isNaN(targetLocalQuat.x) && !isNaN(targetLocalQuat.y) && !isNaN(targetLocalQuat.z) && !isNaN(targetLocalQuat.w)) {
            const factor = Math.max(0.1, Math.min(1.0, slerpFactor * this.ikSensitivity));
            bone.quaternion.slerp(targetLocalQuat, factor);
            bone.updateMatrix();
            bone.updateWorldMatrix(true, false);
        }
    }

    /**
     * Retargets the hand bone with full 6-DOF 3D orientation (Forward Direction + Palm Normal Twist)
     */
    _retargetHandWithTwist(handBone, targetForward, targetNormal, side, slerpFactor = 0.8) {
        if (!handBone || !targetForward || targetForward.lengthSq() < 0.0001) return;

        const restWorldDir = handBone.userData.restWorldDir;
        if (!restWorldDir || restWorldDir.lengthSq() < 0.0001) return;

        const bindLocalQuat = handBone.userData.bindLocalQuat;
        if (!bindLocalQuat) return;

        // 1. Primary Direction Alignment (Wrist -> Knuckles/Palm)
        const parentWorldQuat = new THREE.Quaternion();
        if (handBone.parent) {
            handBone.parent.updateWorldMatrix(true, false);
            handBone.parent.getWorldQuaternion(parentWorldQuat);
        }
        const bindParentWorldQuat = handBone.userData.bindParentWorldQuat || new THREE.Quaternion();

        const targetParentDir = targetForward.clone().applyQuaternion(parentWorldQuat.clone().invert()).normalize();
        const restParentDir = restWorldDir.clone().applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();
        const qDirDelta = this._getRotationBetween(restParentDir, targetParentDir);

        let targetLocalQuat = qDirDelta.clone().multiply(bindLocalQuat);

        // 2. Full Palm Normal Roll/Twist Resolution
        if (targetNormal && targetNormal.lengthSq() > 0.001) {
            // Compute expected normal in parent space after primary direction rotation
            const restWorldNormal = new THREE.Vector3(0, -1, 0); // Default palm facing down in standard bind pose
            const restParentNormal = restWorldNormal.clone().applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();
            const intermediateParentNormal = restParentNormal.clone().applyQuaternion(qDirDelta).projectOnPlane(targetParentDir).normalize();
            
            const targetParentNormal = targetNormal.clone().applyQuaternion(parentWorldQuat.clone().invert()).projectOnPlane(targetParentDir).normalize();

            if (intermediateParentNormal.lengthSq() > 0.01 && targetParentNormal.lengthSq() > 0.01) {
                const qTwistDelta = this._getRotationBetween(intermediateParentNormal, targetParentNormal);
                targetLocalQuat = qTwistDelta.clone().multiply(targetLocalQuat);
            }
        }

        if (!isNaN(targetLocalQuat.x) && !isNaN(targetLocalQuat.y) && !isNaN(targetLocalQuat.z) && !isNaN(targetLocalQuat.w)) {
            const factor = Math.max(0.15, Math.min(1.0, slerpFactor * this.ikSensitivity));
            handBone.quaternion.slerp(targetLocalQuat, factor);
            handBone.updateMatrix();
            handBone.updateWorldMatrix(true, false);
        }
    }

    /**
     * Retargets Head and Neck with full 3D 6-DOF Orientation (Yaw, Pitch, Roll)
     */
    _retargetHeadWithOrientation(headBone, neckBone, targetUp, targetForward, slerpFactor = 0.65) {
        if (!headBone && !neckBone) return;
        if (!targetUp || targetUp.lengthSq() < 0.0001) return;
        if (!targetForward || targetForward.lengthSq() < 0.0001) return;

        // Ensure orthonormal target basis in stage coordinates (+Y Up, +Z Forward, +X Right)
        const vUp = targetUp.clone().normalize();
        let vFwd = targetForward.clone().projectOnPlane(vUp).normalize();
        if (vFwd.lengthSq() < 0.001) {
            vFwd = new THREE.Vector3(0, 0, 1).projectOnPlane(vUp).normalize();
        }

        // 1. Apply 25% cervical rotation to Neck Bone first if available
        if (neckBone && neckBone.userData && neckBone.userData.bindLocalQuat) {
            const bindLocalQuat = neckBone.userData.bindLocalQuat;
            const parentWorldQuat = new THREE.Quaternion();
            if (neckBone.parent) {
                neckBone.parent.updateWorldMatrix(true, false);
                neckBone.parent.getWorldQuaternion(parentWorldQuat);
            }
            const bindParentWorldQuat = neckBone.userData.bindParentWorldQuat || new THREE.Quaternion();

            const targetParentUp = vUp.clone().applyQuaternion(parentWorldQuat.clone().invert()).normalize();
            const targetParentFwd = vFwd.clone().applyQuaternion(parentWorldQuat.clone().invert()).normalize();

            const restParentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();
            const restParentFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();

            const qUpDelta = this._getRotationBetween(restParentUp, targetParentUp);
            const intermediateFwd = restParentFwd.clone().applyQuaternion(qUpDelta).projectOnPlane(targetParentUp).normalize();
            const qFwdDelta = this._getRotationBetween(intermediateFwd, targetParentFwd);
            const qDelta = qFwdDelta.clone().multiply(qUpDelta);

            const qNeckSubtle = new THREE.Quaternion().slerp(qDelta, 0.3);
            const targetLocalQuat = qNeckSubtle.clone().multiply(bindLocalQuat);

            if (!isNaN(targetLocalQuat.x) && !isNaN(targetLocalQuat.y) && !isNaN(targetLocalQuat.z) && !isNaN(targetLocalQuat.w)) {
                neckBone.quaternion.slerp(targetLocalQuat, 0.45);
                neckBone.updateMatrix();
                neckBone.updateWorldMatrix(true, false);
            }
        }

        // 2. Apply full remaining rotation to Head Bone
        if (headBone && headBone.userData && headBone.userData.bindLocalQuat) {
            const bindLocalQuat = headBone.userData.bindLocalQuat;
            const parentWorldQuat = new THREE.Quaternion();
            if (headBone.parent) {
                headBone.parent.updateWorldMatrix(true, false);
                headBone.parent.getWorldQuaternion(parentWorldQuat);
            }
            const bindParentWorldQuat = headBone.userData.bindParentWorldQuat || new THREE.Quaternion();

            // Target basis in parent space
            const targetParentUp = vUp.clone().applyQuaternion(parentWorldQuat.clone().invert()).normalize();
            const targetParentFwd = vFwd.clone().applyQuaternion(parentWorldQuat.clone().invert()).normalize();

            // Rest basis in parent space (humanoid standard: Up=(0,1,0), Forward=(0,0,1))
            const restParentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();
            const restParentFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bindParentWorldQuat.clone().invert()).normalize();

            // Delta rotation from rest to target
            const qUpDelta = this._getRotationBetween(restParentUp, targetParentUp);
            const intermediateFwd = restParentFwd.clone().applyQuaternion(qUpDelta).projectOnPlane(targetParentUp).normalize();
            const qFwdDelta = this._getRotationBetween(intermediateFwd, targetParentFwd);
            const qDelta = qFwdDelta.clone().multiply(qUpDelta);

            const targetLocalQuat = qDelta.clone().multiply(bindLocalQuat);
            if (!isNaN(targetLocalQuat.x) && !isNaN(targetLocalQuat.y) && !isNaN(targetLocalQuat.z) && !isNaN(targetLocalQuat.w)) {
                const factor = Math.max(0.2, Math.min(1.0, slerpFactor * this.ikSensitivity));
                headBone.quaternion.slerp(targetLocalQuat, factor);
                headBone.updateMatrix();
                headBone.updateWorldMatrix(true, false);
            }
        }
    }

    /**
     * Main retargeting loop invoked on every MediaPipe frame
     */
    retarget(character, poseData) {
        if (!character || !poseData || !poseData.landmarks) return;

        const lms = poseData.landmarks;
        const wlms = poseData.world_landmarks;
        if (lms.length < 33) return;

        const bones = character.bones;
        if (!bones) return;

        // Extract Standard Normalized Coordinates
        const NOSE = this.toVector3(lms[0]);
        const L_SHOULDER = this.toVector3(lms[11]);
        const R_SHOULDER = this.toVector3(lms[12]);
        const L_ELBOW = this.toVector3(lms[13]);
        const R_ELBOW = this.toVector3(lms[14]);
        const L_WRIST = this.toVector3(lms[15]);
        const R_WRIST = this.toVector3(lms[16]);
        const L_HIP = this.toVector3(lms[23]);
        const R_HIP = this.toVector3(lms[24]);
        const L_KNEE = this.toVector3(lms[25]);
        const R_KNEE = this.toVector3(lms[26]);
        const L_ANKLE = this.toVector3(lms[27]);
        const R_ANKLE = this.toVector3(lms[28]);
        const L_FOOT = this.toVector3(lms[31]);
        const R_FOOT = this.toVector3(lms[32]);

        const hipCenter = new THREE.Vector3().addVectors(L_HIP, R_HIP).multiplyScalar(0.5);
        const shoulderCenter = new THREE.Vector3().addVectors(L_SHOULDER, R_SHOULDER).multiplyScalar(0.5);

        // 0. ROOT SPATIAL MOTION & DEPTH TRACKING (Forward/Backward & Left/Right, Strictly Grounded at Y = 0)
        if (character.root) {
            // Lateral Position (X Axis) - Natural mirror walking: stepping right moves character to screen right (+X)
            const rawHipX = (lms[23].x + lms[24].x) * 0.5;
            const mappedX = (this.isMirrored ? (0.5 - rawHipX) : (rawHipX - 0.5)) * 2.8 * (this.lateralSensitivity || 1.0);

            // Depth / Distance Tracking (Z Axis) based on user's real distance to camera
            const torsoH = poseData.metrics?.torso_height || Math.hypot(L_SHOULDER.x - L_HIP.x, L_SHOULDER.y - L_HIP.y);
            const refTorsoH = 0.30;
            const depthRatio = THREE.MathUtils.clamp(torsoH / refTorsoH, 0.4, 2.5);

            const targetZ = (depthRatio - 1.0) * 3.5 * (this.depthSensitivity || 1.2);
            const clampedZ = THREE.MathUtils.clamp(targetZ, -3.5, 3.0);

            character.root.position.x = THREE.MathUtils.lerp(character.root.position.x, mappedX, 0.18);
            character.root.position.z = THREE.MathUtils.lerp(character.root.position.z, clampedZ, 0.18);
            character.root.position.y = 0.0;
        }

        // 1. SPINE & CHEST: Torso points upright from hips to shoulders
        const spineDir = new THREE.Vector3().subVectors(shoulderCenter, hipCenter).normalize();
        if (spineDir.y > 0.2) {
            if (bones.chest) {
                this._retargetBone(bones.chest, spineDir, 0.45);
                bones.chest.updateWorldMatrix(true, false);
            } else if (bones.spine) {
                this._retargetBone(bones.spine, spineDir, 0.45);
                bones.spine.updateWorldMatrix(true, false);
            }
        }

        // 2. HEAD & NECK: Full 6-DOF 3D Tracking (Pitch, Yaw, Roll)
        let headUp = new THREE.Vector3(0, 1, 0);
        let headForward = new THREE.Vector3(0, 0, 1);

        if (poseData.head_orientation) {
            const ho = poseData.head_orientation;
            let fwdX = ho.forward.x;
            if (this.isMirrored) fwdX = -fwdX;
            let upX = ho.up.x;
            if (this.isMirrored) upX = -upX;

            headForward = new THREE.Vector3(fwdX, ho.forward.y, ho.forward.z).normalize();
            headUp = new THREE.Vector3(upX, ho.up.y, ho.up.z).normalize();
        } else if (poseData.face_landmarks && poseData.face_landmarks.length >= 7) {
            const fNose = this.toVector3(poseData.face_landmarks[0]);
            const fChin = this.toVector3(poseData.face_landmarks[1]);
            const fForehead = this.toVector3(poseData.face_landmarks[2]);
            const fLeftEar = this.toVector3(poseData.face_landmarks[3]);
            const fRightEar = this.toVector3(poseData.face_landmarks[4]);

            // Up Vector (Chin -> Forehead)
            const upVec = new THREE.Vector3().subVectors(fForehead, fChin);
            if (upVec.lengthSq() > 0.001) headUp = upVec.normalize();

            // Lateral Vector (Ears)
            let latVec = new THREE.Vector3().subVectors(fRightEar, fLeftEar).normalize();
            if (latVec.lengthSq() > 0.001 && headUp.lengthSq() > 0.001) {
                let fwdVec = new THREE.Vector3().crossVectors(latVec, headUp).normalize();
                if (fwdVec.z < 0) fwdVec.negate();
                headForward = fwdVec;
            }
        } else {
            // Fallback from body pose nose and shoulders
            const noseDir = new THREE.Vector3().subVectors(NOSE, shoulderCenter).normalize();
            if (noseDir.lengthSq() > 0.01) {
                headUp = noseDir;
            }
        }

        this._retargetHeadWithOrientation(bones.head, bones.neck, headUp, headForward, 0.85);

        // 3. LEFT & RIGHT ARM 3D KINEMATICS WITH CALIBRATED DEPTH & ANTI-COLLISION
        let lUpperDir = new THREE.Vector3().subVectors(L_ELBOW, L_SHOULDER).normalize();
        let lWristPos = (poseData.left_hand_landmarks && poseData.left_hand_landmarks.length >= 21) 
            ? this.toVector3(poseData.left_hand_landmarks[0]) 
            : L_WRIST;
        let lLowerDir = new THREE.Vector3().subVectors(lWristPos, L_ELBOW).normalize();

        let rUpperDir = new THREE.Vector3().subVectors(R_ELBOW, R_SHOULDER).normalize();
        let rWristPos = (poseData.right_hand_landmarks && poseData.right_hand_landmarks.length >= 21) 
            ? this.toVector3(poseData.right_hand_landmarks[0]) 
            : R_WRIST;
        let rLowerDir = new THREE.Vector3().subVectors(rWristPos, R_ELBOW).normalize();

        // High-Precision 3D Metric World Landmarks (True depth in meters)
        if (wlms && wlms.length >= 17) {
            const wL_SHOULDER = this.toWorldVector3(wlms[11]);
            const wL_ELBOW = this.toWorldVector3(wlms[13]);
            const wL_WRIST = this.toWorldVector3(wlms[15]);

            const wR_SHOULDER = this.toWorldVector3(wlms[12]);
            const wR_ELBOW = this.toWorldVector3(wlms[14]);
            const wR_WRIST = this.toWorldVector3(wlms[16]);

            if (wL_SHOULDER && wL_ELBOW && wL_WRIST) {
                const wUpperL = new THREE.Vector3().subVectors(wL_ELBOW, wL_SHOULDER);
                wUpperL.z *= this.depthSensitivity;
                wUpperL.normalize();
                if (wUpperL.lengthSq() > 0.01) lUpperDir.copy(wUpperL);

                // Modulate lower arm depth while preserving anatomical wrist XY position
                const depthZL = (wL_WRIST.z - wL_ELBOW.z) * this.depthSensitivity;
                lLowerDir = new THREE.Vector3(lWristPos.x - L_ELBOW.x, lWristPos.y - L_ELBOW.y, depthZL).normalize();
            }

            if (wR_SHOULDER && wR_ELBOW && wR_WRIST) {
                const wUpperR = new THREE.Vector3().subVectors(wR_ELBOW, wR_SHOULDER);
                wUpperR.z *= this.depthSensitivity;
                wUpperR.normalize();
                if (wUpperR.lengthSq() > 0.01) rUpperDir.copy(wUpperR);

                // Modulate lower arm depth while preserving anatomical wrist XY position
                const depthZR = (wR_WRIST.z - wR_ELBOW.z) * this.depthSensitivity;
                rLowerDir = new THREE.Vector3(rWristPos.x - R_ELBOW.x, rWristPos.y - R_ELBOW.y, depthZR).normalize();
            }
        }

        // Anti-Penetration 1: Torso / Chest Self-Collision Prevention
        // If arms point backwards into the ribcage/torso, smoothly clamp depth so hands rest in front of body
        if (lLowerDir.z < -0.15 && Math.abs(lWristPos.x) < 0.45) {
            lLowerDir.z = Math.max(lLowerDir.z, 0.05);
            lLowerDir.normalize();
        }
        if (rLowerDir.z < -0.15 && Math.abs(rWristPos.x) < 0.45) {
            rLowerDir.z = Math.max(rLowerDir.z, 0.05);
            rLowerDir.normalize();
        }

        // Anti-Penetration 2: Inter-Hand Contact Alignment (Hands meeting without crossing/clipping)
        const interHandDist = lWristPos.distanceTo(rWristPos);
        if (interHandDist < 0.22) {
            // Hands are brought together (prayer, clapping, touching hands)
            const handMidX = (lWristPos.x + rWristPos.x) * 0.5;
            const handMidY = (lWristPos.y + rWristPos.y) * 0.5;
            const handMidZ = Math.max(lWristPos.z, rWristPos.z, 0.15); // ensure in front of chest

            const targetL = new THREE.Vector3(handMidX - 0.06, handMidY, handMidZ);
            const targetR = new THREE.Vector3(handMidX + 0.06, handMidY, handMidZ);

            lLowerDir.lerp(new THREE.Vector3().subVectors(targetL, L_ELBOW).normalize(), 0.7).normalize();
            rLowerDir.lerp(new THREE.Vector3().subVectors(targetR, R_ELBOW).normalize(), 0.7).normalize();
        }

        // Apply to Left Arm Bones
        if (bones.leftUpperArm && lUpperDir.lengthSq() > 0.001) {
            this._retargetBone(bones.leftUpperArm, lUpperDir, 0.85);
            bones.leftUpperArm.updateWorldMatrix(true, false);
        }
        if (bones.leftLowerArm && lLowerDir.lengthSq() > 0.001) {
            this._retargetBone(bones.leftLowerArm, lLowerDir, 0.85);
            bones.leftLowerArm.updateWorldMatrix(true, false);
        }

        // Apply to Right Arm Bones
        if (bones.rightUpperArm && rUpperDir.lengthSq() > 0.001) {
            this._retargetBone(bones.rightUpperArm, rUpperDir, 0.85);
            bones.rightUpperArm.updateWorldMatrix(true, false);
        }
        if (bones.rightLowerArm && rLowerDir.lengthSq() > 0.001) {
            this._retargetBone(bones.rightLowerArm, rLowerDir, 0.85);
            bones.rightLowerArm.updateWorldMatrix(true, false);
        }

        // 5. LEFT LEG & FOOT: Thigh -> Shin -> Foot
        const lLegVisible = (lms[23].visibility ?? 1.0) > 0.35 && (lms[25].visibility ?? 1.0) > 0.35;
        if (lLegVisible && bones.leftUpperLeg) {
            const lThighDir = new THREE.Vector3().subVectors(L_KNEE, L_HIP).normalize();
            if (lThighDir.y < 0.3) {
                this._retargetBone(bones.leftUpperLeg, lThighDir, 0.55);
                bones.leftUpperLeg.updateWorldMatrix(true, false);
            }
            if ((lms[27].visibility ?? 1.0) > 0.35 && bones.leftLowerLeg) {
                const lShinDir = new THREE.Vector3().subVectors(L_ANKLE, L_KNEE).normalize();
                if (lShinDir.y < 0.3) {
                    this._retargetBone(bones.leftLowerLeg, lShinDir, 0.55);
                    bones.leftLowerLeg.updateWorldMatrix(true, false);
                }
            }
            if ((lms[31].visibility ?? 1.0) > 0.3 && bones.leftFoot) {
                const lFootDir = new THREE.Vector3().subVectors(L_FOOT, L_ANKLE).normalize();
                this._retargetBone(bones.leftFoot, lFootDir, 0.55);
                bones.leftFoot.updateWorldMatrix(true, false);
            }
        } else {
            if (bones.leftUpperLeg && bones.leftUpperLeg.userData.bindLocalQuat) {
                bones.leftUpperLeg.quaternion.slerp(bones.leftUpperLeg.userData.bindLocalQuat, 0.1);
            }
            if (bones.leftLowerLeg && bones.leftLowerLeg.userData.bindLocalQuat) {
                bones.leftLowerLeg.quaternion.slerp(bones.leftLowerLeg.userData.bindLocalQuat, 0.1);
            }
            if (bones.leftFoot && bones.leftFoot.userData.bindLocalQuat) {
                bones.leftFoot.quaternion.slerp(bones.leftFoot.userData.bindLocalQuat, 0.1);
            }
        }

        // 6. RIGHT LEG & FOOT: Thigh -> Shin -> Foot
        const rLegVisible = (lms[24].visibility ?? 1.0) > 0.35 && (lms[26].visibility ?? 1.0) > 0.35;
        if (rLegVisible && bones.rightUpperLeg) {
            const rThighDir = new THREE.Vector3().subVectors(R_KNEE, R_HIP).normalize();
            if (rThighDir.y < 0.3) {
                this._retargetBone(bones.rightUpperLeg, rThighDir, 0.55);
                bones.rightUpperLeg.updateWorldMatrix(true, false);
            }
            if ((lms[28].visibility ?? 1.0) > 0.35 && bones.rightLowerLeg) {
                const rShinDir = new THREE.Vector3().subVectors(R_ANKLE, R_KNEE).normalize();
                if (rShinDir.y < 0.3) {
                    this._retargetBone(bones.rightLowerLeg, rShinDir, 0.55);
                    bones.rightLowerLeg.updateWorldMatrix(true, false);
                }
            }
            if ((lms[32].visibility ?? 1.0) > 0.3 && bones.rightFoot) {
                const rFootDir = new THREE.Vector3().subVectors(R_FOOT, R_ANKLE).normalize();
                this._retargetBone(bones.rightFoot, rFootDir, 0.55);
                bones.rightFoot.updateWorldMatrix(true, false);
            }
        } else {
            if (bones.rightUpperLeg && bones.rightUpperLeg.userData.bindLocalQuat) {
                bones.rightUpperLeg.quaternion.slerp(bones.rightUpperLeg.userData.bindLocalQuat, 0.1);
            }
            if (bones.rightLowerLeg && bones.rightLowerLeg.userData.bindLocalQuat) {
                bones.rightLowerLeg.quaternion.slerp(bones.rightLowerLeg.userData.bindLocalQuat, 0.1);
            }
            if (bones.rightFoot && bones.rightFoot.userData.bindLocalQuat) {
                bones.rightFoot.quaternion.slerp(bones.rightFoot.userData.bindLocalQuat, 0.1);
            }
        }

        // 7. HANDS & 100% INDIVIDUAL FINGER TRACKING (Thumb, Index, Middle, Ring, Pinky)
        const fingerLandmarkMap = {
            thumb: [1, 2, 3, 4],
            index: [5, 6, 7, 8],
            middle: [9, 10, 11, 12],
            ring: [13, 14, 15, 16],
            pinky: [17, 18, 19, 20]
        };

        const toHandVector3 = (lm) => {
            if (!lm) return new THREE.Vector3();
            let rx = lm.x;
            if (this.isMirrored) rx = 1.0 - rx;
            const aspect = 16.0 / 9.0; // 16:9 camera aspect ratio correction (eliminates horizontal spread distortion)
            return new THREE.Vector3(
                (rx - 0.5) * aspect * 2.0,
                -(lm.y - 0.5) * 2.0,
                -(lm.z || 0) * aspect * 2.0
            );
        };

        const retargetFullHand = (handBone, fingerBones, handLms, gestureData, side) => {
            if (!handLms || handLms.length < 21) return;

            // 1. Full 6-DOF Hand Orientation (Wrist -> Knuckles/Palm)
            const pWrist = toHandVector3(handLms[0]);
            const pIndexMCP = toHandVector3(handLms[5]);
            const pMiddleMCP = toHandVector3(handLms[9]);
            const pPinkyMCP = toHandVector3(handLms[17]);

            // Longitudinal direction of the hand (Wrist -> Middle Knuckle)
            const handForward = new THREE.Vector3().subVectors(pMiddleMCP, pWrist).normalize();

            // Lateral vector across the knuckles (Pinky -> Index)
            const handSide = new THREE.Vector3().subVectors(pIndexMCP, pPinkyMCP).normalize();

            // Palm normal: points perpendicular out from the palm
            let palmNormal = new THREE.Vector3().crossVectors(handForward, handSide).normalize();
            if (side === "right") {
                palmNormal.negate();
            }

            if (handBone) {
                this._retargetHandWithTwist(handBone, handForward, palmNormal, side, 0.85);
            }

            // 2. Individual Finger Joints (Thumb, Index, Middle, Ring, Pinky)
            if (!fingerBones) return;
            const curls = gestureData?.curls || {};
            const isFist = gestureData?.is_fist || false;
            const spreads = gestureData?.finger_spreads || {};
            const pinchDist = gestureData?.pinch_dist ?? 1.0;

            // Pinch & Finger Contact Targets
            const pThumbTip = toHandVector3(handLms[4]);
            const pIndexTip = toHandVector3(handLms[8]);
            const pMiddleTip = toHandVector3(handLms[12]);
            const pRingTip = toHandVector3(handLms[16]);
            const pPinkyTip = toHandVector3(handLms[20]);

            // Contact closure factor for pinch (0.0 when far, 1.0 when touching)
            const pinchContactBlend = Math.max(0.0, Math.min(1.0, (0.32 - pinchDist) / 0.22));
            const pinchContactPos = pThumbTip.clone().lerp(pIndexTip, 0.5);

            for (const [fName, lIndices] of Object.entries(fingerLandmarkMap)) {
                const bonesList = fingerBones[fName];
                if (!bonesList || bonesList.length === 0) continue;
                
                const fingerCurl = curls[fName] ?? (isFist ? 0.9 : 0.0);

                // Retarget up to 3 active kinematic joints per finger (Proximal, Intermediate, Distal)
                const numJoints = Math.min(bonesList.length, 3);
                for (let j = 0; j < numJoints; j++) {
                    const bone = bonesList[j];
                    if (!bone) continue;
                    
                    const idx1 = lIndices[j];
                    const idx2 = lIndices[j + 1];
                    if (idx1 !== undefined && idx2 !== undefined && handLms[idx1] && handLms[idx2]) {
                        let p1 = toHandVector3(handLms[idx1]);
                        let p2 = toHandVector3(handLms[idx2]);

                        // Zero-Gap Pinch Contact Closure: If thumb and index are touching/pinching, close the gap
                        if (pinchContactBlend > 0.01) {
                            if (fName === "thumb" && j >= 1) {
                                p2 = p2.clone().lerp(pinchContactPos, pinchContactBlend * (j === 2 ? 1.0 : 0.6));
                            } else if (fName === "index" && j >= 1) {
                                p2 = p2.clone().lerp(pinchContactPos, pinchContactBlend * (j === 2 ? 1.0 : 0.6));
                            }
                        }

                        // Zero-Gap Adjacent Finger Contact Closure (When fingers are closed together)
                        if (spreads.index_middle !== undefined && spreads.index_middle < 0.26) {
                            const closeFactor = (0.26 - spreads.index_middle) / 0.18;
                            if (fName === "index" && j === 2) p2.lerp(pMiddleTip, closeFactor * 0.4);
                            if (fName === "middle" && j === 2) p2.lerp(pIndexTip, closeFactor * 0.4);
                        }
                        if (spreads.middle_ring !== undefined && spreads.middle_ring < 0.26) {
                            const closeFactor = (0.26 - spreads.middle_ring) / 0.18;
                            if (fName === "middle" && j === 2) p2.lerp(pRingTip, closeFactor * 0.4);
                            if (fName === "ring" && j === 2) p2.lerp(pMiddleTip, closeFactor * 0.4);
                        }
                        if (spreads.ring_pinky !== undefined && spreads.ring_pinky < 0.26) {
                            const closeFactor = (0.26 - spreads.ring_pinky) / 0.18;
                            if (fName === "ring" && j === 2) p2.lerp(pPinkyTip, closeFactor * 0.4);
                            if (fName === "pinky" && j === 2) p2.lerp(pRingTip, closeFactor * 0.4);
                        }

                        const segDir = new THREE.Vector3().subVectors(p2, p1).normalize();
                        
                        if (segDir.lengthSq() > 0.001) {
                            this._retargetBone(bone, segDir, 0.9);
                            
                            // Anatomical Fist Clench Assist: If finger is curled into a fist, apply clean joint flexion
                            if (fingerCurl > 0.35 && bone.userData.bindLocalQuat) {
                                const flexAngle = (j === 0 ? 0.65 : 0.85) * (fingerCurl * 1.57); // up to ~80-90 deg
                                const flexAxis = (fName === "thumb") ? new THREE.Vector3(0, 1, 0.5).normalize() : new THREE.Vector3(0, 0, (side === "left" ? 1 : -1));
                                const flexQuat = new THREE.Quaternion().setFromAxisAngle(flexAxis, flexAngle);
                                bone.quaternion.multiply(flexQuat);
                            }
                            
                            bone.updateWorldMatrix(true, false);
                        }
                    }
                }
            }
        };

        if (bones.leftHand || (character.fingers && character.fingers.left)) {
            if (poseData.left_hand_landmarks) {
                retargetFullHand(bones.leftHand, character.fingers?.left, poseData.left_hand_landmarks, poseData.left_hand_gesture, "left");
            } else if (lms && lms.length >= 22 && (lms[15]?.visibility ?? 1.0) > 0.2) {
                const pW = L_WRIST;
                const pI = this.toVector3(lms[19]);
                const pP = this.toVector3(lms[17]);
                const handForward = new THREE.Vector3().subVectors(pI, pW).normalize();
                const handSide = new THREE.Vector3().subVectors(pI, pP).normalize();
                const palmNormal = new THREE.Vector3().crossVectors(handForward, handSide).normalize();
                if (bones.leftHand && handForward.lengthSq() > 0.001) {
                    this._retargetHandWithTwist(bones.leftHand, handForward, palmNormal, "left", 0.75);
                }
            } else {
                if (bones.leftHand && bones.leftHand.userData.bindLocalQuat) {
                    bones.leftHand.quaternion.slerp(bones.leftHand.userData.bindLocalQuat, 0.05);
                }
                if (character.fingers && character.fingers.left) {
                    for (const joints of Object.values(character.fingers.left)) {
                        joints.forEach(b => {
                            if (b && b.userData.bindLocalQuat) b.quaternion.slerp(b.userData.bindLocalQuat, 0.05);
                        });
                    }
                }
            }
        }

        if (bones.rightHand || (character.fingers && character.fingers.right)) {
            if (poseData.right_hand_landmarks) {
                retargetFullHand(bones.rightHand, character.fingers?.right, poseData.right_hand_landmarks, poseData.right_hand_gesture, "right");
            } else if (lms && lms.length >= 23 && (lms[16]?.visibility ?? 1.0) > 0.2) {
                const pW = R_WRIST;
                const pI = this.toVector3(lms[20]);
                const pP = this.toVector3(lms[18]);
                const handForward = new THREE.Vector3().subVectors(pI, pW).normalize();
                const handSide = new THREE.Vector3().subVectors(pI, pP).normalize();
                let palmNormal = new THREE.Vector3().crossVectors(handForward, handSide).normalize();
                palmNormal.negate();
                if (bones.rightHand && handForward.lengthSq() > 0.001) {
                    this._retargetHandWithTwist(bones.rightHand, handForward, palmNormal, "right", 0.75);
                }
            } else {
                if (bones.rightHand && bones.rightHand.userData.bindLocalQuat) {
                    bones.rightHand.quaternion.slerp(bones.rightHand.userData.bindLocalQuat, 0.05);
                }
                if (character.fingers && character.fingers.right) {
                    for (const joints of Object.values(character.fingers.right)) {
                        joints.forEach(b => {
                            if (b && b.userData.bindLocalQuat) b.quaternion.slerp(b.userData.bindLocalQuat, 0.05);
                        });
                    }
                }
            }
        }

        // Update Matrix World Hierarchy
        character.root.updateMatrixWorld(true);

        // Update Three.js GPU Skeletons if present
        if (character.skinnedMeshes && character.skinnedMeshes.length > 0) {
            for (let i = 0; i < character.skinnedMeshes.length; i++) {
                if (character.skinnedMeshes[i].skeleton) {
                    character.skinnedMeshes[i].skeleton.update();
                }
            }
        }
    }

    /**
     * Smoothly restores the character to its natural bind/idle pose
     */
    resetToRestPose(character, factor = 0.08) {
        if (!character) return;
        if (character.bones) {
            Object.values(character.bones).forEach(bone => {
                if (bone && bone.userData && bone.userData.bindLocalQuat) {
                    bone.quaternion.slerp(bone.userData.bindLocalQuat, factor);
                    bone.updateMatrix();
                }
            });
        }
        if (character.fingers) {
            ['left', 'right'].forEach(side => {
                if (character.fingers[side]) {
                    Object.values(character.fingers[side]).forEach(joints => {
                        joints.forEach(bone => {
                            if (bone && bone.userData && bone.userData.bindLocalQuat) {
                                bone.quaternion.slerp(bone.userData.bindLocalQuat, factor);
                                bone.updateMatrix();
                            }
                        });
                    });
                }
            });
        }
        if (character.root) {
            character.root.position.x = THREE.MathUtils.lerp(character.root.position.x, 0.0, factor);
            character.root.position.z = THREE.MathUtils.lerp(character.root.position.z, 0.0, factor);
            character.root.position.y = 0.0;
        }

        character.root.updateMatrixWorld(true);

        if (character.skinnedMeshes && character.skinnedMeshes.length > 0) {
            for (let i = 0; i < character.skinnedMeshes.length; i++) {
                if (character.skinnedMeshes[i].skeleton) {
                    character.skinnedMeshes[i].skeleton.update();
                }
            }
        }
    }
}
