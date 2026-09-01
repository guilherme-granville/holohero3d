/**
 * HoloHero 3D - Operator Configuration Dashboard
 * Master control panel for model selection, pose tracking calibration,
 * superpower VFX triggers, stage lighting, and real-time dual-screen sync.
 */

class ConfigDashboardApp {
    constructor() {
        this.streamClient = null;
        this.syncBridge = null;

        // UI DOM References
        this.statusBadge = document.getElementById("tracking-status");
        this.statusLabel = document.getElementById("status-label");
        this.activeCharName = document.getElementById("active-char-name");
        this.hudFps = document.getElementById("hud-fps");
        this.hudLatency = document.getElementById("hud-latency");
        this.hudTracking = document.getElementById("hud-tracking");
        this.toastContainer = document.getElementById("toast-container");

        // Model Management Elements
        this.modelsGrid = document.getElementById("models-grid");
        this.searchInput = document.getElementById("model-search-input");
        this.fileInput = document.getElementById("file-character");
        this.btnBrowse = document.getElementById("btn-browse-file");
        this.dropZone = document.getElementById("modal-drop-zone");

        // Action Buttons
        this.btnLaunchPresentation = document.getElementById("btn-launch-presentation");
        this.btnQuickPower = document.getElementById("btn-quick-power");
        this.btnTestPower = document.getElementById("btn-test-power");
        this.btnResetCamera = document.getElementById("btn-reset-camera");
        this.btnRotateX = document.getElementById("btn-rotate-x");
        this.btnRotateY = document.getElementById("btn-rotate-y");
        this.btnRotate180 = document.getElementById("btn-rotate-180");
        this.btnResetDefaults = document.getElementById("btn-reset-defaults");

        // Calibration Inputs
        this.depthInput = document.getElementById("depth-sensitivity");
        this.depthVal = document.getElementById("val-depth");
        this.lateralInput = document.getElementById("lateral-sensitivity");
        this.lateralVal = document.getElementById("val-lateral");
        this.scaleInput = document.getElementById("avatar-scale");
        this.scaleVal = document.getElementById("val-scale");
        this.chkMirror = document.getElementById("chk-mirror");

        // VFX & Stage
        this.effectSelect = document.getElementById("effect-select");
        this.particleCountSlider = document.getElementById("particle-count");
        this.particleVal = document.getElementById("val-particles");
        this.stageSelect = document.getElementById("stage-select");
        this.lightIntensitySlider = document.getElementById("light-intensity");
        this.lightVal = document.getElementById("val-lights");

        // Server Connection
        this.wsUrlInput = document.getElementById("ws-url");
        this.btnReconnect = document.getElementById("btn-reconnect");
        this.wsStatusText = document.getElementById("ws-status-text");

        // State
        this.modelsList = [];
        this.proceduralList = [];
        this.activeModel = null;
        this.currentFilter = "all";
        this.currentSearch = "";

        this.settingsState = {
            depthSensitivity: 1.2,
            lateralSensitivity: 1.0,
            avatarScale: 1.0,
            isMirrored: false,
            effect: "cosmic_burst",
            particleCount: 3000,
            stage: "cyber_arena",
            lightIntensity: 2.5
        };

        this.init();
    }

    init() {
        // 1. Initialize Stream Client & Sync Bridge
        this.streamClient = new StreamClient("ws://127.0.0.1:8765");
        this.syncBridge = new SyncBridge(this.streamClient);

        this.setupStreamEvents();
        this.setupEventListeners();
        this.loadSavedSettings();
        this.fetchModelsList();

        this.streamClient.connect();
    }

    setupStreamEvents() {
        this.streamClient.onStatusChange = (state, label) => {
            this.updateConnectionStatus(state, label);
        };

        this.streamClient.onPoseUpdate = (data) => {
            if (this.hudLatency) {
                this.hudLatency.textContent = data.latency_ms ? `${data.latency_ms} ms` : "12 ms";
            }
            if (this.hudTracking) {
                this.hudTracking.textContent = "🟢 RASTREAMENTO ATIVO";
                this.hudTracking.style.color = "var(--accent-green)";
            }
        };

        this.streamClient.onPoseLost = () => {
            if (this.hudTracking) {
                this.hudTracking.textContent = "🟡 PROCURANDO USUÁRIO";
                this.hudTracking.style.color = "var(--primary-gold)";
            }
        };
    }

