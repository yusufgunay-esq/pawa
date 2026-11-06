// ============================================================================
// Stuntdouble Core Brain Architecture for C# (Unity Mono / IL2CPP / BepInEx / MelonLoader / .NET)
// Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
//
// Single-file drop-in implementation of the full 4-Layer cognitive kernel:
//   Layer 4: Narrative & Tactical Orchestrator (5 AutonomyModes, stance, camera)
//   Layer 3B: Regressive A* GOAP Planner (boolean proposition domain)
//   Layer 3A: Makeup-Value Compensated Utility AI (+ deterministic epsilon-delta jitter)
//   Layer 2: Tactical Blackboard + 2D Spatial Influence Map
//   Layer 1: 16-Slot Context Steering (Interest - Danger synthesis)
//
// NOTE ON NUMERIC TYPE: all simulation state is `double`. This is deliberate. The
// whitepaper defines the kernel over the reals, and float32 rounding of profile
// parameters (0.88f != 0.88) would silently break decision parity with the
// TypeScript/C++/Lua kernels. Unity call sites pass Vector3 floats in (implicit
// float -> double) and cast back on the way out; no per-tick allocation is added.
//
// Verified decision-for-decision against the TypeScript reference by packages/conformance.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Globalization;

namespace Stuntdouble.Brain
{
    public enum AutonomyMode
    {
        FullCombat = 0,
        CoPilot = 1,
        GrindAutopilot = 2,
        ShadowSurvival = 3,
        Commander = 4
    }

    /// <summary>
    /// Composable behavior flags. The five AutonomyMode names are presets over these.
    /// Conflict rules: DEFENSIVE overrides offense; ASSIST is inert while COMBAT is set AND an enemy exists;
    /// CRUISE runs only while no enemy exists; ASSIST+CRUISE: cruise when clear, human pass-through + reflex
    /// intercept when an enemy exists; no active behavior => human input passes, Stuntdouble idle.
    /// </summary>
    [Flags]
    public enum Behaviors
    {
        None = 0,
        Combat = 1,
        Assist = 2,
        Cruise = 4,
        Defensive = 8,
        Command = 16
    }

    public static class AutonomyPresets
    {
        public static Behaviors Of(AutonomyMode mode)
        {
            switch (mode)
            {
                case AutonomyMode.CoPilot: return Behaviors.Assist;
                case AutonomyMode.GrindAutopilot: return Behaviors.Cruise | Behaviors.Combat;
                case AutonomyMode.ShadowSurvival: return Behaviors.Defensive;
                case AutonomyMode.Commander: return Behaviors.Combat | Behaviors.Command;
                default: return Behaviors.Combat;
            }
        }
    }

    public enum PresentationMode
    {
        Tactical = 0,
        CinematicLive = 1,
        CinematicResolve = 2
    }

    public enum TacticalStance
    {
        Aggressive = 0,
        Balanced = 1,
        Defensive = 2,
        Evasive = 3,
        Stealth = 4
    }

    public struct Vec3
    {
        public double X, Y, Z;

        public Vec3(double x, double y, double z) { X = x; Y = y; Z = z; }

        /// <summary>XZ-plane distance (Y is ignored: Stuntdouble reasons on the horizontal plane).</summary>
        public double DistanceXZ(Vec3 other)
        {
            double dx = other.X - X;
            double dz = other.Z - Z;
            return Math.Sqrt(dx * dx + dz * dz);
        }
    }

    public sealed class BehaviorProfile
    {
        public string Id = "protagonist_default";
        public string Name = "Protagonist";
        public double Aggression = 0.78;      // [0,1] offensive bias / gap closing
        public double Discipline = 0.90;      // [0,1] inverse stochastic noise
        public double CinematicFlair = 0.85;  // [0,1] finishers, parries, camera drama
        public int ReactionDelayMs = 90;      // simulated motor latency
        public double PreferredRange = 2.2;   // optimal engagement ring (meters)
    }

    public struct EntitySnapshot
    {
        public string Id;
        public Vec3 Position;
        public Vec3 Velocity;
        public double HealthRatio;
        public double StaminaRatio;
        public bool IsAttacking;
        public bool IsWindUp;      // telegraphing an incoming strike
        public bool IsRanged;
        public double ThreatWeight;
        public double ProjectileEta; // seconds until a projectile this entity fired lands; <= 0 = none in flight
        public double AttackRange;   // [CORE-005] ranged: real firing range in meters; <= 0 = 16 m default
    }

    public struct CameraDirective
    {
        public string Mode;        // PASSIVE | ACTION_TRACK | IMPACT_SLOWMO | FINISH_CUT
        public double TimeScale;
        public double FovMultiplier;
        public string FocusTargetId;
    }

    public struct StuntDecision
    {
        public AutonomyMode AutonomyMode;   // legacy name echo (FullCombat when ticked by mask)
        public Behaviors Behaviors;         // resolved flag mask actually used
        public TacticalStance Stance;
        public bool InterceptHumanInput;
        public string SelectedUtilityAction;
        public double UtilityScore;
        public string[] GoapPlan;
        public string ImmediateCommand;
        public Vec3 SteeringDirection;
        public double SpeedMultiplier;
        public CameraDirective Camera;
    }

    /// <summary>Boolean proposition domain used by the GOAP planner.</summary>
    public sealed class WorldState : Dictionary<string, bool>
    {
        public WorldState() : base(StringComparer.Ordinal) { }

        public WorldState(WorldState other) : base(other, StringComparer.Ordinal) { }

