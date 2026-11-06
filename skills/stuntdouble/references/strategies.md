# Stuntdouble Strategy Ladder (S1 → S5)

Order of preference: **the game's own AI is the foundation; Stuntdouble is a competence layer on top; Stuntdouble alone only when the native AI is unreachable.** Document in `targets/<game>/REPORT.md` why a higher tier was not possible.

---

## S1 — Native AI as base + Stuntdouble competence layer (preferred)
Bind the player entity to the game's companion or elite NPC brain (`Seam.NpcAI` / `NativeAiSeam`): animations and mechanics are already correct. The native AI was written to lose, so `StuntRuntime` overrides only its weak moments and records the reason of every override: parry/dodge on a wind-up, retreat/heal at low health, no offense under `DEFENSIVE`, target choice, oscillation damping.
- **When to use:** player and NPC share a `Character`/`Agent` base and animation montages.
- **Mandatory fixes over naive bot takeover:**
  1. Faction/aggro tables so enemies keep targeting the player and allies do not turn hostile.
  2. Replace the NPC's static cooldown/ability gate with the Utility scorer so the player's equipped skills and consumables are used.
  3. Keep the player camera anchored (or follow `CameraDirective` if `Ext.Camera` is enabled).
- **Proof in the arena:** scenario `native_overlay` (native AI + layer must beat the same native AI alone).

## S2 — Dormant engine autoplay / developer bot + Stuntdouble competence layer
Unlock built-in autoplay, AI director takeover or spectator routines found via REA string/command-table inspection; use them as the native base of S1 and let Stuntdouble govern stance and weak moments.

## S3 — Stuntdouble brain drives alone, in-process (when native AI is unreachable)
Embed `stuntdouble-brain-cs/-cpp/-lua` in the mod loader (`BepInEx`, `MelonLoader`, `UE4SS`, `CET`, DLL proxy). Per tick: read `EntitySnapshot`s from `Seam.Perception`, call `StuntBrain.TickBehaviors`, dispatch `ImmediateCommand` and steering into `Seam.Input` internal handlers (never raw OS keystrokes when internal handlers are hookable).

## S4 — Stuntdouble brain drives alone, external bridge
Run `stuntdouble-brain-ts` out-of-process, read `Seam.Perception` via read-only memory, emit virtual-controller commands. The only option behind VMProtect-style protection when in-process hooking is not acceptable (see `targets/assassins-creed-odyssey/REPORT.md`). If anti-cheat or Denuvo-class traces make even this unsafe, stop (see `targets/ghost-recon-breakpoint/REPORT.md`, ABORT).

## S5 — Story-first shortcut: choreographed resolve (`CINEMATIC_RESOLVE`)
Intercept encounter start (`Seam.Encounter`), optionally play a finisher camera cut, and call the engine's native encounter-victory callbacks so quest flags, XP and story triggers advance without soft-locking. Optional extension, only when asked.
