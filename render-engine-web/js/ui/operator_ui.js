/**
 * Operator UI & Character Selection Controller
 * Connects dynamic models from /api/models, system settings, hotkeys, and toast alerts.
 */

class OperatorUI {
    constructor(app) {
        this.app = app;
        
        // Modals & Panels
        this.charModal = document.getElementById("character-modal");
        this.settingsModal = document.getElementById("settings-modal");
        this.btnOpenCharacters = document.getElementById("btn-open-characters");
        this.btnOpenSettings = document.getElementById("btn-open-settings");
        this.btnCloseCharModal = document.getElementById("btn-close-char-modal");
        this.btnCloseSettingsModal = document.getElementById("btn-close-settings-modal");
        
        // Quick Action Buttons
        this.btnFullscreen = document.getElementById("btn-toggle-fullscreen");
        this.btnCinema = document.getElementById("btn-toggle-cinema");
        this.btnQuickPower = document.getElementById("btn-quick-power");
        this.btnQuickImport = document.getElementById("btn-quick-import");
        this.btnTestPower = document.getElementById("btn-test-power");

        // Models Grid & Drop Zone
        this.modelsGrid = document.getElementById("models-grid");
        this.modalDropZone = document.getElementById("modal-drop-zone");
        this.btnBrowseFile = document.getElementById("btn-browse-file");
        this.fileCharacterInput = document.getElementById("file-character");

        // HUD Elements
        this.statusBadge = document.getElementById("tracking-status");
        this.statusLabel = document.getElementById("status-label");
        this.activeCharName = document.getElementById("active-char-name");
        this.hudFps = document.getElementById("hud-fps");
        this.hudLatency = document.getElementById("hud-latency");
        this.hudTracking = document.getElementById("hud-tracking");
        this.toastContainer = document.getElementById("toast-container");

        // Settings Inputs
        this.depthSensitivityInput = document.getElementById("depth-sensitivity");
        this.lateralSensitivityInput = document.getElementById("lateral-sensitivity");
        this.avatarScaleInput = document.getElementById("avatar-scale");
        this.chkMirror = document.getElementById("chk-mirror");
        this.btnRotateX = document.getElementById("btn-rotate-x");
        this.btnRotateY = document.getElementById("btn-rotate-y");
        this.btnRotate180 = document.getElementById("btn-rotate-180");
        this.effectSelect = document.getElementById("effect-select");
        this.particleCountSlider = document.getElementById("particle-count");
        this.stageSelect = document.getElementById("stage-select");
        this.lightIntensitySlider = document.getElementById("light-intensity");
        this.wsUrlInput = document.getElementById("ws-url");
        this.btnReconnect = document.getElementById("btn-reconnect");
        this.wsStatusText = document.getElementById("ws-status-text");

        this.modelsList = [];
        this.activeModelId = "Curious skeleton.glb";
        this.isCinemaMode = false;

        this.init();
    }

    init() {
        this.initEvents();
        this.fetchModelsList();
    }

