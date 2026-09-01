using System;
using System.Collections.Generic;
using UnityEngine;

namespace SuperheroLive.VFX
{
    [Serializable]
    public class PowerEffectPreset
    {
        public string effectId = "cosmic_blast";
        public string displayName = "Cosmic Energy Burst";
        public ParticleSystem leftHandParticles;
        public ParticleSystem rightHandParticles;
        public AudioSource soundEffect;
    }

    /// <summary>
    /// Controls Particle VFX bursts anchored to avatar hands in Unity URP.
    /// </summary>
    public class PowerEffectController : MonoBehaviour
    {
        [Header("Effect Presets")]
        [SerializeField] private List<PowerEffectPreset> presets = new List<PowerEffectPreset>();
        [SerializeField] private float debounceSeconds = 0.25f;

        private float lastTriggerTime = 0.0f;

        public void PlayEffect(string effectId = null)
        {
            if (Time.time - lastTriggerTime < debounceSeconds) return;
            lastTriggerTime = Time.time;

            var targetPreset = presets.Find(p => string.Equals(p.effectId, effectId, StringComparison.OrdinalIgnoreCase));
            if (targetPreset == null && presets.Count > 0)
            {
                targetPreset = presets[0];
            }

            if (targetPreset != null)
            {
                if (targetPreset.leftHandParticles != null) targetPreset.leftHandParticles.Play();
                if (targetPreset.rightHandParticles != null) targetPreset.rightHandParticles.Play();
                if (targetPreset.soundEffect != null) targetPreset.soundEffect.Play();
                Debug.Log($"[PowerEffectController] Fired effect: {targetPreset.displayName}");
            }
        }
    }
}