        /// <summary>True only when the key is present AND equals value (mirrors TS `current[k] === v`).</summary>
        public bool Holds(string key, bool value)
        {
            bool v;
            return TryGetValue(key, out v) && v == value;
        }
    }

    // ========================================================================
    // SHARED MATH HELPERS (identical formulas in every Stuntdouble runtime)
    // ========================================================================

    public static class StuntMath
    {
        public static double Clamp01(double x)
        {
            if (x < 0.0) return 0.0;
            if (x > 1.0) return 1.0;
            return x;
        }

        /// <summary>floor(x * 10^digits + 0.5) / 10^digits — shared rounding across runtimes.</summary>
        public static double Quantize(double value, int digits)
        {
            double scale = Math.Pow(10.0, digits);
            return Math.Floor(value * scale + 0.5) / scale;
        }
    }

    // ========================================================================
    // LAYER 1: 16-SLOT CONTEXT STEERING (Fray 2013 / Reynolds 1999)
    // ========================================================================

    public readonly struct Hazard
    {
        public readonly Vec3 Position;
        public readonly double Radius;
        public readonly double Weight;

        public Hazard(Vec3 position, double radius, double weight)
        {
            Position = position;
            Radius = radius;
            Weight = weight;
        }
    }

    public sealed class ContextSteering
    {
        private readonly int _slotCount;
        private readonly Vec3[] _directions;
        private readonly double[] _interest;
        private readonly double[] _danger;

        public ContextSteering(int slotCount = 16)
        {
            _slotCount = slotCount;
            _directions = new Vec3[slotCount];
            _interest = new double[slotCount];
            _danger = new double[slotCount];
            for (int i = 0; i < slotCount; i++)
            {
                double angle = ((double)i / slotCount) * Math.PI * 2.0;
                _directions[i] = new Vec3(Math.Cos(angle), 0.0, Math.Sin(angle));
            }
        }

        public int SlotCount { get { return _slotCount; } }

        public Vec3 Direction(int slot) { return _directions[slot]; }

        /// <summary>
        /// Conflict-free XZ movement: interest toward the preferred combat ring minus
        /// repulsive hazard cones. Returns the winning unit slot direction.
        /// </summary>
        public Vec3 ComputeMoveVector(
            Vec3 selfPos,
            Vec3 targetPos,
            double preferredDistance,
            IList<Hazard> hazards,
            out double speedMultiplier)
        {
            Array.Clear(_interest, 0, _slotCount);
            Array.Clear(_danger, 0, _slotCount);

            double dx = targetPos.X - selfPos.X;
            double dz = targetPos.Z - selfPos.Z;
            double dist = Math.Sqrt(dx * dx + dz * dz);
            double tx = dist > 1e-5 ? dx / dist : 0.0;
            double tz = dist > 1e-5 ? dz / dist : 0.0;

            for (int i = 0; i < _slotCount; i++)
            {
                double dot = _directions[i].X * tx + _directions[i].Z * tz;
                if (dist > preferredDistance * 1.15)
                {
                    _interest[i] = Math.Max(0.0, dot);                              // close the gap
                }
                else if (dist < preferredDistance * 0.8)
                {
                    _interest[i] = Math.Max(0.0, -dot * 0.8 + (1.0 - Math.Abs(dot)) * 0.5); // disengage
                }
                else
                {
                    _interest[i] = 1.0 - Math.Abs(dot);                             // strafe the ring
                }
            }

            if (hazards != null)
            {
                for (int h = 0; h < hazards.Count; h++)
                {
                    Hazard hz = hazards[h];
                    double hx = hz.Position.X - selfPos.X;
                    double hzz = hz.Position.Z - selfPos.Z;
                    double hDist = Math.Sqrt(hx * hx + hzz * hzz);
                    if (hDist >= hz.Radius || hDist < 1e-5) continue;

                    double nx = hx / hDist;
                    double nz = hzz / hDist;
                    double proximityUrgency = (1.0 - hDist / hz.Radius) * hz.Weight;

                    for (int i = 0; i < _slotCount; i++)
                    {
                        double alignment = _directions[i].X * nx + _directions[i].Z * nz;
                        if (alignment > 0.0)
                        {
                            double dVal = alignment * proximityUrgency;
                            if (dVal > _danger[i]) _danger[i] = dVal;
                        }
                    }
                }
            }

            int bestSlot = 0;
            double bestScore = double.NegativeInfinity;
            for (int i = 0; i < _slotCount; i++)
            {
                double score = _interest[i] - _danger[i] * 1.35;
                if (score > bestScore)
                {
                    bestScore = score;
                    bestSlot = i;
                }
            }

            speedMultiplier = Math.Max(0.2, Math.Min(1.0, bestScore + 0.5));
            return _directions[bestSlot];
        }
    }

    // ========================================================================
    // LAYER 2: 2D SPATIAL INFLUENCE MAP + TACTICAL BLACKBOARD
    // ========================================================================

    public sealed class InfluenceMap2D
    {
        public readonly int GridSize;
        public readonly double CellSize;
        private readonly double[] _grid;

        public InfluenceMap2D(int gridSize = 16, double cellSize = 2.5)
        {
            GridSize = gridSize;
            CellSize = cellSize;
            _grid = new double[gridSize * gridSize];
        }

