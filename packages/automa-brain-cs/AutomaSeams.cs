// AUTOMA seam contract, C# mirror of packages/automa-seams-ts/src/index.ts
// Copyright (c) 2026 Yusuf Gunay. Licensed under MPL-2.0.
//
// A game adapter (BepInEx / MelonLoader / UE4SS-side C#) implements these interfaces and calls
// AutomaBrain.TickBehaviors itself, following the AutomaRuntime rules of the TS reference:
//   1. disarmed -> OFF; cutscene/menu/loading -> LOCKED; ManualOverride -> MANUAL
//      (inert states never call Command/Steer; at most one Release when AUTOMA was holding)
//   2. Engage.OnCombat (default): take over when a hostile is perceived, hand back after
//      HandbackSeconds (default 2) without hostiles; behaviors containing Cruise stay engaged
//   3. decision.InterceptHumanInput == false -> PASS_THROUGH (release, do not write)
//   4. NativeAi (optional) is the base layer; override it only on reflex commands
//      (DEFLECT_COUNTER / EVADE_* / TACTICAL_HEAL), low health, or offense under DEFENSIVE; log the reason
// The arena (packages/automa-arena) gates this behavior on the TS runtime.
namespace Automa.Brain
{
    /// <summary>Read side. Cheap, side-effect free.</summary>
    public interface IPerceptionSeam
    {
        EntitySnapshot Self();
        EntitySnapshot[] Hostiles();
        /// <summary>Navigation or loot target; false when there is none.</summary>
        bool TryGetWaypoint(out Vec3 waypoint);
    }

    /// <summary>Write side: the only way AUTOMA touches the game's controls.</summary>
    public interface IInputSeam
    {
        void Command(string id);
        /// <summary>direction is unit length or zero, speed in [0,1].</summary>
        void Steer(Vec3 direction, double speed);
        /// <summary>Neutralise every control AUTOMA holds and hand them back to the human.</summary>
        void Release();
    }

    /// <summary>Any true value means AUTOMA must not drive the game.</summary>
    public interface IInterlockSeam
    {
        bool Cutscene();
        bool Menu();
        bool Loading();
        bool ManualOverride();
    }

    public enum Engage { OnCombat = 0, Manual = 1 }

    /// <summary>Optional: the game's own AI for the controlled character (base layer).</summary>
    public interface INativeAiSeam
    {
        bool Available();
        /// <summary>Native command id, or null. steerDirection may be null to keep the brain's steering.</summary>
        string ProposeCommand(out Vec3? steerDirection, out double steerSpeed);
    }
}
