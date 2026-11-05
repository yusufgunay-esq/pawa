---
name: autopilot-anything
description: Give a single-player game an autopilot. Reverse engineer the game with REA, find how the player and the enemy AI are driven, then build a mod with a hotkey that lets an AI play the player character (or auto-resolve combat with a cinematic). Use when the user says "make X play itself", "add autopilot/auto-combat/auto-battle to <game>", "skip the fights", "let me watch instead of play", or names a game and asks for an AI takeover.
metadata:
  version: "0"
---

# Autopilot Anything

Goal: one hotkey, and an AI plays the player character. The user does nothing else.
Two product modes, same machinery:

- **Takeover**: the AI fights, moves and uses abilities as the player until the hotkey is pressed again.
- **Skip Combat**: when an encounter starts, the user can press one key and watch a short cinematic while the encounter resolves in the player's favour (the "James Bond does not lose a shootout" mode).

Success is what the player sees: no stutter at the hand-over, no frozen camera, no half-working state. Press key, game plays on, press key, control returns.

## Hard limits (stop and tell the user)

- Single-player or offline only. Never touch a game with online competitive play, kernel anti-cheat (EAC, BattlEye, Vanguard) or ranked modes. Do not try to bypass them.
- Never commit or ship game files, assets or full decompiled source. Ship only the mod code, patches and notes.
- Work on a copy or use the loader's own mod folder; keep a one-step restore of every changed file.

## Workflow

Keep a `targets/<game>/REPORT.md` (copy `targets/_template`). Tick each phase with evidence (log line, screenshot, measured value).

1. **Fingerprint.** Engine, language, mod loader options, anti-cheat. Use REA (`binary_overview`, `inspect_managed_artifact`, `inspect_electron_fuses`, etc.). Read `references/engines.md` for the loader that fits.
2. **Find the seams.** Locate, with REA static and runtime evidence: (a) the player controller and its input read, (b) the enemy/companion AI entry point, (c) combat state (in-combat flag, target list, health, abilities), (d) encounter start and end events. Write the addresses or symbols into the report.
3. **Pick the cheapest strategy** from `references/strategies.md` (ladder S1 to S5). Say why the cheaper ones do not work before moving down.
4. **Build the mod** in the engine's native loader. Required parts: hotkey toggle, on-screen indicator (small, quiet), clean hand-over both ways, auto-off on death, loading screens, cutscenes and menus.
5. **Verify by running the game.** Walk these flows and record evidence: toggle on in the open world, toggle on mid-fight, toggle off mid-fight, loading screen while on, death while on, cutscene while on. A mod that compiles is not done.
6. **Quality of play.** Watch the AI for five minutes. If it stands still, runs into walls, wastes consumables or ignores the player's build, it is not done. Tune with `references/brains.md`.
7. **Package.** README with install, uninstall, hotkey, known limits. Report which strategy was used and what failed first.

## Principles

- Reuse the game's own AI before writing one. A rewritten brain must still respect the player's build (weapons, skills, consumables), not just "attack nearest".
- The player entity is not an enemy. Perception, faction and aggro must be adjusted so the AI neither targets itself nor loses allies.
- Prefer the game's own command path (the same function the input system calls) over fake key presses. Fake input is the fallback.
- Every game gets its own recipe in `targets/`. Add what you learned so the next person starts further ahead.