        public void Update(Vec3 centerPos, IList<EntitySnapshot> hostiles, IList<EntitySnapshot> allies = null)
        {
            Array.Clear(_grid, 0, _grid.Length);
            double halfSpan = (GridSize * CellSize) / 2.0;

            for (int gx = 0; gx < GridSize; gx++)
            {
                for (int gz = 0; gz < GridSize; gz++)
                {
                    double worldX = centerPos.X - halfSpan + (gx + 0.5) * CellSize;
                    double worldZ = centerPos.Z - halfSpan + (gz + 0.5) * CellSize;

                    double score = 0.0;
                    if (hostiles != null)
                    {
                        for (int i = 0; i < hostiles.Count; i++)
                        {
                            EntitySnapshot h = hostiles[i];
                            double dx = worldX - h.Position.X;
                            double dz = worldZ - h.Position.Z;
                            double d = Math.Sqrt(dx * dx + dz * dz);
                            score -= (h.ThreatWeight * (h.IsWindUp ? 1.75 : 1.0)) / (1.0 + d * 0.45);
                        }
                    }
                    if (allies != null)
                    {
                        for (int i = 0; i < allies.Count; i++)
                        {
                            EntitySnapshot a = allies[i];
                            double dx = worldX - a.Position.X;
                            double dz = worldZ - a.Position.Z;
                            double d = Math.Sqrt(dx * dx + dz * dz);
                            score += a.ThreatWeight / (1.0 + d * 0.5);
                        }
                    }
                    _grid[gz * GridSize + gx] = score;
                }
            }
        }

        /// <summary>[CORE-005] Crowd positioning: best of 8 ring points (least threat, pulled towards the target).</summary>
        public Vec3 FindLocalPocket(Vec3 centerPos, IList<EntitySnapshot> hostiles, Vec3? target, double ringRadius)
        {
            const double S = 0.7071067811865476;
            double[] dxs = { 1.0, S, 0.0, -S, -1.0, -S, 0.0, S };
            double[] dzs = { 0.0, S, 1.0, S, 0.0, -S, -1.0, -S };
            Vec3 best = centerPos;
            double bestVal = double.NegativeInfinity;
            for (int k = 0; k < 8; k++)
            {
                double px = centerPos.X + dxs[k] * ringRadius;
                double pz = centerPos.Z + dzs[k] * ringRadius;
                double score = 0.0;
                for (int i = 0; i < hostiles.Count; i++)
                {
                    EntitySnapshot h = hostiles[i];
                    double dx = px - h.Position.X;
                    double dz = pz - h.Position.Z;
                    double d = Math.Sqrt(dx * dx + dz * dz);
                    score -= (h.ThreatWeight * (h.IsWindUp ? 1.75 : 1.0)) / (1.0 + d * 0.45);
                }
                if (target.HasValue)
                {
                    double tx = px - target.Value.X;
                    double tz = pz - target.Value.Z;
                    double td = Math.Sqrt(tx * tx + tz * tz);
                    score -= 0.25 * Math.Max(0.0, td - 2.0);
                }
                if (score > bestVal)
                {
                    bestVal = score;
                    best = new Vec3(px, centerPos.Y, pz);
                }
            }
            return best;
        }

        /// <summary>Highest scoring (safest) cell within the local grid.</summary>
        public Vec3 FindSafestPocket(Vec3 centerPos)
        {
            double halfSpan = (GridSize * CellSize) / 2.0;
            int bestIdx = 0;
            double bestVal = double.NegativeInfinity;

            for (int i = 0; i < _grid.Length; i++)
            {
                if (_grid[i] > bestVal)
                {
                    bestVal = _grid[i];
                    bestIdx = i;
                }
            }

            int gx = bestIdx % GridSize;
            int gz = bestIdx / GridSize;
            return new Vec3(
                centerPos.X - halfSpan + (gx + 0.5) * CellSize,
                centerPos.Y,
                centerPos.Z - halfSpan + (gz + 0.5) * CellSize);
        }
    }

    public sealed class TacticalBlackboard
    {
        public EntitySnapshot Self;
        public List<EntitySnapshot> Hostiles = new List<EntitySnapshot>();
        public BehaviorProfile Profile;
        public PresentationMode PresentationMode = PresentationMode.Tactical;
        public TacticalStance Stance = TacticalStance.Balanced;
        public EntitySnapshot? PrimaryTarget;
        public EntitySnapshot? ImminentThreat;
        public EntitySnapshot? RangedThreat; // nearest ranged hostile winding up (<= 16 m) or with a projectile in flight
        public double PressureIndex;
        public bool PressureHigh; // [CORE-005] crowd pressure with hysteresis (in above 0.72, out below 0.6)
        public readonly InfluenceMap2D InfluenceMap = new InfluenceMap2D(12, 2.5);

        public void Refresh(EntitySnapshot self, IList<EntitySnapshot> hostiles, BehaviorProfile profile)
        {
            Self = self;
            Profile = profile;
            Hostiles.Clear();
            if (hostiles != null)
            {
                for (int i = 0; i < hostiles.Count; i++)
                {
                    if (hostiles[i].HealthRatio > 0.0) Hostiles.Add(hostiles[i]);
                }
            }

            double nearestDist = double.PositiveInfinity;
            EntitySnapshot? bestTarget = null;
            EntitySnapshot? windUpThreat = null;
            EntitySnapshot? rangedThreat = null;
            double rangedDist = double.PositiveInfinity;
            double rawPressure = 0.0;

            for (int i = 0; i < Hostiles.Count; i++)
            {
                EntitySnapshot h = Hostiles[i];
                double dx = h.Position.X - self.Position.X;
                double dz = h.Position.Z - self.Position.Z;
                double d = Math.Sqrt(dx * dx + dz * dz);

                rawPressure += h.ThreatWeight / Math.Max(1.0, d * 0.35);

                if (h.IsWindUp && d < 4.5 && !h.IsRanged) windUpThreat = h;
                if (h.IsRanged && ((h.IsWindUp && d <= (h.AttackRange > 0.0 ? h.AttackRange : 16.0)) || h.ProjectileEta > 0.0) && d < rangedDist)
                {
                    rangedDist = d;
                    rangedThreat = h;
                }
                double key = h.IsRanged ? d * 0.5 : d;
                if (key < nearestDist)
                {
                    nearestDist = key;
                    bestTarget = h;
                }
            }

            PrimaryTarget = bestTarget;
            ImminentThreat = windUpThreat;
            RangedThreat = rangedThreat;
            PressureIndex = Math.Min(1.0, rawPressure / 3.5);
            if (PressureHigh) { if (PressureIndex < 0.6) PressureHigh = false; }
            else if (PressureIndex > 0.72) PressureHigh = true;
            InfluenceMap.Update(self.Position, Hostiles);
        }

