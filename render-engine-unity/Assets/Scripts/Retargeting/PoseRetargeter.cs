using System;
using UnityEngine;
using SuperheroLive.Network;

namespace SuperheroLive.Retargeting
{
    /// <summary>
    /// Real-time Retargeter for Unity Humanoid Avatars.
    /// Bridges incoming MediaPipe pose streams directly to Mecanim Humanoid Bones with FK & Two-Bone IK.
    /// </summary>
    [RequireComponent(typeof(Animator))]
    public class PoseRetargeter : MonoBehaviour
    {
        [Header("Networking")]
        [SerializeField] private StreamClient streamClient;

        [Header("Retargeting Settings")]
        [SerializeField] private bool mirrorMovement = true;
        [SerializeField] private bool autoScaleToUser = true;
        [Range(0.5f, 2.0f)] [SerializeField] private float avatarScaleMultiplier = 1.0f;
        [Range(0.05f, 1.0f)] [SerializeField] private float rotationSmoothSpeed = 0.45f;
        [Range(0.05f, 1.0f)] [SerializeField] private float positionSmoothSpeed = 0.35f;

        [Header("Anchors for VFX")]
        public Transform leftHandAnchor;
        public Transform rightHandAnchor;

        private Animator animator;
        private Transform hipsBone;
        private Transform spineBone;
        private Transform chestBone;
        private Transform headBone;

        private Transform leftUpperArmBone;
        private Transform leftLowerArmBone;
        private Transform rightUpperArmBone;
        private Transform rightLowerArmBone;

        private Transform leftUpperLegBone;
        private Transform leftLowerLegBone;
        private Transform rightUpperLegBone;
        private Transform rightLowerLegBone;

        private PosePacket currentPose;
        private bool hasTracking = false;

        private void Awake()
        {
            animator = GetComponent<Animator>();
            CacheHumanoidBones();
        }

        private void OnEnable()
        {
            if (streamClient != null)
            {
                streamClient.OnPoseUpdateJsonReceived += OnPoseJson;
                streamClient.OnPoseLost += OnPoseLost;
            }
        }

        private void OnDisable()
        {
            if (streamClient != null)
            {
                streamClient.OnPoseUpdateJsonReceived -= OnPoseJson;
                streamClient.OnPoseLost -= OnPoseLost;
            }
        }

        private void CacheHumanoidBones()
        {
            if (!animator.isHuman)
            {
                Debug.LogWarning("[PoseRetargeter] Target Animator is not configured as Humanoid. Bone mapping may be limited.");
                return;
            }

            hipsBone = animator.GetBoneTransform(HumanBodyBones.Hips);
            spineBone = animator.GetBoneTransform(HumanBodyBones.Spine);
            chestBone = animator.GetBoneTransform(HumanBodyBones.Chest) ?? spineBone;
            headBone = animator.GetBoneTransform(HumanBodyBones.Head);

            leftUpperArmBone = animator.GetBoneTransform(HumanBodyBones.LeftUpperArm);
            leftLowerArmBone = animator.GetBoneTransform(HumanBodyBones.LeftLowerArm);
            rightUpperArmBone = animator.GetBoneTransform(HumanBodyBones.RightUpperArm);
            rightLowerArmBone = animator.GetBoneTransform(HumanBodyBones.RightLowerArm);

            leftUpperLegBone = animator.GetBoneTransform(HumanBodyBones.LeftUpperLeg);
            leftLowerLegBone = animator.GetBoneTransform(HumanBodyBones.LeftLowerLeg);
            rightUpperLegBone = animator.GetBoneTransform(HumanBodyBones.RightUpperLeg);
            rightLowerLegBone = animator.GetBoneTransform(HumanBodyBones.RightLowerLeg);

            if (leftHandAnchor == null && leftLowerArmBone != null) leftHandAnchor = leftLowerArmBone;
            if (rightHandAnchor == null && rightLowerArmBone != null) rightHandAnchor = rightLowerArmBone;
        }

        private void OnPoseJson(string json)
        {
            try
            {
                currentPose = JsonUtility.FromJson<PosePacket>(json);
                hasTracking = (currentPose != null && currentPose.landmarks != null && currentPose.landmarks.Length == 33);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[PoseRetargeter] Error parsing pose JSON: {ex.Message}");
            }
        }

        private void OnPoseLost()
        {
            hasTracking = false;
        }

        private void LateUpdate()
        {
            if (!hasTracking || currentPose == null) return;

            ApplyRetargeting();
        }