    setupEventListeners() {
        // Launch Presentation Window
        if (this.btnLaunchPresentation) {
            this.btnLaunchPresentation.addEventListener("click", () => {
                window.open("presentation.html", "HoloHeroPresentationStage", "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
                this.showToast("🖥️ Tela de apresentação aberta em nova janela!");
            });
        }

        // Superpower Triggers
        if (this.btnQuickPower) {
            this.btnQuickPower.addEventListener("click", () => this.triggerPower());
        }
        if (this.btnTestPower) {
            this.btnTestPower.addEventListener("click", () => this.triggerPower());
        }

        // Camera Reset & Rotation
        if (this.btnResetCamera) {
            this.btnResetCamera.addEventListener("click", () => {
                this.syncBridge.broadcastCameraReset();
                this.showToast("🎥 Câmera da Apresentação resetada");
            });
        }
        if (this.btnRotateX) {
            this.btnRotateX.addEventListener("click", () => {
                this.syncBridge.broadcastRotation("x");
                this.showToast("🔄 Rotação X +90° enviada para o telão");
            });
        }
        if (this.btnRotateY) {
            this.btnRotateY.addEventListener("click", () => {
                this.syncBridge.broadcastRotation("y");
                this.showToast("🔄 Rotação Y +90° enviada para o telão");
            });
        }
        if (this.btnRotate180) {
            this.btnRotate180.addEventListener("click", () => {
                this.syncBridge.broadcastRotation("180");
                this.showToast("🔄 Inversão 180° enviada para o telão");
            });
        }

        // Reset Defaults
        if (this.btnResetDefaults) {
            this.btnResetDefaults.addEventListener("click", () => {
                this.resetToDefaults();
            });
        }

        // Model Search & Filter Tabs
        if (this.searchInput) {
            this.searchInput.addEventListener("input", (e) => {
                this.currentSearch = e.target.value.toLowerCase().trim();
                this.renderModelsGrid();
            });
        }

        const filterTabs = document.querySelectorAll(".filter-tab");
        filterTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                filterTabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                this.currentFilter = tab.getAttribute("data-filter") || "all";
                this.renderModelsGrid();
            });
        });

        // File Browse & Upload
        if (this.btnBrowse && this.fileInput) {
            this.btnBrowse.addEventListener("click", () => this.fileInput.click());
        }
        if (this.fileInput) {
            this.fileInput.addEventListener("change", (e) => {
                if (e.target.files.length > 0) {
                    this.handleCustomFile(e.target.files[0]);
                }
            });
        }

        // Drag & Drop
        if (this.dropZone) {
            this.dropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                this.dropZone.classList.add("drag-hover");
            });
            this.dropZone.addEventListener("dragleave", () => {
                this.dropZone.classList.remove("drag-hover");
            });
            this.dropZone.addEventListener("drop", (e) => {
                e.preventDefault();
                this.dropZone.classList.remove("drag-hover");
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    if (file.name.toLowerCase().endsWith(".glb") || file.name.toLowerCase().endsWith(".gltf")) {
                        this.handleCustomFile(file);
                    } else {
                        this.showToast("⚠️ Por favor insira um arquivo 3D .GLB ou .GLTF");
                    }
                }
            });
        }

        // Calibration Sliders
        if (this.depthInput) {
            this.depthInput.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (this.depthVal) this.depthVal.textContent = `${val.toFixed(1)}x`;
                this.settingsState.depthSensitivity = val;
                this.syncBridge.broadcastSettings(this.settingsState);
            });
        }

        if (this.lateralInput) {
            this.lateralInput.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (this.lateralVal) this.lateralVal.textContent = `${val.toFixed(1)}x`;
                this.settingsState.lateralSensitivity = val;
                this.syncBridge.broadcastSettings(this.settingsState);
            });
        }

        if (this.scaleInput) {
            this.scaleInput.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (this.scaleVal) this.scaleVal.textContent = `${val.toFixed(2)}x`;
                this.settingsState.avatarScale = val;
                this.syncBridge.broadcastSettings(this.settingsState);
            });
        }

        if (this.chkMirror) {
            this.chkMirror.addEventListener("change", (e) => {
                this.settingsState.isMirrored = e.target.checked;
                this.syncBridge.broadcastSettings(this.settingsState);
                this.showToast(e.target.checked ? "🪞 Modo Espelho ativado" : "Modo Normal ativado");
            });
        }

        // VFX & Stage
        if (this.effectSelect) {
            this.effectSelect.addEventListener("change", (e) => {
                this.settingsState.effect = e.target.value;
                this.syncBridge.broadcastSettings(this.settingsState);
                this.showToast(`💥 Efeito ativo: ${e.target.value.replace("_", " ").toUpperCase()}`);
            });
        }

        if (this.particleCountSlider) {
            this.particleCountSlider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value, 10);
                if (this.particleVal) this.particleVal.textContent = val.toLocaleString();
                this.settingsState.particleCount = val;
                this.syncBridge.broadcastSettings(this.settingsState);
            });
        }

        if (this.stageSelect) {
            this.stageSelect.addEventListener("change", (e) => {
                this.settingsState.stage = e.target.value;
                this.syncBridge.broadcastSettings(this.settingsState);
                this.showToast(`🌌 Cenário: ${e.target.value.toUpperCase()}`);
            });
        }

        if (this.lightIntensitySlider) {
            this.lightIntensitySlider.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (this.lightVal) this.lightVal.textContent = `${val.toFixed(1)}x`;
                this.settingsState.lightIntensity = val;
                this.syncBridge.broadcastSettings(this.settingsState);
            });
        }

        // WebSocket Reconnect
        if (this.btnReconnect) {
            this.btnReconnect.addEventListener("click", () => {
                const url = this.wsUrlInput.value.trim();
                this.streamClient.connect(url);
                this.showToast("🔄 Reconectando ao Vision Server...");
            });
        }

        // Global hotkeys (Space to trigger power)
        window.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
                return;
            }
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                this.triggerPower();
            }
        });
    }

    async fetchModelsList() {
        try {
            const res = await fetch("/api/models");
            if (res.ok) {
                this.modelsList = await res.json();
            } else {
                throw new Error("HTTP " + res.status);
            }
        } catch (err) {
            console.warn("[ConfigDashboard] API unavailable, using fallback list:", err);
            this.modelsList = [
                { id: "black_suited_spider_man.glb", name: "Black Suited Spider-Man", filename: "black_suited_spider_man.glb", url: "/models/black_suited_spider_man.glb", size: "11.1 MB", tag: "Super-Herói / Rigged" },
                { id: "dead_pool.glb", name: "Deadpool", filename: "dead_pool.glb", url: "/models/dead_pool.glb", size: "5.9 MB", tag: "Super-Herói / Rigged" },
                { id: "spiderman_brand_new_day.glb", name: "Spider-Man Brand New Day", filename: "spiderman_brand_new_day.glb", url: "/models/spiderman_brand_new_day.glb", size: "18.6 MB", tag: "Super-Herói / Rigged" },
                { id: "spider_punk.glb", name: "Spider Punk", filename: "spider_punk.glb", url: "/models/spider_punk.glb", size: "20.5 MB", tag: "Super-Herói / Rigged" },
                { id: "green_goblin.glb", name: "Green Goblin", filename: "green_goblin.glb", url: "/models/green_goblin.glb", size: "0.3 MB", tag: "Super-Herói / Rigged" }
            ];
        }

        const saved = this.syncBridge.getSavedState();
        if (saved.lastModel) {
            this.activeModel = saved.lastModel;
        } else {
            this.activeModel = this.modelsList.find(m => m.id === "Curious skeleton.glb") || this.modelsList[0] || this.proceduralList[0];
        }

        if (this.activeCharName && this.activeModel) {
            this.activeCharName.textContent = this.activeModel.name;
        }

        this.renderModelsGrid();
    }

    renderModelsGrid() {
        if (!this.modelsGrid) return;
        this.modelsGrid.innerHTML = "";

        let items = [];
        if (this.currentFilter === "all" || this.currentFilter === "rigged" || this.currentFilter === "heroes") {
            items = items.concat(this.modelsList);
        }
        if (this.currentFilter === "all" || this.currentFilter === "procedural" || this.currentFilter === "heroes") {
            items = items.concat(this.proceduralList);
        }

        if (this.currentFilter === "rigged") {
            items = items.filter(m => m.tag && m.tag.includes("Rigged"));
        }

        // Apply Search Filter
        if (this.currentSearch) {
            items = items.filter(m => m.name.toLowerCase().includes(this.currentSearch) || (m.tag && m.tag.toLowerCase().includes(this.currentSearch)));
        }

        if (items.length === 0) {
            this.modelsGrid.innerHTML = `
                <div class="no-models-msg">
                    <span class="no-models-icon">🔍</span>
                    <p>Nenhum modelo 3D encontrado para a busca "${this.currentSearch}".</p>
                </div>
            `;
            return;
        }

        items.forEach(model => {
            const isActive = this.activeModel && (this.activeModel.id === model.id);
            const card = document.createElement("div");
            card.className = "model-card" + (isActive ? " active-model" : "");

            let emoji = "🦸";
            if (model.id.includes("skeleton") || model.id.includes("esqueleto")) emoji = "🦴";
            else if (model.id.includes("spider") || model.id.includes("miranha")) emoji = "🕷️";
            else if (model.id.includes("d.va") || model.id.includes("ivy")) emoji = "⚡";
            else if (model.id.includes("gorilla")) emoji = "🦍";
            else if (model.id.includes("remy")) emoji = "🥋";

            card.innerHTML = `
                <div class="model-badge-top">${isActive ? "✓ EXIBINDO NO TELÃO" : ""}</div>
                <span class="model-icon">${emoji}</span>
                <span class="model-name">${model.name}</span>
                <span class="model-tag">${model.tag || "Modelo 3D"}</span>
                <span class="model-size">${model.size || ""}</span>
                <button class="btn-select-model">${isActive ? "✓ ATIVO NO TELÃO" : "EXIBIR NO TELÃO 3D"}</button>
            `;

            card.addEventListener("click", () => {
                this.selectModel(model);
            });

            this.modelsGrid.appendChild(card);
        });
    }

    selectModel(model) {
        this.activeModel = model;
        if (this.activeCharName) {
            this.activeCharName.textContent = model.name;
        }

        // Broadcast to Presentation Stage
        this.syncBridge.broadcastModel(model);
        this.showToast(`✨ Modelo '${model.name}' enviado para a Apresentação!`);
        this.renderModelsGrid();
    }

    handleCustomFile(file) {
        const customModel = {
            id: file.name,
            name: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
            filename: file.name,
            url: URL.createObjectURL(file),
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            tag: "Arquivo Importado"
        };

        this.modelsList.unshift(customModel);
        this.selectModel(customModel);
        this.showToast(`📥 Arquivo '${file.name}' carregado e enviado ao telão!`);
    }

    triggerPower() {
        const effect = this.settingsState.effect || "cosmic_burst";
        this.syncBridge.broadcastPower(effect);
        this.showToast(`💥 Superpoder disparado no Telão!`);
    }

    loadSavedSettings() {
        const saved = this.syncBridge.getSavedState();
        if (saved.lastSettings) {
            this.settingsState = { ...this.settingsState, ...saved.lastSettings };
        }

        // Apply to Inputs
        if (this.depthInput) {
            this.depthInput.value = this.settingsState.depthSensitivity;
            if (this.depthVal) this.depthVal.textContent = `${this.settingsState.depthSensitivity.toFixed(1)}x`;
        }
        if (this.lateralInput) {
            this.lateralInput.value = this.settingsState.lateralSensitivity;
            if (this.lateralVal) this.lateralVal.textContent = `${this.settingsState.lateralSensitivity.toFixed(1)}x`;
        }
        if (this.scaleInput) {
            this.scaleInput.value = this.settingsState.avatarScale;
            if (this.scaleVal) this.scaleVal.textContent = `${this.settingsState.avatarScale.toFixed(2)}x`;
        }
        if (this.chkMirror) {
            this.chkMirror.checked = this.settingsState.isMirrored;
        }
        if (this.effectSelect) {
            this.effectSelect.value = this.settingsState.effect;
        }
        if (this.particleCountSlider) {
            this.particleCountSlider.value = this.settingsState.particleCount;
            if (this.particleVal) this.particleVal.textContent = this.settingsState.particleCount.toLocaleString();
        }
        if (this.stageSelect) {
            this.stageSelect.value = this.settingsState.stage;
        }
        if (this.lightIntensitySlider) {
            this.lightIntensitySlider.value = this.settingsState.lightIntensity;
            if (this.lightVal) this.lightVal.textContent = `${this.settingsState.lightIntensity.toFixed(1)}x`;
        }
    }

    resetToDefaults() {
        this.settingsState = {
            depthSensitivity: 1.2,
            lateralSensitivity: 1.0,
            avatarScale: 1.0,
            isMirrored: false,
            effect: "cosmic_burst",
            particleCount: 3000,
            stage: "cyber_arena",
            lightIntensity: 2.5
        };

        this.loadSavedSettings();
        this.syncBridge.broadcastSettings(this.settingsState);
        this.showToast("🔄 Configurações restauradas para os padrões");
    }

    updateConnectionStatus(state, label) {
        if (!this.statusBadge || !this.statusLabel) return;
        if (state === "connected") {
            this.statusBadge.className = "status-badge connected";
            this.statusLabel.textContent = "VISION ENGINE ONLINE";
            if (this.wsStatusText) {
                this.wsStatusText.className = "status-online";
                this.wsStatusText.textContent = "CONECTADO (ONLINE)";
            }
        } else {
            this.statusBadge.className = "status-badge";
            this.statusLabel.textContent = label.toUpperCase();
            if (this.wsStatusText) {
                this.wsStatusText.className = "status-offline";
                this.wsStatusText.textContent = label.toUpperCase();
            }
        }
    }

    showToast(message) {
        if (!this.toastContainer) return;
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 4000);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.dashboard = new ConfigDashboardApp();
});
