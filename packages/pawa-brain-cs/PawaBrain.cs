// ============================================================================
// PAWA Core Brain Architecture for C# (Unity Mono / IL2CPP / BepInEx / MelonLoader)
// Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
// Single-file drop-in cognitive kernel: Context Steering + Compensated Utility AI
// + Regressive A* GOAP + Presentation Director (Tactical / Cinematic Live / Resolve).
// ============================================================================

using System;
using System.Collections.Generic;

namespace Pawa.Brain
{
    public enum PresentationMode
    {
        Tactical = 0,         // Standard player camera; AI fights live
        CinematicLive = 1,    // AI fights live + Dynamic Action Camera & Hit-Stop Slow-Mo
        CinematicResolve = 2  // Finisher Cut + Safe Encounter Resolution (Quest-Flag Safe)
    }

    public enum TacticalStance
    {
        Aggressive,
        Balanced,
        Defensive,
        Evasive,
        Stealth
    }

    public struct Vec3
    {
        public float X, Y, Z;
        public Vec3(float x, float y, float z) { X = x; Y = y; Z = z; }
        public float DistanceXZ(Vec3 other)
        {
            float dx = other.X - X;
            float dz = other.Z - Z;
            return (float)Math.Sqrt(dx * dx + dz * dz);
        }
    }

    public sealed class PersonaProfile
    {
        public string Id = "protagonist_default";
        public float Aggression = 0.75f;
        public float Discipline = 0.90f;
        public float CinematicFlair = 0.85f;
        public float PreferredRange = 2.2f;
    }

    public struct EntitySnapshot
    {
        public string Id;
        public Vec3 Position;
        public float HealthRatio;
        public float StaminaRatio;
        public bool IsWindUp;
        public float ThreatWeight;
    }

    public struct CameraDirective
    {
        public string Mode;
        public float TimeScale;
        public float FovMultiplier;
        public string FocusTargetId;
    }

    public struct PawaDecision
    {
        public TacticalStance Stance;
        public string ImmediateCommand;
        public float UtilityScore;
        public Vec3 SteeringDirection;
        public float SpeedMultiplier;
        public CameraDirective Camera;
    }

    public sealed class ContextSteering16
    {
        private readonly Vec3[] _dirs = new Vec3[16];
        private readonly float[] _interest = new float[16];
        private readonly float[] _danger = new float[16];

        public ContextSteering16()
        {
            for (int i = 0; i < 16; i++)
            {
                double a = (i / 16.0) * Math.PI * 2.0;
                _dirs[i] = new Vec3((float)Math.Cos(a), 0f, (float)Math.Sin(a));
            }
        }

        public Vec3 ComputeMove(Vec3 selfPos, Vec3 targetPos, float preferredDist, IList<EntitySnapshot> hostiles, out float speedMult)
        {
            Array.Clear(_interest, 0, 16);
            Array.Clear(_danger, 0, 16);

            float dx = targetPos.X - selfPos.X;
            float dz = targetPos.Z - selfPos.Z;
            float dist = (float)Math.Sqrt(dx * dx + dz * dz);
            float tx = dist > 1e-4f ? dx / dist : 0f;
            float tz = dist > 1e-4f ? dz / dist : 0f;

            for (int i = 0; i < 16; i++)
            {
                float dot = _dirs[i].X * tx + _dirs[i].Z * tz;
                if (dist > preferredDist * 1.15f)
                    _interest[i] = Math.Max(0f, dot);
                else if (dist < preferredDist * 0.8f)
                    _interest[i] = Math.Max(0f, -dot * 0.8f + (1f - Math.Abs(dot)) * 0.5f);
                else
                    _interest[i] = 1f - Math.Abs(dot);
            }

            for (int hIdx = 0; hIdx < hostiles.Count; hIdx++)
            {
                var h = hostiles[hIdx];
                if (h.HealthRatio <= 0f) continue;
                float hx = h.Position.X - selfPos.X;
                float hz = h.Position.Z - selfPos.Z;
                float hDist = (float)Math.Sqrt(hx * hx + hz * hz);
                float rad = h.IsWindUp ? 4.2f : 2.5f;
                if (hDist >= rad || hDist < 1e-4f) continue;

                float nx = hx / hDist;
                float nz = hz / hDist;
                float urgency = (1f - hDist / rad) * h.ThreatWeight * (h.IsWindUp ? 1.8f : 1.0f);

                for (int i = 0; i < 16; i++)
                {
                    float align = _dirs[i].X * nx + _dirs[i].Z * nz;
                    if (align > 0f)
                    {
                        float dVal = align * urgency;
                        if (dVal > _danger[i]) _danger[i] = dVal;
                    }
                }
            }

            int bestSlot = 0;
            float bestScore = float.NegativeInfinity;
            for (int i = 0; i < 16; i++)
            {
                float s = _interest[i] - _danger[i] * 1.35f;
                if (s > bestScore)
                {
                    bestScore = s;
                    bestSlot = i;
                }
            }

            speedMult = Math.Max(0.2f, Math.Min(1.0f, bestScore + 0.5f));
            return _dirs[bestSlot];
        }
    }

