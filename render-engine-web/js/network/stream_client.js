/**
 * WebSocket Stream Client for Superhero Live Experience 3D
 * Connects to Python Vision Engine and receives 33 3D landmarks at 60 FPS.
 */

class StreamClient {
    constructor(url = "ws://127.0.0.1:8765") {
        this.url = url;
        this.socket = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.reconnectInterval = 2000;
        
        // Listeners
        this.onPoseUpdate = null;
        this.onPoseLost = null;
        this.onPowerTrigger = null;
        this.onModelChange = null;
        this.onSettingsChange = null;
        this.onStatusChange = null;
        this.onCustomMessage = null;

        // Telemetry
        this.lastPacketTime = 0;
        this.latencyMs = 0;
        this.packetCount = 0;
    }

    connect(newUrl = null) {
        if (newUrl) this.url = newUrl;
        
        if (this.socket) {
            try { this.socket.close(); } catch(e) {}
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this._updateStatus("connecting", "CONECTANDO...");

        try {
            this.socket = new WebSocket(this.url);
        } catch (err) {
            console.warn("WebSocket init error:", err);
            this._scheduleReconnect();
            return;
        }

        this.socket.onopen = () => {
            this.isConnected = true;
            this._updateStatus("connected", "CONECTADO (ONLINE)");
            console.log(`[StreamClient] Connected to Vision Engine at ${this.url}`);
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this._handleMessage(msg);
            } catch (err) {
                console.error("[StreamClient] Packet JSON parse error:", err);
            }
        };

        this.socket.onclose = () => {
            this.isConnected = false;
            this._updateStatus("disconnected", "DESCONECTADO (TENTANDO RECONEXÃO...)");
            this._scheduleReconnect();
        };

        this.socket.onerror = (err) => {
            this.isConnected = false;
            this._updateStatus("error", "ERRO DE CONEXÃO");
        };
    }

    _handleMessage(msg) {
        const now = performance.now();
        this.packetCount++;

        if (msg.type === "POSE_UPDATE") {
            if (msg.server_time) {
                // Approximate client-server latency
                this.latencyMs = msg.latency_ms || 10.0;
            }
            if (this.onPoseUpdate) {
                this.onPoseUpdate(msg);
            }
        } else if (msg.type === "POSE_LOST") {
            if (this.onPoseLost) {
                this.onPoseLost();
            }
        } else if (msg.type === "EVENT_POWER_TRIGGER") {
            if (this.onPowerTrigger) {
                this.onPowerTrigger(msg.effect_id || "cosmic_blast");
            }
        } else if (msg.type === "SET_MODEL") {
            if (this.onModelChange) {
                this.onModelChange(msg.model);
            }
        } else if (msg.type === "SET_SETTINGS") {
            if (this.onSettingsChange) {
                this.onSettingsChange(msg.settings);
            }
        }

        if (this.onCustomMessage) {
            this.onCustomMessage(msg);
        }
    }

    _updateStatus(state, label) {
        if (this.onStatusChange) {
            this.onStatusChange(state, label);
        }
    }

    _scheduleReconnect() {
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, this.reconnectInterval);
        }
    }

    sendMessage(payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(payload));
            } catch (e) {
                console.warn("[StreamClient] send failed:", e);
            }
        }
    }

    sendTrigger(effectId = "cosmic_burst") {
        this.sendMessage({
            type: "TRIGGER_POWER",
            effect_id: effectId,
            timestamp: Date.now()
        });
    }

    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.socket) this.socket.close();
    }
}
