using System;
using System.Text;
using System.Threading;
using System.Net.WebSockets;
using System.Threading.Tasks;
using UnityEngine;

namespace SuperheroLive.Network
{
    /// <summary>
    /// High-performance asynchronous WebSocket client for Unity 2022+ URP.
    /// Connects to the Python Vision Engine and receives 33 3D landmarks at 60 FPS.
    /// </summary>
    public class StreamClient : MonoBehaviour
    {
        [Header("Connection Settings")]
        [SerializeField] private string serverUrl = "ws://127.0.0.1:8765";
        [SerializeField] private bool autoConnect = true;
        [SerializeField] private float reconnectIntervalSeconds = 2.0f;

        public event Action<string> OnPoseUpdateJsonReceived;
        public event Action OnPoseLost;
        public event Action<string> OnPowerTriggerReceived;
        public event Action<bool> OnConnectionStatusChanged;

        private ClientWebSocket webSocket;
        private CancellationTokenSource cancellationTokenSource;
        private bool isConnected = false;
        private readonly object lockObject = new object();
        private string latestPendingJson = null;

        public bool IsConnected => isConnected;

        private void Start()
        {
            if (autoConnect)
            {
                Connect();
            }
        }

        public void Connect(string url = null)
        {
            if (!string.IsNullOrEmpty(url)) serverUrl = url;
            Disconnect();

            cancellationTokenSource = new CancellationTokenSource();
            Task.Run(() => ReceiveLoop(cancellationTokenSource.Token));
        }

        private async Task ReceiveLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    webSocket = new ClientWebSocket();
                    Debug.Log($"[StreamClient] Connecting to Vision Engine at {serverUrl}...");
                    await webSocket.ConnectAsync(new Uri(serverUrl), cancellationToken);

                    lock (lockObject) { isConnected = true; }
                    Debug.Log("[StreamClient] Connected to Vision Engine!");

                    var buffer = new byte[1024 * 32];

                    while (webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                    {
                        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, string.Empty, CancellationToken.None);
                            break;
                        }

                        string jsonString = Encoding.UTF8.GetString(buffer, 0, result.Count);
                        lock (lockObject)
                        {
                            latestPendingJson = jsonString;
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        Debug.LogWarning($"[StreamClient] Connection exception: {ex.Message}. Reconnecting in {reconnectIntervalSeconds}s...");
                    }
                }
                finally
                {
                    lock (lockObject) { isConnected = false; }
                    if (webSocket != null)
                    {
                        webSocket.Dispose();
                        webSocket = null;
                    }
                }

                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay((int)(reconnectIntervalSeconds * 1000), cancellationToken);
                }
            }
        }

        private void Update()
        {
            string jsonToProcess = null;
            lock (lockObject)
            {
                if (latestPendingJson != null)
                {
                    jsonToProcess = latestPendingJson;
                    latestPendingJson = null;
                }
            }

            if (!string.IsNullOrEmpty(jsonToProcess))
            {
                if (jsonToProcess.Contains("\"POSE_UPDATE\""))
                {
                    OnPoseUpdateJsonReceived?.Invoke(jsonToProcess);
                }
                else if (jsonToProcess.Contains("\"POSE_LOST\""))
                {
                    OnPoseLost?.Invoke();
                }
                else if (jsonToProcess.Contains("\"EVENT_POWER_TRIGGER\""))
                {
                    OnPowerTriggerReceived?.Invoke("cosmic_blast");
                }
            }
        }

        public void Disconnect()
        {
            if (cancellationTokenSource != null)
            {
                cancellationTokenSource.Cancel();
                cancellationTokenSource.Dispose();
                cancellationTokenSource = null;
            }

            if (webSocket != null)
            {
                try { webSocket.Dispose(); } catch { }
                webSocket = null;
            }

            isConnected = false;
        }

        private void OnDestroy()
        {
            Disconnect();
        }
    }
}
