/**
 * HoloHero 3D - Presentation Stage App (Telão / Apresentação Limpa)
 * Renders 100% clean, distraction-free 3D superhero live stage with real-time pose tracking
 * and instant synchronization with the Operator Configuration Dashboard.
 */

class PresentationApp {
    constructor() {
        this.container = document.getElementById("canvas-container");
        this.loaderOverlay = document.getElementById("loader-overlay");
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();

        // Core 3D Subsystems
        this.stage = null;
        this.characterLoader = null;
        this.boneMapper = null;
        this.powerEffects = null;
        this.streamClient = null;
        this.syncBridge = null;

        // Runtime Tracking State
        this.activeCharacter = null;
        this.lastPoseData = null;
        this.lastPoseTime = 0;
        this.isTracking = false;

        this.init();
    }

    init() {
        // 1. Initialize Scene & Camera
        this.scene = new THREE.Scene();
        
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.set(0, 1.25, 3.8);

        // 2. High-Performance WebGL Renderer
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

        // Camera Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 1.0, 0);
        this.controls.maxPolarAngle = Math.PI / 2 + 0.05;

        // 3. 3D Systems
        this.stage = new StageEnvironment(this.scene);
        this.characterLoader = new CharacterLoader(this.scene);
        this.boneMapper = new BoneMapper();
        this.powerEffects = new PowerEffectsManager(this.scene);

        // 4. Vision Engine Stream Client
        this.streamClient = new StreamClient("ws://127.0.0.1:8765");
        
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

        // 5. Multi-Screen Sync Bridge
        this.syncBridge = new SyncBridge(this.streamClient);
        this.setupSyncListeners();

        // 6. Restore saved state / Load initial character
        this.loadInitialState();

        // 7. Event Handlers (Fullscreen, Resize)
        window.addEventListener("resize", () => this.onWindowResize());
        
        // Double-click or 'F' to toggle Fullscreen
        window.addEventListener("dblclick", () => this.toggleFullscreen());
        window.addEventListener("keydown", (e) => {
            if (e.key.toLowerCase() === "f") {
                this.toggleFullscreen();
            } else if (e.key === " " || e.code === "Space") {
                this.triggerPower();
            }
        });

        // 8. Start Render Loop
        this.animate();
    }

    setupSyncListeners() {
        // Model change from operator dashboard
        this.syncBridge.on("onModelChange", (model) => {
            this.loadModel(model);
        });

        // Settings updates
        this.syncBridge.on("onSettingsChange", (settings) => {
            this.applySettings(settings);
        });

        // VFX trigger
        this.syncBridge.on("onPowerTrigger", (effectId) => {
            this.triggerPower(effectId);
        });

        // Rotation
        this.syncBridge.on("onRotateModel", (axis) => {
            if (axis === "x") this.rotateActiveModelX();
            else if (axis === "y") this.rotateActiveModelY();
            else if (axis === "180" || axis === "y180") this.rotateActiveModel180();
        });

        // Reset camera
        this.syncBridge.on("onCameraReset", () => {
            this.camera.position.set(0, 1.25, 3.8);
            this.controls.target.set(0, 1.0, 0);
            this.controls.update();
        });
    }

    loadInitialState() {
        const saved = this.syncBridge.getSavedState();

        if (saved.lastSettings) {
            this.applySettings(saved.lastSettings);
        }

        if (saved.lastModel) {
            this.loadModel(saved.lastModel);
        } else {
            // Default: Anatômico / Curious Skeleton
            const defaultModel = {
                id: "Curious skeleton.glb",
                name: "Esqueleto Anatômico Humano",
                url: "/models/Curious%20skeleton.glb"
            };
            this.loadModel(defaultModel);
        }
    }