    initEvents() {
        // Modal Open / Close
        if (this.btnOpenCharacters) {
            this.btnOpenCharacters.addEventListener("click", () => this.openModal(this.charModal));
        }
        if (this.btnOpenSettings) {
            this.btnOpenSettings.addEventListener("click", () => this.openModal(this.settingsModal));
        }
        if (this.btnCloseCharModal) {
            this.btnCloseCharModal.addEventListener("click", () => this.closeModal(this.charModal));
        }
        if (this.btnCloseSettingsModal) {
            this.btnCloseSettingsModal.addEventListener("click", () => this.closeModal(this.settingsModal));
        }

        // Close modal when clicking outside card
        [this.charModal, this.settingsModal].forEach(modal => {
            if (modal) {
                modal.addEventListener("click", (e) => {
                    if (e.target === modal) this.closeModal(modal);
                });
            }
        });

        // Quick Actions
        if (this.btnFullscreen) {
            this.btnFullscreen.addEventListener("click", () => this.toggleFullscreen());
        }
        if (this.btnCinema) {
            this.btnCinema.addEventListener("click", () => this.toggleCinemaMode());
        }
        if (this.btnQuickPower) {
            this.btnQuickPower.addEventListener("click", () => this.app.triggerPower());
        }
        if (this.btnTestPower) {
            this.btnTestPower.addEventListener("click", () => this.app.triggerPower());
        }
        if (this.btnQuickImport) {
            this.btnQuickImport.addEventListener("click", () => {
                if (this.fileCharacterInput) this.fileCharacterInput.click();
            });
        }
        if (this.btnBrowseFile) {
            this.btnBrowseFile.addEventListener("click", () => {
                if (this.fileCharacterInput) this.fileCharacterInput.click();
            });
        }

        // File Input Change
        if (this.fileCharacterInput) {
            this.fileCharacterInput.addEventListener("change", (e) => {
                if (e.target.files.length > 0) {
                    this.loadCustomFile(e.target.files[0]);
                }
            });
        }

        // Drag & Drop
        window.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        window.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.name.toLowerCase().endsWith(".glb") || file.name.toLowerCase().endsWith(".gltf")) {
                    this.loadCustomFile(file);
                } else {
                    this.showToast("⚠️ Selecione um arquivo 3D no formato .GLB ou .GLTF");
                }
            }
        });

        // Filter Tabs
        const filterTabs = document.querySelectorAll(".filter-tab");
        filterTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                filterTabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                const filter = tab.getAttribute("data-filter");
                this.renderModelsGrid(filter);
            });
        });

        // Settings Event Bindings
        if (this.depthSensitivityInput) {
            this.depthSensitivityInput.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (this.app.boneMapper) {
                    this.app.boneMapper.depthSensitivity = val;
                }
            });
        }

        if (this.lateralSensitivityInput) {
            this.lateralSensitivityInput.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (this.app.boneMapper) {
                    this.app.boneMapper.lateralSensitivity = val;
                }
            });
        }

        if (this.avatarScaleInput) {
            this.avatarScaleInput.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                const char = this.app.getActiveCharacter();
                if (char && char.model) {
                    char.model.scale.setScalar(val);
                }
            });
        }

        if (this.chkMirror) {
            this.chkMirror.addEventListener("change", (e) => {
                if (this.app.boneMapper) {
                    this.app.boneMapper.isMirrored = e.target.checked;
                    this.showToast(e.target.checked ? "🪞 Espelhamento ativado" : "Normal ativado");
                }
            });
        }

        if (this.btnRotateX) {
            this.btnRotateX.addEventListener("click", () => this.rotateActiveModelX());
        }
        if (this.btnRotateY) {
            this.btnRotateY.addEventListener("click", () => this.rotateActiveModelY());
        }
        if (this.btnRotate180) {
            this.btnRotate180.addEventListener("click", () => this.rotateActiveModel180());
        }

        if (this.effectSelect) {
            this.effectSelect.addEventListener("change", (e) => {
                if (this.app.powerEffects) {
                    this.app.powerEffects.currentEffect = e.target.value;
                    this.showToast(`💥 Efeito selecionado: ${e.target.value.replace("_", " ").toUpperCase()}`);
                }
            });
        }

        if (this.particleCountSlider) {
            this.particleCountSlider.addEventListener("input", (e) => {
                if (this.app.powerEffects) {
                    this.app.powerEffects.maxParticles = parseInt(e.target.value, 10);
                }
            });
        }

        if (this.stageSelect) {
            this.stageSelect.addEventListener("change", (e) => {
                if (this.app.stage) {
                    this.app.stage.setEnvironment(e.target.value);
                    this.showToast(`🌌 Cenário: ${e.target.value.toUpperCase()}`);
                }
            });
        }

        if (this.lightIntensitySlider) {
            this.lightIntensitySlider.addEventListener("input", (e) => {
                if (this.app.stage) {
                    this.app.stage.setLightingIntensity(parseFloat(e.target.value));
                }
            });
        }

        if (this.btnReconnect) {
            this.btnReconnect.addEventListener("click", () => {
                const url = this.wsUrlInput.value.trim();
                this.app.streamClient.connect(url);
                this.showToast("Tentando reconectar ao Vision Server...");
            });
        }

        // Global Keyboard Shortcuts
        window.addEventListener("keydown", (e) => {
            // Ignore keystrokes inside input fields
            if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
                return;
            }

            const key = e.key.toLowerCase();
            if (key === " " || e.code === "Space") {
                e.preventDefault();
                this.app.triggerPower();
            } else if (key === "c") {
                this.openModal(this.charModal);
            } else if (key === "o") {
                this.openModal(this.settingsModal);
            } else if (key === "f") {
                this.toggleFullscreen();
            } else if (key === "h") {
                this.toggleCinemaMode();
            } else if (key === "escape") {
                this.closeModal(this.charModal);
                this.closeModal(this.settingsModal);
            }
        });
    }

    openModal(modal) {
        if (!modal) return;
        modal.classList.add("open");
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.remove("open");
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

    toggleCinemaMode() {
        this.isCinemaMode = !this.isCinemaMode;
        document.body.classList.toggle("cinema-mode", this.isCinemaMode);
        this.showToast(this.isCinemaMode ? "👁️ Modo Cinema Ativado (Pressione [H] para reexibir)" : "Interface Reexibida");
    }

    /**
     * Fetches dynamic model list from /api/models (scans Models/ folder)
     */
    async fetchModelsList() {
        try {
            const res = await fetch("/api/models");
            if (res.ok) {
                const data = await res.json();
                this.modelsList = data;
            } else {
                throw new Error("HTTP " + res.status);
            }
        } catch (err) {
            console.warn("[OperatorUI] Could not fetch /api/models, using local fallback presets:", err);
            this.modelsList = [
                { id: "black_suited_spider_man.glb", name: "Black Suited Spider-Man", filename: "black_suited_spider_man.glb", url: "/models/black_suited_spider_man.glb", size: "11.1 MB", tag: "Super-Herói / Rigged" },
                { id: "dead_pool.glb", name: "Deadpool", filename: "dead_pool.glb", url: "/models/dead_pool.glb", size: "5.9 MB", tag: "Super-Herói / Rigged" },
                { id: "spiderman_brand_new_day.glb", name: "Spider-Man Brand New Day", filename: "spiderman_brand_new_day.glb", url: "/models/spiderman_brand_new_day.glb", size: "18.6 MB", tag: "Super-Herói / Rigged" },
                { id: "spider_punk.glb", name: "Spider Punk", filename: "spider_punk.glb", url: "/models/spider_punk.glb", size: "20.5 MB", tag: "Super-Herói / Rigged" },
                { id: "green_goblin.glb", name: "Green Goblin", filename: "green_goblin.glb", url: "/models/green_goblin.glb", size: "0.3 MB", tag: "Super-Herói / Rigged" }
            ];
        }

        // Add procedural superhero presets
        this.proceduralList = [
            { id: "cyber_iron", name: "Cyber Iron Hero", type: "procedural", size: "PBR", tag: "Super-Herói" },
            { id: "cosmic_knight", name: "Cosmic Shadow Knight", type: "procedural", size: "PBR", tag: "Guerreiro" },
            { id: "neon_spider", name: "Neon Emerald Champion", type: "procedural", size: "PBR", tag: "Campeão" }
        ];

        this.renderModelsGrid("all");

        // Automatically load Curious skeleton.glb or first model on startup
        const defaultModel = this.modelsList.find(m => m.id === "Curious skeleton.glb") || this.modelsList[0];
        if (defaultModel) {
            this.selectModel(defaultModel);
        }
    }

    renderModelsGrid(filter = "all") {
        if (!this.modelsGrid) return;
        this.modelsGrid.innerHTML = "";

        let items = [];
        if (filter === "all" || filter === "rigged" || filter === "heroes") {
            items = items.concat(this.modelsList);
        }
        if (filter === "all" || filter === "procedural" || filter === "heroes") {
            items = items.concat(this.proceduralList);
        }

        if (filter === "rigged") {
            items = items.filter(m => m.tag && m.tag.includes("Rigged"));
        }

        if (items.length === 0) {
            this.modelsGrid.innerHTML = `<div class="loading-models"><span>Nenhum modelo encontrado nesta categoria.</span></div>`;
            return;
        }

        items.forEach(model => {
            const card = document.createElement("div");
            card.className = "model-card" + (this.activeModelId === model.id ? " active-model" : "");
            
            let emoji = "🦸";
            if (model.id.includes("skeleton") || model.id.includes("esqueleto")) emoji = "🦴";
            else if (model.id.includes("spider") || model.id.includes("miranha")) emoji = "🕷️";
            else if (model.id.includes("d.va") || model.id.includes("ivy")) emoji = "⚡";
            else if (model.id.includes("gorilla")) emoji = "🦍";
            else if (model.id.includes("remy")) emoji = "🥋";

            card.innerHTML = `
                <span class="model-icon">${emoji}</span>
                <span class="model-name">${model.name}</span>
                <span class="model-tag">${model.tag || "Modelo 3D"}</span>
                <span class="model-size">${model.size || ""}</span>
                <button class="btn-select-model">${this.activeModelId === model.id ? "✓ ATIVO" : "SELECIONAR"}</button>
            `;

            card.addEventListener("click", () => {
                this.selectModel(model);
                this.closeModal(this.charModal);
            });

            this.modelsGrid.appendChild(card);
        });
    }

    selectModel(model) {
        this.activeModelId = model.id;
        if (this.activeCharName) {
            this.activeCharName.textContent = model.name;
        }

        this.showToast(`⏳ Carregando ${model.name}...`);

        if (model.type === "procedural") {
            const char = this.app.characterLoader.createProceduralHero(model.id);
            this.app.activeCharacter = char;
            this.showToast(`✅ ${model.name} carregado com sucesso!`);
            this.renderModelsGrid(document.querySelector(".filter-tab.active")?.getAttribute("data-filter") || "all");
        } else {
            this.app.characterLoader.loadCustomGLB(model.url || model.id, (char) => {
                this.app.activeCharacter = char;
                this.showToast(`✅ ${model.name} carregado e calibrado com sucesso!`);
                this.renderModelsGrid(document.querySelector(".filter-tab.active")?.getAttribute("data-filter") || "all");
            }, (err) => {
                console.error("Error loading model:", err);
                this.showToast(`❌ Erro ao carregar ${model.name}`);
            });
        }
    }

    loadCustomFile(file) {
        this.showToast(`⏳ Carregando arquivo '${file.name}'...`);
        this.app.characterLoader.loadCustomGLB(file, (char) => {
            this.app.activeCharacter = char;
            this.activeModelId = file.name;
            if (this.activeCharName) {
                this.activeCharName.textContent = file.name;
            }
            this.showToast(`✅ '${file.name}' importado e calibrado!`);
            this.closeModal(this.charModal);
        }, (err) => {
            console.error("Error loading custom file:", err);
            this.showToast(`❌ Erro ao processar arquivo 3D`);
        });
    }

    rotateActiveModelX() {
        const char = this.app.getActiveCharacter();
        if (char && char.model) {
            char.model.rotation.x += Math.PI / 2;
            char.root.updateMatrixWorld(true);
            if (this.app.characterLoader && this.app.characterLoader.cacheBindPose) {
                this.app.characterLoader.cacheBindPose(char);
            }
            this.showToast("🔄 Rotação X ajustada em +90°");
        }
    }

    rotateActiveModelY() {
        const char = this.app.getActiveCharacter();
        if (char && char.model) {
            char.model.rotation.y += Math.PI / 2;
            char.root.updateMatrixWorld(true);
            if (this.app.characterLoader && this.app.characterLoader.cacheBindPose) {
                this.app.characterLoader.cacheBindPose(char);
            }
            this.showToast("🔄 Rotação Y ajustada em +90°");
        }
    }

    rotateActiveModel180() {
        const char = this.app.getActiveCharacter();
        if (char && char.model) {
            char.model.rotation.y += Math.PI;
            char.root.updateMatrixWorld(true);
            if (this.app.characterLoader && this.app.characterLoader.cacheBindPose) {
                this.app.characterLoader.cacheBindPose(char);
            }
            this.showToast("🔄 Modelo invertido em 180° (Frente / Costas)");
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

    updateConnectionStatus(state, label) {
        if (!this.statusBadge || !this.statusLabel) return;
        if (state === "connected") {
            this.statusBadge.className = "status-badge connected";
            this.statusLabel.textContent = "VISION ENGINE ONLINE";
            if (this.wsStatusText) {
                this.wsStatusText.className = "status-online";
                this.wsStatusText.textContent = "ONLINE (CONECTADO)";
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

    updateTelemetry(fps, latencyMs, isTracking) {
        if (this.hudFps) this.hudFps.textContent = Math.round(fps);
        if (this.hudLatency) this.hudLatency.textContent = latencyMs > 0 ? `${latencyMs} ms` : "-- ms";
        if (this.hudTracking) {
            this.hudTracking.textContent = isTracking ? "🟢 RASTREAMENTO ATIVO" : "🟡 AGUARDANDO USUÁRIO";
            this.hudTracking.style.color = isTracking ? "var(--accent-green)" : "var(--primary-gold)";
        }
    }
}