        private void ApplyRetargeting()
        {
            var lms = currentPose.landmarks;
            var wlms = currentPose.world_landmarks;
            bool useWorld = (wlms != null && wlms.Length == 33);

            // Extract relevant landmarks
            Vector3 nose = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.NOSE] : lms[BoneMapper.NOSE], mirrorMovement, useWorld);
            Vector3 lShoulder = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.LEFT_SHOULDER] : lms[BoneMapper.LEFT_SHOULDER], mirrorMovement, useWorld);
            Vector3 rShoulder = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.RIGHT_SHOULDER] : lms[BoneMapper.RIGHT_SHOULDER], mirrorMovement, useWorld);
            Vector3 lElbow = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.LEFT_ELBOW] : lms[BoneMapper.LEFT_ELBOW], mirrorMovement, useWorld);
            Vector3 rElbow = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.RIGHT_ELBOW] : lms[BoneMapper.RIGHT_ELBOW], mirrorMovement, useWorld);
            Vector3 lWrist = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.LEFT_WRIST] : lms[BoneMapper.LEFT_WRIST], mirrorMovement, useWorld);
            Vector3 rWrist = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.RIGHT_WRIST] : lms[BoneMapper.RIGHT_WRIST], mirrorMovement, useWorld);

            Vector3 lHip = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.LEFT_HIP] : lms[BoneMapper.LEFT_HIP], mirrorMovement, useWorld);
            Vector3 rHip = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.RIGHT_HIP] : lms[BoneMapper.RIGHT_HIP], mirrorMovement, useWorld);
            Vector3 lKnee = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.LEFT_KNEE] : lms[BoneMapper.LEFT_KNEE], mirrorMovement, useWorld);
            Vector3 rKnee = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.RIGHT_KNEE] : lms[BoneMapper.RIGHT_KNEE], mirrorMovement, useWorld);
            Vector3 lAnkle = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.LEFT_ANKLE] : lms[BoneMapper.LEFT_ANKLE], mirrorMovement, useWorld);
            Vector3 rAnkle = BoneMapper.ToUnityVector(useWorld ? wlms[BoneMapper.RIGHT_ANKLE] : lms[BoneMapper.RIGHT_ANKLE], mirrorMovement, useWorld);

            // 1. Dynamic scale by user height
            if (autoScaleToUser && currentPose.metrics.torso_height > 0.1f)
            {
                float targetScale = (0.5f / currentPose.metrics.torso_height) * avatarScaleMultiplier;
                transform.localScale = Vector3.Lerp(transform.localScale, Vector3.one * targetScale, 0.1f);
            }

            // 2. Spine and Torso FK
            Vector3 hipCenter = (lHip + rHip) * 0.5f;
            Vector3 shoulderCenter = (lShoulder + rShoulder) * 0.5f;
            Vector3 spineDir = (shoulderCenter - hipCenter).normalized;

            if (spineBone != null)
            {
                Quaternion spineRot = Quaternion.FromToRotation(Vector3.up, spineDir);
                spineBone.rotation = Quaternion.Slerp(spineBone.rotation, spineRot, rotationSmoothSpeed);
            }

            // 3. Head & Neck FK
            if (headBone != null)
            {
                Vector3 headDir = (nose - shoulderCenter).normalized;
                Quaternion headRot = Quaternion.FromToRotation(Vector3.up, headDir);
                headBone.rotation = Quaternion.Slerp(headBone.rotation, headRot, rotationSmoothSpeed);
            }

            // 4. Arms Retargeting
            RetargetLimb(leftUpperArmBone, leftLowerArmBone, lShoulder, lElbow, lWrist, Vector3.right, Vector3.right);
            RetargetLimb(rightUpperArmBone, rightLowerArmBone, rShoulder, rElbow, rWrist, Vector3.left, Vector3.left);

            // 5. Legs Retargeting
            RetargetLimb(leftUpperLegBone, leftLowerLegBone, lHip, lKnee, lAnkle, Vector3.down, Vector3.down);
            RetargetLimb(rightUpperLegBone, rightLowerLegBone, rHip, rKnee, rAnkle, Vector3.down, Vector3.down);
        }

        private void RetargetLimb(Transform upperBone, Transform lowerBone, Vector3 rootPos, Vector3 midPos, Vector3 endPos, Vector3 defaultUpperDir, Vector3 defaultLowerDir)
        {
            if (upperBone == null || lowerBone == null) return;

            Vector3 upperDir = (midPos - rootPos).normalized;
            Vector3 lowerDir = (endPos - midPos).normalized;

            Quaternion qUpper = Quaternion.FromToRotation(defaultUpperDir, upperDir);
            Quaternion qLower = Quaternion.FromToRotation(defaultLowerDir, lowerDir);

            upperBone.rotation = Quaternion.Slerp(upperBone.rotation, qUpper, rotationSmoothSpeed);
            lowerBone.rotation = Quaternion.Slerp(lowerBone.rotation, qLower, rotationSmoothSpeed);
        }
    }
}
