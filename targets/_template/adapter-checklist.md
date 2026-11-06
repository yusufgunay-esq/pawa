# Adapter checklist (seam -> arena gate)

Implement the seams from `packages/stuntdouble-seams-ts` (C#: `packages/stuntdouble-brain-cs/StuntSeams.cs`) and tick each line. The arena (`node packages/stuntdouble-arena/run.mjs`) proves the contract in a simulator; the live column is what you must still check in the real game.

| Seam / rule | What the adapter must do | Arena gate that proves the contract | Live check in the game |
|---|---|---|---|
| `PerceptionSeam.self/hostiles` | Fill `EntitySnapshot` incl. `isWindUp` (enemy telegraph) and health/stamina ratios | `avoid` (telegraphed strikes avoided) in duel, surround3, archer_melee, boss_defensive | Wind-up flag flips before the strike lands |
| `PerceptionSeam.waypoint` | Current road/loot target or undefined | `waypoints` in cruise_ambush | Agent reaches the real waypoint |
| `InputSeam.command/steer` | Map brain ids (`STRIKE_COMBO`, `HEAVY_ASSAULT`, `EXECUTE_FINISHER`, `DEFLECT_COUNTER`, `EVADE_*`, `TACTICAL_HEAL`) and steering to internal handlers | `noOffense` (boss_defensive), `steerStable` (all) | Parry/dodge actually fire; no jitter |
| `InputSeam.release` | Neutralise held controls, hand back to the human | `lockedInput` (same-tick hand-back) in interlock | Stick/keys feel normal right after |
| `InterlockSeam.cutscene/menu/loading` | True while the game shows them | `lockedInput` (0 commands while locked) in interlock | No input injected during cutscenes/menus/loading |
| `InterlockSeam.manualOverride` | True when the human touches the controls | `lockedInput` / `manualHandbackOk` in interlock | Control returns at once |
| `engage: 'onCombat'` | Default hand-over on first hostile, hand-back ~2 s after | `autoEngage` in ambush_oncombat | Takeover and return feel right |
| `engage: 'manual'` + `toggleKey` | Bind a user-chosen key to `toggle()` | runtime unit test (`manual engage`) | Key toggles cleanly |
| `NativeAiSeam` (if S1/S2) | `available()`, `proposeCommand()` from the game's own AI | `beatsNative` in native_overlay | Overrides are logged with reasons |
| Behaviors / profile | Pass mask or preset name and the 5-knob profile | profile-effect test in arena.test.ts | Aggression change is visible |

Known contract limit: a ranged wind-up beyond 4.5 m is outside the brain's imminence radius (arena reports `unreactableHit`).