        public double TargetDistance()
        {
            if (PrimaryTarget == null) return double.PositiveInfinity;
            return Self.Position.DistanceXZ(PrimaryTarget.Value.Position);
        }

        public WorldState ToWorldState()
        {
            bool hasTarget = PrimaryTarget != null;
            double dist = TargetDistance();
            double preferred = Profile != null ? Profile.PreferredRange : 0.0;

            WorldState ws = new WorldState();
            ws["hasHostiles"] = Hostiles.Count > 0;
            ws["inMeleeRange"] = dist <= 2.8;
            ws["inPreferredRange"] = dist <= preferred * 1.2;
            ws["underImminentAttack"] = ImminentThreat != null;
            ws["threatNeutralized"] = ImminentThreat == null;
            ws["healthCritical"] = Self.HealthRatio < 0.3;
            ws["staminaSufficient"] = Self.StaminaRatio > 0.25;
            ws["targetVulnerable"] = hasTarget && PrimaryTarget.Value.HealthRatio < 0.25;
            ws["enemyEliminated"] = !hasTarget;
            ws["survived"] = Self.HealthRatio >= 0.65 && ImminentThreat == null;
            return ws;
        }
    }

    // ========================================================================
    // LAYER 3A: RESPONSE CURVES, COMPENSATED UTILITY AI, DISCIPLINE JITTER
    // ========================================================================

    public static class Curves
    {
        public static double Linear(double x) { return StuntMath.Clamp01(x); }

        public static double InverseLinear(double x) { return StuntMath.Clamp01(1.0 - x); }

        public static double Quadratic(double x, double k = 2.0)
        {
            return Math.Pow(StuntMath.Clamp01(x), k);
        }

        public static double Logistic(double x, double k = 10.0, double x0 = 0.5)
        {
            return 1.0 / (1.0 + Math.Exp(-k * (StuntMath.Clamp01(x) - x0)));
        }
    }

    /// <summary>
    /// Deterministic epsilon-delta discipline jitter (WHITEPAPER §Layer 3A).
    /// Golden-ratio additive recurrence => identical values in every runtime, no RNG seeding.
    /// </summary>
    public sealed class DisciplineJitter
    {
        private const double GoldenConjugate = 0.6180339887498949;
        private int _cursor;

        public void Reset() { _cursor = 0; }

        public double Next(double discipline)
        {
            _cursor++;
            double scaled = _cursor * GoldenConjugate;
            double u = scaled - Math.Floor(scaled);
            double d = StuntMath.Clamp01(discipline);
            return ((1.0 - d) / 10.0) * (2.0 * u - 1.0);
        }
    }

    public sealed class Consideration
    {
        public readonly string Name;
        public readonly Func<TacticalBlackboard, double> Evaluate;
        public readonly Func<double, double> Curve;

        public Consideration(string name, Func<TacticalBlackboard, double> evaluate, Func<double, double> curve)
        {
            Name = name;
            Evaluate = evaluate;
            Curve = curve;
        }
    }

    public sealed class UtilityAction
    {
        public readonly string Id;
        public readonly Consideration[] Considerations;

        public UtilityAction(string id, params Consideration[] considerations)
        {
            Id = id;
            Considerations = considerations;
        }

        /// <summary>Dave Mark's Makeup Value compensated multiplicative score.</summary>
        public double Score(TacticalBlackboard bb)
        {
            if (Considerations.Length == 0) return 0.0;

            double n = Considerations.Length;
            double modificationFactor = 1.0 - 1.0 / n;
            double runningScore = 1.0;

            for (int i = 0; i < Considerations.Length; i++)
            {
                Consideration c = Considerations[i];
                double raw = StuntMath.Clamp01(c.Evaluate(bb));
                double q = StuntMath.Clamp01(c.Curve(raw));
                double makeUpValue = (1.0 - q) * modificationFactor;
                runningScore *= q + makeUpValue * q;
                if (runningScore <= 1e-6) return 0.0;
            }

            return runningScore;
        }
    }

    // ========================================================================
    // LAYER 3B: REGRESSIVE A* GOAP PLANNER (Orkin 2006 / F.E.A.R.)
    // ========================================================================

    public sealed class GoapAction
    {
        public string Name;
        public WorldState Preconditions = new WorldState();
        public WorldState Effects = new WorldState();
        public double BaseCost = 1.0;
        public Func<TacticalBlackboard, double> DynamicCost; // optional

        public GoapAction() { }

        public GoapAction(string name, WorldState pre, WorldState effects, double baseCost)
        {
            Name = name;
            Preconditions = pre;
            Effects = effects;
            BaseCost = baseCost;
        }
    }

