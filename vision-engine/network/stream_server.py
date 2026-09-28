"""
High Performance Async WebSocket Stream Server.
Broadcasts motion capture pose packets (33 landmarks, world metric coords, bounding boxes)
with sub-millisecond serialization overhead to Unity, WebGL and Operator HUD clients.
"""

import asyncio
import json
import logging
import threading
import time
from typing import Set, Dict, Any, Optional
import websockets

logger = logging.getLogger(__name__)

class StreamServer:
    """
    Thread-safe WebSocket server for broadcasting real-time pose and tracking data.
    """
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self.clients: Set[Any] = set()
        
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.server = None
        self.thread: Optional[threading.Thread] = None
        self.is_running = False
        self.lock = threading.Lock()
        
        # Telemetry metrics
        self.packets_sent = 0
        self.last_broadcast_time = time.time()
        self.broadcast_fps = 0.0
        self.message_handler = None

    def start(self):
        """Starts WebSocket server on a dedicated asyncio event loop thread."""
        logger.info(f"Initializing WebSocket Stream Server on ws://{self.host}:{self.port}...")
        self.is_running = True
        self.thread = threading.Thread(target=self._run_event_loop, daemon=True, name="WebSocketStreamServerThread")
        self.thread.start()

    def _run_event_loop(self):
        """Asyncio loop thread runner."""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        async def main_server():
            async with websockets.serve(self._handle_client, self.host, self.port, ping_interval=10, ping_timeout=20) as s:
                self.server = s
                logger.info(f"WebSocket Server is actively listening on ws://{self.host}:{self.port}")
                while self.is_running:
                    await asyncio.sleep(0.1)

        try:
            self.loop.run_until_complete(main_server())
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if self.is_running:
                logger.error(f"WebSocket server encountered error: {e}", exc_info=True)
        finally:
            try:
                # Cancel any pending tasks
                pending = asyncio.all_tasks(self.loop)
                for task in pending:
                    task.cancel()
                if pending:
                    self.loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except Exception:
                pass

    async def _handle_client(self, websocket: Any, *args):
        """Client connection handler (supports both 1-arg websockets 14+ and 2-arg legacy)."""
        with self.lock:
            self.clients.add(websocket)
        
        client_addr = getattr(websocket, "remote_address", "Client")
        logger.info(f"⚡ [WebSocket] Client connected: {client_addr} (Total clients: {len(self.clients)})")

        try:
            # Send initial welcome & protocol handshake packet
            handshake = {
                "type": "HANDSHAKE",
                "version": "1.0.0",
                "system": "HoloHero 3D Vision Server",
                "timestamp": time.time()
            }
            await websocket.send(json.dumps(handshake))

            # Listen for inbound commands from client (e.g. trigger_power, calibrate)
            async for raw_msg in websocket:
                try:
                    msg = json.loads(raw_msg)
                    self._on_client_message(msg, websocket)
                except json.JSONDecodeError:
                    pass
        except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.warning(f"Error handling client {client_addr}: {e}")
        finally:
            with self.lock:
                self.clients.discard(websocket)
            logger.info(f"[WebSocket] Client disconnected: {client_addr} (Remaining clients: {len(self.clients)})")

    def _on_client_message(self, msg: Dict[str, Any], websocket: Any):
        """Handles incoming messages from operator HUD or game engine."""
        msg_type = msg.get("type")
        if msg_type == "PING":
            asyncio.run_coroutine_threadsafe(
                websocket.send(json.dumps({"type": "PONG", "timestamp": time.time()})),
                self.loop
            )
        elif msg_type == "TRIGGER_POWER":
            # Echo power trigger to all other connected render engines
            self.broadcast({
                "type": "EVENT_POWER_TRIGGER",
                "effect_id": msg.get("effect_id", "cosmic_burst"),
                "timestamp": time.time()
            })
        elif msg_type in ("SET_MODEL", "SET_SETTINGS", "SYNC_STATE", "RESET_CAMERA"):
            # Relay configuration and model selection to all display/render clients
            self.broadcast(msg)

        if self.message_handler:
            try:
                self.message_handler(msg)
            except Exception as e:
                logger.warning(f"Error in stream server message_handler: {e}")

    def broadcast(self, payload: Dict[str, Any]):
        """
        Thread-safe broadcast of JSON packet to all connected clients.
        """
        if not self.loop or not self.loop.is_running() or not self.clients:
            return

        with self.lock:
            clients_snapshot = list(self.clients)

        if not clients_snapshot:
            return

        json_str = json.dumps(payload)
        now = time.time()
        self.packets_sent += 1
        
        if now - self.last_broadcast_time >= 1.0:
            self.broadcast_fps = self.packets_sent / (now - self.last_broadcast_time)
            self.packets_sent = 0
            self.last_broadcast_time = now

        # Schedule coroutine on the asyncio loop
        async def _send_all():
            tasks = [client.send(json_str) for client in clients_snapshot]
            await asyncio.gather(*tasks, return_exceptions=True)

        asyncio.run_coroutine_threadsafe(_send_all(), self.loop)

    def stop(self):
        """Shuts down the server."""
        logger.info("Stopping WebSocket Stream Server...")
        self.is_running = False
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        logger.info("WebSocket Server stopped.")
