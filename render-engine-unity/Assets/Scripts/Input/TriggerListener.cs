using UnityEngine;
using SuperheroLive.VFX;

namespace SuperheroLive.InputControl
{
    /// <summary>
    /// Listens for keyboard shortcuts (Spacebar), mouse, pedals, or USB HID external triggers.
    /// </summary>
    public class TriggerListener : MonoBehaviour
    {
        [Header("Targets")]
        [SerializeField] private PowerEffectController effectController;

        [Header("Keybindings")]
        [SerializeField] private KeyCode primaryTriggerKey = KeyCode.Space;
        [SerializeField] private KeyCode secondaryTriggerKey = KeyCode.Return;
        [SerializeField] private KeyCode operatorToggleKey = KeyCode.O;

        [Header("Active Effect")]
        [SerializeField] private string selectedEffectId = "cosmic_blast";

        private void Update()
        {
            if (Input.GetKeyDown(primaryTriggerKey) || Input.GetKeyDown(secondaryTriggerKey) || Input.GetMouseButtonDown(0))
            {
                if (effectController != null)
                {
                    effectController.PlayEffect(selectedEffectId);
                }
            }

            // Quick effect preset keys (1, 2, 3, 4)
            if (Input.GetKeyDown(KeyCode.Alpha1)) selectedEffectId = "cosmic_blast";
            if (Input.GetKeyDown(KeyCode.Alpha2)) selectedEffectId = "thunder_lightning";
            if (Input.GetKeyDown(KeyCode.Alpha3)) selectedEffectId = "flaming_fire";
            if (Input.GetKeyDown(KeyCode.Alpha4)) selectedEffectId = "cosmic_web";
        }

        public void SetActiveEffect(string effectId)
        {
            selectedEffectId = effectId;
        }
    }
}
