using UnityEngine;
using UnityEngine.UI;
using SuperheroLive.Network;
using SuperheroLive.VFX;

namespace SuperheroLive.UI
{
    /// <summary>
    /// Operator GUI Panel for Unity displaying FPS, latency, and real-time controls.
    /// </summary>
    public class OperatorPanel : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private StreamClient streamClient;
        [SerializeField] private PowerEffectController effectController;
        [SerializeField] private GameObject hudContainer;

        private bool isPanelVisible = false;
        private float deltaTime = 0.0f;

        private void Update()
        {
            deltaTime += (Time.unscaledDeltaTime - deltaTime) * 0.1f;

            if (Input.GetKeyDown(KeyCode.O) || Input.GetKeyDown(KeyCode.H))
            {
                isPanelVisible = !isPanelVisible;
                if (hudContainer != null)
                {
                    hudContainer.SetActive(isPanelVisible);
                }
            }

            if (Input.GetKeyDown(KeyCode.F))
            {
                Screen.fullScreen = !Screen.fullScreen;
            }
        }

        private void OnGUI()
        {
            if (!isPanelVisible) return;

            float fps = 1.0f / deltaTime;
            
            GUILayout.BeginArea(new Rect(20, 20, 320, 220), GUI.skin.box);
            GUILayout.Label("<b>SUPERHERO LIVE 3D - OPERATOR PANEL</b>");
            GUILayout.Space(6);
            
            string status = (streamClient != null && streamClient.IsConnected) ? "<color=green>ONLINE</color>" : "<color=red>OFFLINE</color>";
            GUILayout.Label($"Vision Server: {status}");
            GUILayout.Label($"Render FPS: {fps:F1}");
            GUILayout.Space(8);

            if (GUILayout.Button("💥 Fire Power Effect (Test)"))
            {
                if (effectController != null) effectController.PlayEffect();
            }

            if (GUILayout.Button("⛶ Toggle Fullscreen (F)"))
            {
                Screen.fullScreen = !Screen.fullScreen;
            }

            GUILayout.Space(8);
            GUILayout.Label("<size=11>Press [O] to hide panel | [Space] to fire power</size>");
            GUILayout.EndArea();
        }
    }
}
