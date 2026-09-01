/**
 * Superhero Live Experience 3D - Multi-Screen Sync Bridge
 * Synchronizes Model Selection, Calibration Settings, VFX, and Stage across tabs & devices
 * via BroadcastChannel (local 0ms latency) and WebSocket (remote LAN).
 */

class SyncBridge {
    constructor(streamClient = null) {
        this.streamClient = streamClient;
        this.channelName = "superhero_live_channel";
        this.channel = null;

        this.listeners = {
            onModelChange: [],
            onSettingsChange: [],
            onPowerTrigger: [],
            onCameraReset: [],
            onRotateModel: [],
            onStateSync: []
        };

        this.initChannel();
        this.bindStreamClient();
    }

    initChannel() {
        if ("BroadcastChannel" in window) {
            try {
                this.channel = new BroadcastChannel(this.channelName);
                this.channel.onmessage = (event) => {
                    this.handleInboundMessage(event.data);
                };
            } catch (e) {
                console.warn("[SyncBridge] BroadcastChannel unavailable, using localStorage events:", e);
            }
        }

        // Fallback cross-window event via storage
        window.addEventListener("storage", (e) => {
            if (e.key === "superhero_sync_event" && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    this.handleInboundMessage(data);
                } catch (err) {}
            }
        });
    }

    bindStreamClient() {
        if (!this.streamClient) return;

        this.streamClient.onModelChange = (model) => {
            this.notify("onModelChange", model);
        };

        this.streamClient.onSettingsChange = (settings) => {
            this.notify("onSettingsChange", settings);
        };

        this.streamClient.onPowerTrigger = (effectId) => {
            this.notify("onPowerTrigger", effectId);
        };

        this.streamClient.onCustomMessage = (msg) => {
            if (msg.type === "RESET_CAMERA") {
                this.notify("onCameraReset");
            } else if (msg.type === "ROTATE_MODEL") {
                this.notify("onRotateModel", msg.axis);
            } else if (msg.type === "SYNC_STATE") {
                this.notify("onStateSync", msg.state);
            }
        };
    }

    handleInboundMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case "SET_MODEL":
                this.notify("onModelChange", data.model);
                break;
            case "SET_SETTINGS":
                this.notify("onSettingsChange", data.settings);
                break;
            case "TRIGGER_POWER":
            case "EVENT_POWER_TRIGGER":
                this.notify("onPowerTrigger", data.effect_id || "cosmic_burst");
                break;
            case "RESET_CAMERA":
                this.notify("onCameraReset");
                break;
            case "ROTATE_MODEL":
                this.notify("onRotateModel", data.axis);
                break;
            case "SYNC_STATE":
                this.notify("onStateSync", data.state);
                break;
        }
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    notify(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try { cb(...args); } catch (err) { console.error(err); }
            });
        }
    }

    /**
     * Broadcast model switch to all connected screens
     */
    broadcastModel(model) {
        const payload = { type: "SET_MODEL", model, timestamp: Date.now() };
        this.dispatch(payload);
        this.saveState({ lastModel: model });
    }

    /**
     * Broadcast settings updates
     */
    broadcastSettings(settings) {
        const payload = { type: "SET_SETTINGS", settings, timestamp: Date.now() };
        this.dispatch(payload);
        this.saveState({ lastSettings: settings });
    }

    /**
     * Broadcast power trigger VFX
     */
    broadcastPower(effectId = "cosmic_burst") {
        const payload = { type: "TRIGGER_POWER", effect_id: effectId, timestamp: Date.now() };
        this.dispatch(payload);
    }

    /**
     * Broadcast manual rotation
     */
    broadcastRotation(axis = "x") {
        const payload = { type: "ROTATE_MODEL", axis, timestamp: Date.now() };
        this.dispatch(payload);
    }

    /**
     * Broadcast camera reset
     */
    broadcastCameraReset() {
        const payload = { type: "RESET_CAMERA", timestamp: Date.now() };
        this.dispatch(payload);
    }

    dispatch(payload) {
        // 1. BroadcastChannel (local zero-latency)
        if (this.channel) {
            try { this.channel.postMessage(payload); } catch (e) {}
        }

        // 2. Storage event fallback
        try {
            localStorage.setItem("superhero_sync_event", JSON.stringify(payload));
        } catch (e) {}

        // 3. WebSocket (remote network relay)
        if (this.streamClient && this.streamClient.sendMessage) {
            this.streamClient.sendMessage(payload);
        }
    }

    saveState(partial) {
        try {
            const saved = JSON.parse(localStorage.getItem("superhero_app_state") || "{}");
            const merged = { ...saved, ...partial };
            localStorage.setItem("superhero_app_state", JSON.stringify(merged));
        } catch (e) {}
    }

    getSavedState() {
        try {
            return JSON.parse(localStorage.getItem("superhero_app_state") || "{}");
        } catch (e) {
            return {};
        }
    }
}
