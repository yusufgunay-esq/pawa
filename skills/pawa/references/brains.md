# Cognitive Architecture & Persona Tuning Guide

PAWA forbids flat `if/else` combat scripts and naive "attack-nearest" bots. Every target integration must configure and drive the shared 4-Layer Brain (`@pawa/brain`).

## 1. The Four Mandatory Layers

1. **Layer 4 — Orchestrator (`TacticalStance` & `CameraDirective`):**
   - Evaluates global crowd pressure, player health/stamina, and the active `PersonaProfile` (`schemas/archetypes.json`).
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

## 2. Adapting to the Player's Live Build

At toggle time (`F5`) and whenever equipment changes, inspect the player's equipped weapon class, unlocked active skills, and quick-slot consumables via `Seam.Perception`, and map them to the GOAP/Utility action descriptors. Never hardcode an ability the player has not unlocked.
