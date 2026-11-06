# Cognitive Architecture & Profile Tuning Guide

AUTOMA forbids flat `if/else` combat scripts and naive "attack-nearest" bots. Every target integration must configure and drive the shared 4-Layer Brain (`@automa/brain`).

## 1. The Four Mandatory Layers

1. **Layer 4 — Orchestrator (`TacticalStance` & `CameraDirective`):**
   - Evaluates global crowd pressure, player health/stamina, and the active `BehaviorProfile` (`schemas/profile.schema.json`).
   - Transitions cleanly between `AGGRESSIVE`, `BALANCED`, `DEFENSIVE`, `EVASIVE`, and `STEALTH`.
   - Governs the **Tri-Modal Presentation Director** (`TACTICAL`, `CINEMATIC_LIVE`, `CINEMATIC_RESOLVE`).
2. **Layer 3 — Regressive A* GOAP + Compensated Utility AI:**
   - **Compensated Utility AI** scores immediate reflex maneuvers (`DEFLECT_COUNTER`, `EXECUTE_FINISHER`, `EVADE_REPOSITION`) using Dave Mark's Makeup Value Compensation $\mu = 1 - \frac{1}{n}$.
   - **Regressive A* GOAP** synthesizes multi-step combat chains from desired goal states back to present world conditions.
3. **Layer 2 — Tactical Blackboard & 2D Spatial Influence Map:**
   - Tracks enemy attack wind-ups (`isWindUp`) so parries and dodges happen *before* impact, not after taking damage.
   - Computes a local threat grid to locate safe repositioning pockets during `DEFENSIVE` and `EVASIVE` stances.
4. **Layer 1 — 16-Slot Context Steering:**
   - Synthesizes radial `Interest` and `Danger` maps across 16 directions on the XZ plane, guaranteeing smooth strafing, kiting, and obstacle avoidance without jitter.

## 2. Deriving This Game's Profile (No Fixed Taxonomy)

The profile is **terzi işi (tailor-made)**, authored per target game. There is no closed list of playstyles: `archetype` is a free-form label, and the numbers must be **derived from what the protagonist actually does**, not chosen from a menu.

Derive the five parameters from REA evidence instead of guessing:

| Parameter | Evidence to extract | How it changes behaviour |
|---|---|---|
| `preferredRange` | Weapon reach and the distance the protagonist's own attack animations are authored for | Sets the Layer 1 interest ring; the agent orbits this distance |
| `aggression` | Ratio of committed attacks vs. repositioning in the protagonist's animation set / combat state machine | Higher values bias `STRIKE_COMBO` and gap closing over spacing |
| `discipline` | Parry window length (`Seam.Input`) and input buffer tolerance | Higher values shrink the deterministic jitter, giving cleaner repetitions |
| `cinematicFlair` | Presence of counters, finishers, execution states, or hit-stop hooks | Raises `DEFLECT_COUNTER` / `EXECUTE_FINISHER` priority |
| `reactionDelayMs` | Motor latency implied by the protagonist's dodge/parry commitment frames | Simulated hesitation before a motor intent is dispatched |

`schemas/profiles.json` holds five **optional starting templates**. Fork one if it is close, then re-tune every number against evidence and rename the label to match the game (e.g. `SPARTAN_MISTHIOS`). Copy-pasting a preset without re-tuning is a specification failure, and a target whose profile is still byte-identical to a preset must be flagged in its `REPORT.md`.

Record *why* each number was chosen in the optional `evidence` array of `profile.json`, then validate:

```bash
node scripts/validate-profiles.mjs <game-slug>
```

## 3. Adapting to the Player's Live Build

At toggle time (`F5`) and whenever equipment changes, inspect the player's equipped weapon class, unlocked active skills, and quick-slot consumables via `Seam.Perception`, and map them to the GOAP/Utility action descriptors. Never hardcode an ability the player has not unlocked.

