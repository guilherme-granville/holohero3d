/**
 * HoloHero 3D - Main Web Application
 * Master orchestrator connecting Three.js rendering, real-time pose retargeting,
 * VFX particles, and WebSocket vision telemetry.
 */

class HoloHeroApp {
    constructor() {
        this.container = document.getElementById("canvas-container");
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();

        // Core Components
        this.stage = null;
        this.characterLoader = null;
        this.boneMapper = null;
        this.powerEffects = null;
        this.streamClient = null;
        this.ui = null;

        // Runtime Tracking State
        this.activeCharacter = null;
        this.lastPoseData = null;
        this.isTracking = false;
        this.fpsCount = 0;
        this.fpsTimer = performance.now();
        this.currentFps = 60;

        this.init();
    }

    init() {
        // 1. Initialize Three.js Scene & Camera
        this.scene = new THREE.Scene();
        
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.set(0, 1.25, 3.8);

        // 2. Initialize High-Performance WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls for staging adjustment
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 1.0, 0);
        this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // don't go below floor

        // 3. Initialize Stage & VFX Systems
        this.stage = new StageEnvironment(this.scene);
        this.characterLoader = new CharacterLoader(this.scene);
        this.boneMapper = new BoneMapper();
        this.powerEffects = new PowerEffectsManager(this.scene);

        // 4. Create Default 3D Superhero Avatar
        this.activeCharacter = this.characterLoader.createProceduralHero("cyber_iron");

        // 5. Initialize Operator UI
        this.ui = new OperatorUI(this);

        // 6. Initialize WebSocket Stream Client (Direct IPv4)
        this.streamClient = new StreamClient("ws://127.0.0.1:8765");
        
        this.streamClient.onStatusChange = (state, label) => {
            this.ui.updateConnectionStatus(state, label);
        };

        this.lastPoseTime = 0;

        this.streamClient.onPoseUpdate = (data) => {
            this.lastPoseData = data;
            this.lastPoseTime = performance.now();
            this.isTracking = true;
            const character = this.getActiveCharacter();
            if (character) {
                this.boneMapper.retarget(character, data);
            }
        };

        this.streamClient.onPoseLost = () => {
            this.isTracking = false;
            this.lastPoseData = null;
        };

        this.streamClient.onPowerTrigger = (effectId) => {
            this.triggerPower(effectId);
        };

        this.streamClient.connect();

        // 7. Handle Window Resize
        window.addEventListener("resize", () => this.onWindowResize());

        // 8. Start 60 FPS Render Loop
        this.animate();
    }

    getActiveCharacter() {
        return this.characterLoader.activeCharacter || this.activeCharacter;
    }

    triggerPower(effectId = null) {
        let leftHandWorld = null;
        let rightHandWorld = null;

        const character = this.getActiveCharacter();
        if (character) {
            if (character.leftHandAnchor) {
                leftHandWorld = new THREE.Vector3();
                character.leftHandAnchor.getWorldPosition(leftHandWorld);
            }
            if (character.rightHandAnchor) {
                rightHandWorld = new THREE.Vector3();
                character.rightHandAnchor.getWorldPosition(rightHandWorld);
            }
        }

        this.powerEffects.trigger(effectId, leftHandWorld, rightHandWorld);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();
        const now = performance.now();

        const character = this.getActiveCharacter();

        // Check tracking timeout (> 400ms without new pose packet)
        if (this.isTracking && this.lastPoseTime && (now - this.lastPoseTime > 400)) {
            this.isTracking = false;
        }

        // Apply retargeting if tracking is active
        if (this.isTracking && this.lastPoseData && character) {
            this.boneMapper.retarget(character, this.lastPoseData);
        } else if (character) {
            // Smoothly return to natural bind/idle pose
            if (this.boneMapper) {
                this.boneMapper.resetToRestPose(character, 0.05);
            }
            if (!character.isSkinnedMesh && character.bones && character.bones.hips) {
                const idleOffset = Math.sin(elapsedTime * 2.0) * 0.02;
                character.bones.hips.position.y = (character.baseHeight || 0.95) + idleOffset;
            }
        }

        // Update Round Stage & Lighting
        if (this.stage && this.stage.update) {
            this.stage.update(deltaTime, elapsedTime);
        }

        // Update Particle Systems
        this.powerEffects.update(deltaTime);

        // Update Controls & Render Scene
        this.controls.update();
        this.renderer.render(this.scene, this.camera);

        // Telemetry calculation
        this.fpsCount++;
        if (now - this.fpsTimer >= 1000) {
            this.currentFps = (this.fpsCount * 1000) / (now - this.fpsTimer);
            this.fpsCount = 0;
            this.fpsTimer = now;

            this.ui.updateTelemetry(this.currentFps, this.streamClient.latencyMs, this.isTracking);
        }
    }
}

// Instantiate on DOM Loaded
window.addEventListener("DOMContentLoaded", () => {
    window.app = new HoloHeroApp();
});