    public sealed class GoapPlanner
    {
        private sealed class PlanNode
        {
            public WorldState UnmetGoal;
            public List<GoapAction> Actions;
            public double GCost;
            public double FCost;
            public int Seq; // insertion order => deterministic tie-break
        }

        /// <summary>
        /// Backward regressive A* search from the goal proposition set to the live world state.
        /// Returns null when no chain is reachable within the expansion budget.
        /// </summary>
        public List<GoapAction> Plan(
            WorldState currentState,
            WorldState goalState,
            IList<GoapAction> availableActions,
            TacticalBlackboard bb)
        {
            List<PlanNode> openSet = new List<PlanNode>();
            int seq = 0;
            openSet.Add(new PlanNode
            {
                UnmetGoal = new WorldState(goalState),
                Actions = new List<GoapAction>(),
                GCost = 0.0,
                FCost = Heuristic(currentState, goalState),
                Seq = seq++
            });
            HashSet<string> closedSet = new HashSet<string>(StringComparer.Ordinal);

            int iterations = 0;
            const int maxIterations = 256;

            while (openSet.Count > 0 && iterations++ < maxIterations)
            {
                openSet.Sort((a, b) =>
                {
                    int cmp = a.FCost.CompareTo(b.FCost);
                    return cmp != 0 ? cmp : a.Seq.CompareTo(b.Seq);
                });

                PlanNode current = openSet[0];
                openSet.RemoveAt(0);

                if (IsSatisfied(currentState, current.UnmetGoal))
                {
                    List<GoapAction> result = new List<GoapAction>(current.Actions);
                    result.Reverse();
                    return result;
                }

                string key = SerializeState(current.UnmetGoal);
                if (closedSet.Contains(key)) continue;
                closedSet.Add(key);

                for (int i = 0; i < availableActions.Count; i++)
                {
                    GoapAction action = availableActions[i];
                    if (!DoesActionSatisfyAny(action, current.UnmetGoal, currentState)) continue;

                    WorldState nextUnmet = RegressState(current.UnmetGoal, action);
                    double stepCost = action.DynamicCost != null ? action.DynamicCost(bb) : action.BaseCost;
                    double g = current.GCost + Math.Max(0.05, stepCost);
                    double h = Heuristic(currentState, nextUnmet);

                    List<GoapAction> chain = new List<GoapAction>(current.Actions);
                    chain.Add(action);
                    openSet.Add(new PlanNode
                    {
                        UnmetGoal = nextUnmet,
                        Actions = chain,
                        GCost = g,
                        FCost = g + h,
                        Seq = seq++
                    });
                }
            }

            return null;
        }

        private static bool IsSatisfied(WorldState current, WorldState required)
        {
            foreach (KeyValuePair<string, bool> kv in required)
            {
                if (!current.Holds(kv.Key, kv.Value)) return false;
            }
            return true;
        }

        private static bool DoesActionSatisfyAny(GoapAction action, WorldState unmetGoal, WorldState currentState)
        {
            bool helps = false;
            foreach (KeyValuePair<string, bool> kv in action.Effects)
            {
                bool goalValue;
                if (!unmetGoal.TryGetValue(kv.Key, out goalValue)) continue;

                bool isNow = currentState.Holds(kv.Key, goalValue);
                if (goalValue == kv.Value && !isNow)
                {
                    helps = true;
                }
                else if (goalValue != kv.Value)
                {
                    return false;
                }
            }
            return helps;
        }

        private static WorldState RegressState(WorldState unmetGoal, GoapAction action)
        {
            WorldState next = new WorldState(unmetGoal);
            foreach (string k in action.Effects.Keys) next.Remove(k);
            foreach (KeyValuePair<string, bool> kv in action.Preconditions) next[kv.Key] = kv.Value;
            return next;
        }

        private static double Heuristic(WorldState current, WorldState required)
        {
            int diff = 0;
            foreach (KeyValuePair<string, bool> kv in required)
            {
                if (!current.Holds(kv.Key, kv.Value)) diff++;
            }
            return diff * 0.5;
        }

        private static string SerializeState(WorldState state)
        {
            List<string> keys = new List<string>(state.Keys);
            keys.Sort(StringComparer.Ordinal);
            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            for (int i = 0; i < keys.Count; i++)
            {
                if (i > 0) sb.Append('|');
                sb.Append(keys[i]).Append(':').Append(state[keys[i]] ? "true" : "false");
            }
            return sb.ToString();
        }
    }

    // ========================================================================
    // LAYER 4: ORCHESTRATOR + UNIFIED KERNEL
    // ========================================================================

    public sealed class StuntBrainKernel
    {
        public readonly TacticalBlackboard Blackboard = new TacticalBlackboard();
        public readonly ContextSteering Steering = new ContextSteering(16);
        public readonly GoapPlanner Planner = new GoapPlanner();
        public PresentationMode ActiveMode { get; set; }
        public AutonomyMode ActiveAutonomy { get; set; }

        private readonly DisciplineJitter _jitter = new DisciplineJitter();
        private double _attackBudget = 1.0; // [CORE-005] aggression pacing credit (first strike always goes out)
        private readonly UtilityAction[] _utilityActions;
        private readonly GoapAction[] _goapActions;

        public StuntBrainKernel(UtilityAction[] customUtilityActions = null, GoapAction[] customGoapActions = null)
        {
            _utilityActions = customUtilityActions ?? DefaultUtilityActions();
            _goapActions = customGoapActions ?? DefaultGoapActions();
        }

        public void CyclePresentationMode()
        {
            ActiveMode = (PresentationMode)(((int)ActiveMode + 1) % 3);
        }

