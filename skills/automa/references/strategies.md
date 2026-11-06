# AUTOMA Strategy Ladder (S1 → S5)

Select the highest-fidelity strategy supported by the target binary's architecture and document in `targets/<game>/REPORT.md` why any simpler tier was insufficient.

---

## S1 — Hybrid Native Brain Grafting + AUTOMA Utility Override
Bind the player entity to the game's existing companion or elite NPC locomotion/animation subsystem (`Seam.NpcAI`), while overriding target selection and action scoring via `AutomaBrain`.
- **When to use:** Games where player and NPC inherit from a unified `Character` or `Agent` base class and share animation montages.
- **Mandatory fixes over naive bot takeover:**
  1. Override faction/aggro tables so enemies continue targeting the player and allies do not turn hostile.
  2. Replace the NPC's static cooldown/ability gate with AUTOMA's `CompensatedUtility` scorer so the agent uses the player's actual equipped skills and consumables.
  3. Wire `Seam.Camera` so the player camera remains smoothly anchored or follows `CameraDirective`.

## S2 — Dormant Engine Autoplay / Spectator Augmentation
Unlock built-in developer autoplay, AI director takeover, or post-death spectator routines discovered via REA string/command-table inspection, and connect AUTOMA's Orchestrator to govern stance and presentation mode.

## S3 — Native AUTOMA Cognitive Kernel Injection (Recommended Standard)
Embed the matching shared package (`automa-brain-cs`, `automa-brain-cpp`, or `automa-brain-lua`) directly inside the mod loader (`BepInEx`, `MelonLoader`, `UE4SS`, `CET`, or DLL proxy).
- **Per-Tick Execution:**
  1. Read `EntitySnapshot` structs from `Seam.Perception` (health, stamina, positions, and `isWindUp` enemy attack telegraphs).
  2. Call `AutomaBrain.Tick(self, hostiles, profile)`.
  3. Dispatch `ImmediateCommand` and `SteeringDirection` directly into `Seam.Input` internal motor functions (never raw OS keystrokes when internal command handlers are hookable).
  4. Apply `CameraDirective` (`PASSIVE`, `ACTION_TRACK`, `IMPACT_SLOWMO`, or `FINISH_CUT`) to `Seam.Camera`.

## S4 — Out-of-Process Memory Telemetry + Synthetic Controller Bridge
Run `automa-brain-ts` in an external Node.js process reading `Seam.Perception` via read-only process memory and emitting virtual gamepad/input commands. Use only when in-process hooking is unstable.

## S5 — Choreographed Narrative Resolve (`CINEMATIC_RESOLVE`)
When the user selects `CINEMATIC_RESOLVE` (or when real-time combat hooking is infeasible), intercept encounter start (`Seam.Encounter`), trigger a choreographed finisher camera angle (`FINISH_CUT`), and invoke the engine's native encounter-victory callbacks so quest flags, XP rewards, and story triggers advance without soft-locking.