    loadModel(model) {
        if (!model) return;
        this.showLoader(true);

        if (model.type === "procedural") {
            const char = this.characterLoader.createProceduralHero(model.id);
            this.activeCharacter = char;
            this.showLoader(false);
        } else {
            const modelUrl = model.url || (model.id ? `/models/${encodeURIComponent(model.id)}` : "");
            this.characterLoader.loadCustomGLB(modelUrl, (char) => {
                this.activeCharacter = char;
                this.showLoader(false);
            }, (err) => {
                console.warn("[PresentationApp] Failed loading model, fallback to procedural:", err);
                this.activeCharacter = this.characterLoader.createProceduralHero("cyber_iron");
                this.showLoader(false);
            });
        }
    }

    applySettings(settings) {
        if (!settings) return;

        if (settings.depthSensitivity !== undefined && this.boneMapper) {
            this.boneMapper.depthSensitivity = settings.depthSensitivity;
        }
        if (settings.lateralSensitivity !== undefined && this.boneMapper) {
            this.boneMapper.lateralSensitivity = settings.lateralSensitivity;
        }
        if (settings.isMirrored !== undefined && this.boneMapper) {
            this.boneMapper.isMirrored = settings.isMirrored;
        }
        if (settings.avatarScale !== undefined) {
            const char = this.getActiveCharacter();
            if (char && char.model) {
                char.model.scale.setScalar(settings.avatarScale);
            }
        }
        if (settings.effect && this.powerEffects) {
            this.powerEffects.currentEffect = settings.effect;
        }
        if (settings.particleCount !== undefined && this.powerEffects) {
            this.powerEffects.maxParticles = settings.particleCount;
        }
        if (settings.stage && this.stage) {
            this.stage.setPreset(settings.stage);
        }
        if (settings.lightIntensity !== undefined && this.stage) {
            this.stage.setLightIntensity(settings.lightIntensity);
        }
    }

    rotateActiveModelX() {
        const char = this.getActiveCharacter();
        if (char && char.model) {
            char.model.rotation.x += Math.PI / 2;
            char.root.updateMatrixWorld(true);
            if (this.characterLoader && this.characterLoader.cacheBindPose) {
                this.characterLoader.cacheBindPose(char);
            }
        }
    }

    rotateActiveModelY() {
        const char = this.getActiveCharacter();
        if (char && char.model) {
            char.model.rotation.y += Math.PI / 2;
            char.root.updateMatrixWorld(true);
            if (this.characterLoader && this.characterLoader.cacheBindPose) {
                this.characterLoader.cacheBindPose(char);
            }
        }
    }

    rotateActiveModel180() {
        const char = this.getActiveCharacter();
        if (char && char.model) {
            char.model.rotation.y += Math.PI;
            char.root.updateMatrixWorld(true);
            if (this.characterLoader && this.characterLoader.cacheBindPose) {
                this.characterLoader.cacheBindPose(char);
            }
        }
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

    showLoader(show) {
        if (!this.loaderOverlay) return;
        if (show) {
            this.loaderOverlay.classList.remove("hidden");
        } else {
            this.loaderOverlay.classList.add("hidden");
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`Fullscreen error: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
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

        // Pose tracking timeout check (> 400ms without packet)
        if (this.isTracking && this.lastPoseTime && (now - this.lastPoseTime > 400)) {
            this.isTracking = false;
        }

        if (this.isTracking && this.lastPoseData && character) {
            this.boneMapper.retarget(character, this.lastPoseData);
        } else if (character) {
            if (this.boneMapper) {
                this.boneMapper.resetToRestPose(character, 0.05);
            }
            if (!character.isSkinnedMesh && character.bones && character.bones.hips) {
                const idleOffset = Math.sin(elapsedTime * 2.0) * 0.02;
                character.bones.hips.position.y = (character.baseHeight || 0.95) + idleOffset;
            }
        }

        if (this.stage && this.stage.update) {
            this.stage.update(deltaTime, elapsedTime);
        }
        this.powerEffects.update(deltaTime);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.app = new PresentationApp();
});