        public void CycleAutonomyMode()
        {
            ActiveAutonomy = (AutonomyMode)(((int)ActiveAutonomy + 1) % 5);
        }

        public StuntDecision Tick(
            EntitySnapshot self,
            IList<EntitySnapshot> hostiles,
            BehaviorProfile profile,
            PresentationMode presentation = PresentationMode.Tactical,
            AutonomyMode autonomy = AutonomyMode.FullCombat,
            Vec3? waypointOrLootPos = null)
        {
            StuntDecision d = TickBehaviors(self, hostiles, profile, presentation, AutonomyPresets.Of(autonomy), waypointOrLootPos);
            d.AutonomyMode = autonomy;
            return d;
        }

        public StuntDecision TickBehaviors(
            EntitySnapshot self,
            IList<EntitySnapshot> hostiles,
            BehaviorProfile profile,
            PresentationMode presentation,
            Behaviors behaviors,
            Vec3? waypointOrLootPos = null)
        {
            // 1. Layer 2 — blackboard + influence map
            Blackboard.PresentationMode = presentation;
            Blackboard.Refresh(self, hostiles, profile);

            // [FLAGS] resolve behaviors (identical block in every port)
            bool hasEnemy = Blackboard.Hostiles.Count > 0;
            bool fCombat = (behaviors & Behaviors.Combat) != 0;
            bool fDefensive = (behaviors & Behaviors.Defensive) != 0;
            bool assistActive = (behaviors & Behaviors.Assist) != 0 && !(fCombat && hasEnemy);
            bool cruiseActive = (behaviors & Behaviors.Cruise) != 0 && !hasEnemy;
            bool inactive = !(fCombat || fDefensive || assistActive || cruiseActive);

            // 2. Layer 4 — stance & high-level goal
            TacticalStance stance = fDefensive
                ? TacticalStance.Defensive
                : EvaluateStance();
            Blackboard.Stance = stance;
            WorldState goalState = SelectGoalForStance(stance);

            // 3. Layer 3A — compensated utility + deterministic jitter
            UtilityAction bestUtility = _utilityActions[0];
            double bestScore = -1.0;
            _jitter.Reset();
            for (int i = 0; i < _utilityActions.Length; i++)
            {
                UtilityAction ua = _utilityActions[i];
                if (fDefensive &&
                    (ua.Id == "STRIKE_COMBO" || ua.Id == "EXECUTE_FINISHER"))
                {
                    continue; // DEFENSIVE never attacks
                }
                double jittered = ua.Score(Blackboard) + _jitter.Next(profile.Discipline);
                double s = StuntMath.Clamp01(jittered);
                if (s > bestScore)
                {
                    bestScore = s;
                    bestUtility = ua;
                }
            }

            // 4. Layer 3B — regressive A* plan
            WorldState worldState = Blackboard.ToWorldState();
            List<GoapAction> rawPlan = Planner.Plan(worldState, goalState, _goapActions, Blackboard);
            string[] goapPlanNames = new string[rawPlan == null ? 0 : rawPlan.Count];
            for (int i = 0; i < goapPlanNames.Length; i++) goapPlanNames[i] = rawPlan[i].Name;

            // Autonomy-mode command & human-input interception policy
            string immediateCommand = bestScore > 0.78 + 0.4 * (0.78 - profile.Aggression) // [CORE-003] continuous commit threshold
                ? bestUtility.Id
                : (goapPlanNames.Length > 0 ? goapPlanNames[0] : bestUtility.Id);
            bool interceptHumanInput = true;

            if (inactive)
            {
                // [FLAGS] no active behavior: human input passes, Stuntdouble does nothing
                interceptHumanInput = false;
                immediateCommand = "HUMAN_PASS_THROUGH";
            }
            else if (cruiseActive)
            {
                immediateCommand = waypointOrLootPos.HasValue ? "CRUISE_OR_LOOT" : "IDLE_SCAN";
            }
            else if (assistActive)
            {
                bool isUrgentReflex =
                    (bestUtility.Id == "DEFLECT_COUNTER" || bestUtility.Id == "EVADE_REPOSITION") &&
                    bestScore >= 0.75;
                interceptHumanInput = isUrgentReflex || self.HealthRatio < 0.25;
                if (!interceptHumanInput) immediateCommand = "HUMAN_PASS_THROUGH";
            }

            // [CORE-005] crowd: fight from the least-covered side, punish in the gaps
            bool crowd = !inactive && !cruiseActive && !assistActive && !fDefensive &&
                         stance == TacticalStance.Defensive && Blackboard.PressureHigh;
            EntitySnapshot? counterTarget = null;
            if (crowd && Blackboard.ImminentThreat == null && self.HealthRatio >= 0.4 && immediateCommand != "TACTICAL_HEAL")
            {
                double cd = double.PositiveInfinity;
                for (int i = 0; i < Blackboard.Hostiles.Count; i++)
                {
                    EntitySnapshot h = Blackboard.Hostiles[i];
                    if (h.IsRanged) continue;
                    double hx = h.Position.X - self.Position.X;
                    double hz = h.Position.Z - self.Position.Z;
                    double d = Math.Sqrt(hx * hx + hz * hz);
                    if (d <= 2.6 && d < cd) { cd = d; counterTarget = h; }
                }
                if (counterTarget != null && immediateCommand != "STRIKE_COMBO" && immediateCommand != "HEAVY_ASSAULT" && immediateCommand != "EXECUTE_FINISHER")
                {
                    immediateCommand = "STRIKE_COMBO";
                }
            }

            // [CORE-003] continuous aggression: stamina reserve = (1 - aggression) * 0.6
            if (!inactive && !cruiseActive && !assistActive && Blackboard.ImminentThreat == null &&
                (immediateCommand == "STRIKE_COMBO" || immediateCommand == "HEAVY_ASSAULT") &&
                self.StaminaRatio < (1.0 - profile.Aggression) * 0.9)
            {
                immediateCommand = "CLOSE_DISTANCE";
            }

            // [CORE-005] aggression pacing: a share `aggression` of strike requests goes out (credit accumulator)
            if (!inactive && !cruiseActive && !assistActive && Blackboard.ImminentThreat == null &&
                (immediateCommand == "STRIKE_COMBO" || immediateCommand == "HEAVY_ASSAULT"))
            {
                _attackBudget += profile.Aggression;
                if (_attackBudget >= 1.0) _attackBudget -= 1.0;
                else immediateCommand = "CLOSE_DISTANCE";
            }

            // [CORE-003] critical health and nothing about to land in melee: heal beats fleeing
            if (!inactive && !cruiseActive && !assistActive && Blackboard.ImminentThreat == null &&
                self.HealthRatio < 0.3 && goapPlanNames.Length > 0 && goapPlanNames[0] == "TACTICAL_HEAL")
            {
                immediateCommand = "TACTICAL_HEAL";
            }

            // [CORE-003] ranged threat: lateral sidestep, dodge timed to the projectile (impact within 0.4 s)
            EntitySnapshot? rt = Blackboard.RangedThreat;
            bool rangedReflex = !inactive && rt != null && Blackboard.ImminentThreat == null && immediateCommand != "TACTICAL_HEAL";
            if (rangedReflex)
            {
                double eta = rt.Value.ProjectileEta;
                bool dodgeNow = eta > 0.0 && eta <= 0.4;
                if (dodgeNow) immediateCommand = "EVADE_REPOSITION";
                if (dodgeNow || !assistActive) interceptHumanInput = true;
            }

            // 5. Layer 1 — context steering synthesis
            Vec3 navTarget = self.Position;
            if (cruiseActive && waypointOrLootPos.HasValue)
            {
                navTarget = waypointOrLootPos.Value;
            }
            else if (crowd)
            {
                EntitySnapshot? focus = counterTarget ?? Blackboard.PrimaryTarget;
                Vec3? focusPos = focus.HasValue ? focus.Value.Position : (Vec3?)null;
                navTarget = Blackboard.InfluenceMap.FindLocalPocket(self.Position, Blackboard.Hostiles, focusPos, 2.5);
            }
            else if (stance == TacticalStance.Evasive || stance == TacticalStance.Defensive)
            {
                navTarget = Blackboard.InfluenceMap.FindSafestPocket(self.Position);
            }
            else if (Blackboard.PrimaryTarget != null)
            {
                navTarget = Blackboard.PrimaryTarget.Value.Position;
            }

            List<Hazard> hazards = new List<Hazard>(Blackboard.Hostiles.Count);
            for (int i = 0; i < Blackboard.Hostiles.Count; i++)
            {
                EntitySnapshot h = Blackboard.Hostiles[i];
                hazards.Add(new Hazard(
                    h.Position,
                    h.IsWindUp ? 4.2 : 2.5,
                    h.ThreatWeight * (h.IsWindUp ? 1.8 : 1.0)));
            }

            double prefRange = (cruiseActive || crowd) ? 0.5 : profile.PreferredRange;

            double speedMultiplier;
            Vec3 direction = Steering.ComputeMoveVector(self.Position, navTarget, prefRange, hazards, out speedMultiplier);
            if (inactive)
            {
                // [FLAGS] idle: no steering output
                direction = new Vec3(0.0, 0.0, 0.0);
                speedMultiplier = 0.0;
            }
            else if (rangedReflex)
            {
                double ux = rt.Value.Position.X - self.Position.X;
                double uz = rt.Value.Position.Z - self.Position.Z;
                double ul = Math.Sqrt(ux * ux + uz * uz);
                if (ul > 1e-6) { ux /= ul; uz /= ul; } else { ux = 0.0; uz = 0.0; }
                double lx = -uz;
                double lz = ux;
                double side = self.Velocity.X * lx + self.Velocity.Z * lz >= 0.0 ? 1.0 : -1.0;
                double mx = side * lx + (1.0 + profile.Aggression * 0.6) * ux;
                double mz = side * lz + (1.0 + profile.Aggression * 0.6) * uz;
                double ml = Math.Sqrt(mx * mx + mz * mz);
                if (ml > 1e-9) { mx /= ml; mz /= ml; } else { mx = 0.0; mz = 0.0; }
                direction = new Vec3(mx, 0.0, mz);
                speedMultiplier = 1.0;
            }

            // 6. Layer 4 — presentation director
            CameraDirective camera = ComputeCameraDirective(presentation, immediateCommand, profile);

            return new StuntDecision
            {
                AutonomyMode = AutonomyMode.FullCombat,
                Behaviors = behaviors,
                Stance = stance,
                InterceptHumanInput = interceptHumanInput,
                SelectedUtilityAction = bestUtility.Id,
                UtilityScore = StuntMath.Quantize(bestScore, 4),
                GoapPlan = goapPlanNames,
                ImmediateCommand = immediateCommand,
                SteeringDirection = direction,
                SpeedMultiplier = StuntMath.Quantize(speedMultiplier, 3),
                Camera = camera
            };
        }

