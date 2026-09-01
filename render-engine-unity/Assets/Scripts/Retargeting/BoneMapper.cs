using System;
using System.Collections.Generic;
using UnityEngine;

namespace SuperheroLive.Retargeting
{
    [Serializable]
    public struct LandmarkData
    {
        public float x;
        public float y;
        public float z;
        public float visibility;
    }

    [Serializable]
    public struct BoundingBox
    {
        public float min_x;
        public float min_y;
        public float max_x;
        public float max_y;
    }

    [Serializable]
    public struct PoseMetrics
    {
        public float shoulder_width;
        public float torso_height;
    }

    [Serializable]
    public class PosePacket
    {
        public string type;
        public double timestamp;
        public double server_time;
        public float latency_ms;
        public int frame_id;
        public LandmarkData[] landmarks;
        public LandmarkData[] world_landmarks;
        public BoundingBox bbox;
        public PoseMetrics metrics;
    }

    /// <summary>
    /// Utility class to map MediaPipe landmarks into Unity coordinate space.
    /// </summary>
    public static class BoneMapper
    {
        // MediaPipe indices
        public const int NOSE = 0;
        public const int LEFT_SHOULDER = 11;
        public const int RIGHT_SHOULDER = 12;
        public const int LEFT_ELBOW = 13;
        public const int RIGHT_ELBOW = 14;
        public const int LEFT_WRIST = 15;
        public const int RIGHT_WRIST = 16;
        public const int LEFT_HIP = 23;
        public const int RIGHT_HIP = 24;
        public const int LEFT_KNEE = 25;
        public const int RIGHT_KNEE = 26;
        public const int LEFT_ANKLE = 27;
        public const int RIGHT_ANKLE = 28;

        /// <summary>
        /// Converts a MediaPipe 3D Landmark to a Unity Vector3.
        /// </summary>
        public static Vector3 ToUnityVector(LandmarkData lm, bool mirrored = true, bool isWorld = false)
        {
            if (isWorld)
            {
                // World coordinates are metric relative to hips
                float vx = mirrored ? -lm.x : lm.x;
                float vy = -lm.y;
                float vz = -lm.z;
                return new Vector3(vx, vy, vz);
            }
            else
            {
                // Normalized 2D/3D screen space [-1, 1]
                float vx = (mirrored ? (1.0f - lm.x) : lm.x) * 2.0f - 1.0f;
                float vy = (1.0f - lm.y) * 2.0f - 1.0f;
                float vz = -lm.z * 2.0f;
                return new Vector3(vx, vy, vz);
            }
        }
    }
}