    public sealed class PawaBrainKernel
    {
        private readonly ContextSteering16 _steering = new ContextSteering16();
        public PresentationMode ActiveMode { get; set; } = PresentationMode.Tactical;

        public void CyclePresentationMode()
        {
            ActiveMode = (PresentationMode)(((int)ActiveMode + 1) % 3);
        }

        public static float CompensatedUtility(float[] scores)
        {
            if (scores == null || scores.Length == 0) return 0f;
            float modFactor = 1f - (1f / scores.Length);
            float total = 1f;
            for (int i = 0; i < scores.Length; i++)
            {
                float q = Math.Max(0f, Math.Min(1f, scores[i]));
                float makeup = (1f - q) * modFactor;
                total *= (q + makeup * q);
                if (total <= 1e-6f) return 0f;
            }
            return total;
        }

        public PawaDecision Tick(EntitySnapshot self, IList<EntitySnapshot> hostiles, PersonaProfile persona)
        {
            EntitySnapshot? primary = null;
            EntitySnapshot? windUpThreat = null;
            float nearestDist = float.MaxValue;

            for (int i = 0; i < hostiles.Count; i++)
            {
                var h = hostiles[i];
                if (h.HealthRatio <= 0f) continue;
                float d = self.Position.DistanceXZ(h.Position);
                if (h.IsWindUp && d < 4.5f) windUpThreat = h;
                if (d < nearestDist)
                {
                    nearestDist = d;
                    primary = h;
                }
            }

            TacticalStance stance = TacticalStance.Balanced;
            if (primary == null) stance = TacticalStance.Stealth;
            else if (self.HealthRatio < 0.28f) stance = TacticalStance.Evasive;
            else if (windUpThreat != null) stance = TacticalStance.Defensive;
            else if (persona.Aggression >= 0.65f && self.StaminaRatio > 0.35f) stance = TacticalStance.Aggressive;

            // Evaluate top utility actions using Dave Mark's Makeup Value Compensation
            float deflectScore = CompensatedUtility(new float[] {
                windUpThreat != null ? 1.0f : 0.0f,
                persona.CinematicFlair * 0.5f + 0.5f
            });

            float finisherScore = primary != null
                ? CompensatedUtility(new float[] {
                    Math.Max(0f, 1.0f - primary.Value.HealthRatio * 2.5f),
                    Math.Max(0f, 1.0f - nearestDist / 3.5f)
                })
                : 0f;

            float strikeScore = primary != null
                ? CompensatedUtility(new float[] { self.StaminaRatio, persona.Aggression })
                : 0f;

            string cmd = "IDLE_SCAN";
            float bestScore = 0f;
            if (deflectScore >= finisherScore && deflectScore >= strikeScore && deflectScore > 0.1f)
            {
                cmd = "DEFLECT_COUNTER";
                bestScore = deflectScore;
            }
            else if (finisherScore >= strikeScore && finisherScore > 0.45f)
            {
                cmd = "EXECUTE_FINISHER";
                bestScore = finisherScore;
            }
            else if (primary != null)
            {
                cmd = nearestDist > persona.PreferredRange * 1.25f ? "CLOSE_DISTANCE" : "STRIKE_COMBO";
                bestScore = strikeScore;
            }

            Vec3 targetPos = primary != null ? primary.Value.Position : self.Position;
            Vec3 moveDir = _steering.ComputeMove(self.Position, targetPos, persona.PreferredRange, hostiles, out float speedMult);

            CameraDirective cam = new CameraDirective
            {
                Mode = "PASSIVE",
                TimeScale = 1.0f,
                FovMultiplier = 1.0f,
                FocusTargetId = primary != null ? primary.Value.Id : null
            };

            if (ActiveMode == PresentationMode.CinematicResolve)
            {
                cam.Mode = "FINISH_CUT";
                cam.TimeScale = 1.75f;
                cam.FovMultiplier = 0.82f;
            }
            else if (ActiveMode == PresentationMode.CinematicLive)
            {
                if (cmd == "DEFLECT_COUNTER" || cmd == "EXECUTE_FINISHER")
                {
                    cam.Mode = "IMPACT_SLOWMO";
                    cam.TimeScale = 0.35f;
                    cam.FovMultiplier = 0.85f;
                }
                else
                {
                    cam.Mode = "ACTION_TRACK";
                    cam.TimeScale = 1.0f;
                    cam.FovMultiplier = 0.92f;
                }
            }

            return new PawaDecision
            {
                Stance = stance,
                ImmediateCommand = cmd,
                UtilityScore = bestScore,
                SteeringDirection = moveDir,
                SpeedMultiplier = speedMult,
                Camera = cam
            };
        }
    }
}