        private TacticalStance EvaluateStance()
        {
            TacticalBlackboard bb = Blackboard;
            if (bb.Hostiles.Count == 0) return TacticalStance.Stealth;
            if (bb.Self.HealthRatio < 0.28) return TacticalStance.Evasive;
            if (bb.ImminentThreat != null || bb.PressureHigh) return TacticalStance.Defensive;
            if (bb.Profile.Aggression >= 0.65 && bb.Self.StaminaRatio > 0.35) return TacticalStance.Aggressive;
            return TacticalStance.Balanced;
        }

        private static WorldState SelectGoalForStance(TacticalStance stance)
        {
            WorldState goal = new WorldState();
            switch (stance)
            {
                case TacticalStance.Evasive:
                    goal["survived"] = true;
                    break;
                case TacticalStance.Defensive:
                    goal["threatNeutralized"] = true;
                    break;
                case TacticalStance.Aggressive:
                case TacticalStance.Balanced:
                    goal["enemyEliminated"] = true;
                    break;
                default:
                    goal["threatNeutralized"] = true;
                    break;
            }
            return goal;
        }

        private CameraDirective ComputeCameraDirective(
            PresentationMode mode,
            string command,
            BehaviorProfile profile)
        {
            string targetId = Blackboard.PrimaryTarget != null ? Blackboard.PrimaryTarget.Value.Id : null;

            if (mode == PresentationMode.Tactical)
            {
                return new CameraDirective
                {
                    Mode = "PASSIVE",
                    TimeScale = 1.0,
                    FovMultiplier = 1.0,
                    FocusTargetId = targetId
                };
            }

            if (mode == PresentationMode.CinematicResolve)
            {
                return new CameraDirective
                {
                    Mode = "FINISH_CUT",
                    TimeScale = 1.75,
                    FovMultiplier = 0.82,
                    FocusTargetId = targetId
                };
            }

            if (command == "EXECUTE_FINISHER" || command == "DEFLECT_COUNTER")
            {
                return new CameraDirective
                {
                    Mode = "IMPACT_SLOWMO",
                    TimeScale = profile.CinematicFlair > 0.5 ? 0.35 : 0.65,
                    FovMultiplier = 0.85,
                    FocusTargetId = targetId
                };
            }

            return new CameraDirective
            {
                Mode = "ACTION_TRACK",
                TimeScale = 1.0,
                FovMultiplier = 0.92,
                FocusTargetId = targetId
            };
        }

