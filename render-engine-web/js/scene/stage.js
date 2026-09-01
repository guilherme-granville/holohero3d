/**
 * 3D Virtual Studio Stage Environment for HoloHero 3D
 * - 100% Round Multi-Tier Sci-Fi Pedestal & Concentric Glowing Rings
 * - Atmospheric Gradient Studio Background & Subtle Floating Dust Motes
 * - Cinematic 3-Point PBR Studio Lighting & Contact Shadows
 */

class StageEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.currentEnvironment = "cyber_arena";

        this.lights = [];
        this.stageGroup = new THREE.Group();
        this.stageGroup.name = "Round_Stage_Environment";
        this.scene.add(this.stageGroup);

        this.animatedRings = [];
        this.ambientParticles = null;
        this.lightIntensityMultiplier = 2.5;

        this.init();
    }

    init() {
        this._setupBackground();
        this._setupLighting();
        this._setupRoundStage();
        this._setupAmbientMotes();
    }

    _setupBackground() {
        // Deep obsidian atmospheric studio background with depth fog
        this.scene.background = new THREE.Color(0x060810);
        this.scene.fog = new THREE.FogExp2(0x060810, 0.038);
    }

    _setupLighting() {
        // Clear previous lights
        this.lights.forEach(l => this.scene.remove(l));
        this.lights = [];

        const mult = this.lightIntensityMultiplier;

        // 1. Ambient Fill Light
        const ambientLight = new THREE.AmbientLight(0x182035, 0.9 * mult);
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        // 2. Key Front Light (Soft Daylight White)
        const keyLight = new THREE.DirectionalLight(0xf0f6ff, 1.4 * mult);
        keyLight.position.set(2.5, 4.5, 4.0);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.bias = -0.0001;
        keyLight.shadow.radius = 2.5;
        this.scene.add(keyLight);
        this.lights.push(keyLight);

        // 3. Primary Rim Backlight (Neon Edge Glow)
        const rimColor = this._getThemeColors().rim;
        const rimLight = new THREE.DirectionalLight(rimColor, 2.6 * mult);
        rimLight.position.set(-3.2, 3.5, -3.5);
        this.scene.add(rimLight);
        this.lights.push(rimLight);

        // 4. Secondary Side Fill (Contrast Fill)
        const fillColor = this._getThemeColors().fill;
        const fillLight = new THREE.PointLight(fillColor, 1.8 * mult, 15);
        fillLight.position.set(3.5, 2.0, -1.5);
        this.scene.add(fillLight);
        this.lights.push(fillLight);

        // 5. Pedestal Ground Uplight (Subtle glow from bottom of round platform)
        const upColor = this._getThemeColors().primary;
        const upLight = new THREE.PointLight(upColor, 1.2 * mult, 6);
        upLight.position.set(0, 0.2, 0);
        this.scene.add(upLight);
        this.lights.push(upLight);
    }

    _getThemeColors() {
        switch (this.currentEnvironment) {
            case "cosmic_void":
                return { primary: 0xa855f7, secondary: 0xec4899, rim: 0xc084fc, fill: 0x7e22ce, ring: 0x9333ea };
            case "studio_gold":
                return { primary: 0xf59e0b, secondary: 0xfbbf24, rim: 0xfde047, fill: 0xb45309, ring: 0xd97706 };
            case "clean_dark":
                return { primary: 0x38bdf8, secondary: 0x94a3b8, rim: 0xf8fafc, fill: 0x475569, ring: 0x64748b };
            case "cyber_arena":
            default:
                return { primary: 0x00f0ff, secondary: 0x0070f3, rim: 0x38bdf8, fill: 0x6366f1, ring: 0x06b6d4 };
        }
    }

    _setupRoundStage() {
        // Clear previous stage meshes
        while (this.stageGroup.children.length > 0) {
            this.stageGroup.remove(this.stageGroup.children[0]);
        }
        this.animatedRings = [];

        const colors = this._getThemeColors();

        // 1. Vast Reflective Dark Base Floor (Circular Plane)
        const outerFloorGeo = new THREE.CircleGeometry(25, 64);
        const outerFloorMat = new THREE.MeshStandardMaterial({
            color: 0x05070e,
            metalness: 0.9,
            roughness: 0.35
        });
        const outerFloor = new THREE.Mesh(outerFloorGeo, outerFloorMat);
        outerFloor.rotation.x = -Math.PI / 2;
        outerFloor.position.y = -0.06;
        outerFloor.receiveShadow = true;
        this.stageGroup.add(outerFloor);

        // 2. Main Circular Beveled Pedestal (Tier 1 - Ground Base)
        const baseRadius = 2.4;
        const baseGeo = new THREE.CylinderGeometry(baseRadius, baseRadius + 0.25, 0.08, 64);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x0a0f1d,
            metalness: 0.85,
            roughness: 0.25
        });
        const basePodium = new THREE.Mesh(baseGeo, baseMat);
        basePodium.position.y = -0.02;
        basePodium.receiveShadow = true;
        this.stageGroup.add(basePodium);

        // 3. Elevated Circular Platform (Tier 2 - Center Stage where character stands)
        const topRadius = 1.95;
        const topGeo = new THREE.CylinderGeometry(topRadius, topRadius + 0.15, 0.04, 64);
        const topMat = new THREE.MeshStandardMaterial({
            color: 0x0d1424,
            metalness: 0.92,
            roughness: 0.18
        });
        const topPodium = new THREE.Mesh(topGeo, topMat);
        topPodium.position.y = 0.01;
        topPodium.receiveShadow = true;
        this.stageGroup.add(topPodium);

        // 4. Concentric Glowing Neon Rings (100% Round & Sci-Fi)
        // Outer Glowing Edge Ring
        const outerRingGeo = new THREE.RingGeometry(baseRadius - 0.04, baseRadius + 0.02, 64);
        const outerRingMat = new THREE.MeshBasicMaterial({
            color: colors.primary,
            side: THREE.DoubleSide
        });
        const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRing.rotation.x = -Math.PI / 2;
        outerRing.position.y = 0.021;
        this.stageGroup.add(outerRing);

        // Mid Platform Glowing Ring
        const midRingGeo = new THREE.RingGeometry(topRadius - 0.03, topRadius + 0.03, 64);
        const midRingMat = new THREE.MeshBasicMaterial({
            color: colors.secondary,
            side: THREE.DoubleSide
        });
        const midRing = new THREE.Mesh(midRingGeo, midRingMat);
        midRing.rotation.x = -Math.PI / 2;
        midRing.position.y = 0.031;
        this.stageGroup.add(midRing);

        // Inner Holographic Stand Disc
        const innerRingGeo = new THREE.RingGeometry(1.05, 1.12, 64);
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: colors.primary,
            side: THREE.DoubleSide
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.032;
        this.stageGroup.add(innerRing);

        // Center Character Target Ring
        const centerDiscGeo = new THREE.CircleGeometry(0.5, 48);
        const centerDiscMat = new THREE.MeshBasicMaterial({
            color: colors.ring,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        const centerDisc = new THREE.Mesh(centerDiscGeo, centerDiscMat);
        centerDisc.rotation.x = -Math.PI / 2;
        centerDisc.position.y = 0.033;
        this.stageGroup.add(centerDisc);

        // Animated Outer Orbit Ring with Segments
        const orbitRingGeo = new THREE.RingGeometry(3.0, 3.06, 64);
        const orbitRingMat = new THREE.MeshBasicMaterial({
            color: colors.ring,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide
        });
        const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
        orbitRing.rotation.x = -Math.PI / 2;
        orbitRing.position.y = -0.05;
        this.stageGroup.add(orbitRing);

        this.animatedRings.push({ mesh: orbitRing, speed: 0.15 });
        this.animatedRings.push({ mesh: innerRing, speed: -0.08 });
    }

    _setupAmbientMotes() {
        if (this.ambientParticles) {
            this.scene.remove(this.ambientParticles);
        }

        // 300 gentle floating micro-dust motes creating atmospheric depth
        const count = 300;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const scales = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * 16;
            positions[i * 3 + 1] = Math.random() * 6;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 16;
            scales[i] = Math.random() * 0.04 + 0.02;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Create soft circular bokeh particle texture
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.4, 'rgba(100, 200, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);

        const mat = new THREE.PointsMaterial({
            size: 0.08,
            map: texture,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.ambientParticles = new THREE.Points(geo, mat);
        this.scene.add(this.ambientParticles);
    }

    update(deltaTime = 0.016, elapsedTime = 0) {
        // Slowly rotate concentric orbital rings
        if (this.animatedRings) {
            this.animatedRings.forEach(r => {
                r.mesh.rotation.z += r.speed * deltaTime;
            });
        }

        // Float ambient motes gently upwards
        if (this.ambientParticles && this.ambientParticles.geometry.attributes.position) {
            const pos = this.ambientParticles.geometry.attributes.position.array;
            for (let i = 1; i < pos.length; i += 3) {
                pos[i] += deltaTime * 0.08;
                if (pos[i] > 6.0) {
                    pos[i] = 0.0;
                }
            }
            this.ambientParticles.geometry.attributes.position.needsUpdate = true;
        }
    }

    setPreset(presetName) {
        this.currentEnvironment = presetName;

        if (presetName === "cosmic_void") {
            this.scene.background.setHex(0x0c0618);
            this.scene.fog.color.setHex(0x0c0618);
        } else if (presetName === "studio_gold" || presetName === "hyper_grid") {
            this.scene.background.setHex(0x0f0b04);
            this.scene.fog.color.setHex(0x0f0b04);
        } else if (presetName === "clean_dark") {
            this.scene.background.setHex(0x05070a);
            this.scene.fog.color.setHex(0x05070a);
        } else {
            // cyber_arena
            this.scene.background.setHex(0x060810);
            this.scene.fog.color.setHex(0x060810);
        }

        this._setupLighting();
        this._setupRoundStage();
    }

    setLightIntensity(val) {
        this.lightIntensityMultiplier = parseFloat(val);
        this._setupLighting();
    }
}
