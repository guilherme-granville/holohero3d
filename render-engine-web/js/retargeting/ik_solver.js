/**
 * Analytical Two-Bone IK Solver and Vector Math Utilities
 * Computes exact joint angles and quaternions for limbs (Shoulder->Elbow->Wrist, Hip->Knee->Ankle)
 */

class IKSolver {
    /**
     * Solves Two-Bone IK analytically given 3 joints and target/pole vector.
     * @param {THREE.Vector3} rootPos - Position of root joint (e.g. Shoulder)
     * @param {THREE.Vector3} midPos - Position of middle joint (e.g. Elbow)
     * @param {THREE.Vector3} endPos - Position of end joint (e.g. Wrist)
     * @param {THREE.Vector3} targetPos - Target position for end joint
     * @param {THREE.Vector3} polePos - Pole vector position for bending plane
     * @returns {Object} { rootRotation, midRotation, solvedMidPos }
     */
    static solveTwoBone(rootPos, midPos, endPos, targetPos, polePos) {
        const l1 = rootPos.distanceTo(midPos); // Upper arm/leg length
        const l2 = midPos.distanceTo(endPos);  // Forearm/calf length
        
        const toTarget = new THREE.Vector3().subVectors(targetPos, rootPos);
        let dist = toTarget.length();
        
        // Clamp distance to avoid triangle inequality breakdown
        const maxDist = (l1 + l2) * 0.9999;
        const minDist = Math.abs(l1 - l2) * 1.0001;
        dist = Math.max(minDist, Math.min(dist, maxDist));

        // Law of Cosines
        const cosAngle0 = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
        const angle0 = Math.acos(Math.max(-1, Math.min(1, cosAngle0)));

        const cosAngle1 = (l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2);
        const angle1 = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosAngle1)));

        // Base axis along target direction
        const targetDir = toTarget.clone().normalize();

        // Calculate bend normal using pole vector
        const toPole = new THREE.Vector3().subVectors(polePos, rootPos);
        const bendNormal = new THREE.Vector3().crossVectors(targetDir, toPole).normalize();
        if (bendNormal.lengthSq() < 0.001) {
            bendNormal.set(0, 0, 1); // fallback normal
        }

        // Mid joint offset vector in the plane
        const planeDir = new THREE.Vector3().crossVectors(bendNormal, targetDir).normalize();
        const midOffset = new THREE.Vector3()
            .addScaledVector(targetDir, Math.cos(angle0) * l1)
            .addScaledVector(planeDir, Math.sin(angle0) * l1);

        const solvedMidPos = rootPos.clone().add(midOffset);

        // Compute bone orientations
        const rootDir = new THREE.Vector3().subVectors(solvedMidPos, rootPos).normalize();
        const midDir = new THREE.Vector3().subVectors(targetPos, solvedMidPos).normalize();

        return {
            solvedMidPos: solvedMidPos,
            angleMid: angle1,
            rootDir: rootDir,
            midDir: midDir
        };
    }

    /**
     * Constructs rotation quaternion from default bone direction to target direction.
     */
    static getRotationBetweenVectors(defaultDir, targetDir) {
        return new THREE.Quaternion().setFromUnitVectors(defaultDir.clone().normalize(), targetDir.clone().normalize());
    }
}