        public static UtilityAction[] DefaultUtilityActions()
        {
            return new[]
            {
                new UtilityAction("DEFLECT_COUNTER",
                    new Consideration("ImminentStrike",
                        bb => bb.ImminentThreat != null ? 1.0 : 0.0,
                        Curves.Linear),
                    new Consideration("ProtagonistFlair",
                        bb => bb.Profile.CinematicFlair * 0.5 + 0.5,
                        Curves.Linear)),

                new UtilityAction("EXECUTE_FINISHER",
                    new Consideration("TargetNearDeath",
                        bb => bb.PrimaryTarget != null ? 1.0 - bb.PrimaryTarget.Value.HealthRatio : 0.0,
                        x => Curves.Logistic(x)),
                    new Consideration("CloseProximity",
                        bb => bb.PrimaryTarget == null ? 0.0 : Math.Max(0.0, 1.0 - bb.TargetDistance() / 3.5),
                        x => Curves.Quadratic(x))),

                new UtilityAction("EVADE_REPOSITION",
                    new Consideration("LowHealthUrgency",
                        bb => 1.0 - bb.Self.HealthRatio,
                        x => Curves.Logistic(x, 12.0, 0.65)),
                    new Consideration("HighCrowdPressure",
                        bb => bb.PressureIndex,
                        Curves.Linear)),

                new UtilityAction("STRIKE_COMBO",
                    new Consideration("StaminaAvailable",
                        bb => bb.Self.StaminaRatio,
                        Curves.Linear),
                    new Consideration("AggressionDrive",
                        bb => bb.Profile.Aggression,
                        Curves.Linear)),
            };
        }

        public static GoapAction[] DefaultGoapActions()
        {
            return new[]
            {
                new GoapAction("CLOSE_DISTANCE",
                    Pre(("hasHostiles", true)),
                    Eff(("inMeleeRange", true), ("inPreferredRange", true)),
                    1.0),
                new GoapAction("DEFLECT_COUNTER",
                    Pre(("underImminentAttack", true)),
                    Eff(("underImminentAttack", false), ("threatNeutralized", true), ("targetVulnerable", true)),
                    0.6),
                new GoapAction("HEAVY_ASSAULT",
                    Pre(("inMeleeRange", true), ("staminaSufficient", true)),
                    Eff(("targetVulnerable", true)),
                    1.1),
                new GoapAction("EXECUTE_FINISHER",
                    Pre(("inMeleeRange", true), ("targetVulnerable", true)),
                    Eff(("enemyEliminated", true), ("threatNeutralized", true)),
                    0.4),
                new GoapAction("TACTICAL_HEAL",
                    Pre(("healthCritical", true)),
                    Eff(("healthCritical", false), ("survived", true)),
                    0.8),
                new GoapAction("EVADE_TO_COVER",
                    Pre(("underImminentAttack", true)),
                    Eff(("underImminentAttack", false), ("survived", true), ("threatNeutralized", true)),
                    0.9),
            };
        }

        private static WorldState Pre(params (string Key, bool Value)[] pairs)
        {
            WorldState ws = new WorldState();
            for (int i = 0; i < pairs.Length; i++) ws[pairs[i].Key] = pairs[i].Value;
            return ws;
        }

        private static WorldState Eff(params (string Key, bool Value)[] pairs)
        {
            return Pre(pairs);
        }
    }
}
