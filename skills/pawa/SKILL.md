---
name: pawa
description: Persona-Aligned World Autonomy (PAWA). Reverse engineer any single-player game with REA, discover its controller/AI/camera seams, and inject a 4-layer autonomous protagonist brain (Orchestrator, Regressive A* GOAP, Compensated Utility AI, 16-Slot Context Steering) with user-selectable Tactical, Cinematic Live, and Cinematic Resolve presentation modes. Trigger when the user says "PAWA this game", "şu oyuna PAWA yap", "add autopilot/auto-combat to <game>", or wants their character to fight autonomously like the protagonist.
metadata:
  version: "1.0.0"
---

# PAWA — Persona-Aligned World Autonomy

PAWA transforms any single-player game into an autonomous, narrative-consistent experience. With a single hotkey (`F5`), the player character is handed over to a **Persona-Aligned Proxy Agent** that fights, dodges, parries, and executes abilities in real time with the competence expected of the story's protagonist—while keeping the game's native camera and flow completely intact (like *Left 4 Dead 2* or *Warband* `F5`, but powered by a genuine 4-layer tactical brain instead of a naive bot).

---

## 1. Core vs. Optional Extensions

PAWA strictly separates **Core Gameplay Autonomy** (mandatory for every target) from **Optional Aesthetic Extensions** (camera, music, fast-resolve, which are added only if requested later):

### Core Mode (Default & Mandatory)
- **`TACTICAL` (Native Live Combat):** Press `F5` and the 4-Layer PAWA Brain (`packages/pawa-brain-*`) takes control of the player character directly in the live game world. The native player camera stays untouched; the user can watch the fight unfold naturally or take back control at any instant.

### Optional Post-Core Extensions (Phase 2 — Only When Requested)
Once core combat autonomy works flawlessly, a target may optionally wire secondary extensions (`F6`):
- **Extension A (`Ext.Camera` — Dynamic Action Camera):** Subtle FOV framing and hit-stop slow-motion on parries/finishers (`CINEMATIC_LIVE`).
- **Extension B (`Ext.Audio` — Reactive Combat Music / Stingers):** Dynamic intensity layers or protagonist theme stingers triggered when autonomy engages or high-utility finishers land.
- **Extension C (`Ext.Resolve` — Fast Encounter Resolve):** Choreographed transition that fires native encounter-victory hooks (`CINEMATIC_RESOLVE`).

---

## 2. Hard Scope & Ethics Boundaries

1. **Single-Player & Offline Only:** Immediately abort and inform the user if the target binary links active online competitive matchmaking or kernel-mode anti-cheat drivers (`EasyAntiCheat`, `BattlEye`, `Vanguard`, `RICOCHET`). Never attempt to bypass anti-cheat or DRM.
2. **Clean-Room Repository Hygiene:** Never commit game executables, proprietary assets, `.pak` archives, or raw decompiled dumps into `targets/<game>/`. Only commit the thin adapter code, hook definitions, `persona.json`, and `REPORT.md`.
3. **Reversible Injection:** Always deploy via non-destructive mod loaders (BepInEx, MelonLoader, UE4SS, Cyber Engine Tweaks, or drop-in DLL proxy) with one-step removal.

---

## 3. End-to-End PAWA Engineering Workflow

When asked to **"PAWA `<game>`"**, execute these stages in order and record every symbol/address in `targets/<game>/REPORT.md`:

### Stage 1: Binary & Engine Reconnaissance (via REA)
1. Identify the engine and runtime (`Unity Mono`, `Unity IL2CPP`, `Unreal Engine 4/5`, `AnvilNext`, `REDengine`, `Source`, or custom C++) using REA (`open_binary`, `binary_overview`, `inspect_managed_artifact`).
2. Consult [references/engines.md](references/engines.md) to select the appropriate non-destructive loader and matching PAWA Brain package (`pawa-brain-cs`, `pawa-brain-cpp`, `pawa-brain-lua`, or `pawa-brain-ts`).

### Stage 2: Three Core Seams Extraction
Using REA static cross-references (`xrefs`, `search_strings`, `procedure_pseudo_code`) and runtime observation, locate the **Three Core Seams** required for live autonomous combat:
1. **Player Controller & Input Poll (`Seam.Input` — Core):** Where hardware inputs are read or translated into motor intents (`Move`, `LightAttack`, `HeavyAttack`, `Parry`, `Dodge`, `UseAbility`).
2. **Perceptual World State (`Seam.Perception` — Core):** Entity list iteration, health/stamina ratios, enemy attack telegraphing (`isWindUp` / animation montage flags), and faction/aggro tables.
3. **NPC / Companion Brain Entry (`Seam.NpcAI` — Core):** Existing Behavior Tree, Utility evaluator, or combat state machine used by elite NPCs or companions (for Strategy S1/S2).

*(Optional Phase 2 Seams — only locate if the user explicitly asks for camera, music, or skip extensions: `Ext.Camera` for FOV/time-dilation, `Ext.Audio` for music/stinger triggers, `Ext.Encounter` for fast-resolve callbacks.)*

### Stage 3: Strategy Selection (`S1` → `S5` Ladder)
Select the highest-fidelity strategy from [references/strategies.md](references/strategies.md) and document why any simpler tier was insufficient:
- **S1 — Hybrid Brain Grafting:** Graft `PawaBrain` onto the game's native NPC navigation/animation controller while overriding target perception and ability scoring.
- **S2 — Dormant Developer / Bot Switch Activation:** Unlock built-in engine autoplay/spectator routines discovered via REA and augment them with PAWA's Utility scorer.
- **S3 — NativePAWA Adapter (Recommended Standard):** Link `pawa-brain-*` directly into the game process; read `Seam.Perception` each tick and dispatch motor intents directly into `Seam.Input` and `Seam.Camera`.
- **S4 — External Memory + Synthetic Input Bridge:** Run `pawa-brain-ts` out-of-process when internal hooking is unstable.
- **S5 — Pure Narrative Resolve:** Hook `Seam.Encounter` and `Seam.Camera` to transition combat encounters directly into choreographed resolution cuts.

### Stage 4: Persona Alignment
Select or author a protagonist profile from `schemas/archetypes.json` (`covert_operative`, `spartan_mercenary`, `tactical_commander`) matching the protagonist's lore and the player's current build (equipped weapons, active skills, consumables).

### Stage 5: Adapter Implementation & Safety Interlocks
Wire the chosen `pawa-brain-*` package to the Five Seams. Every PAWA adapter **must** implement automatic disengage interlocks on:
- Cutscene / dialogue active
- Menu / inventory / map open
- Loading screen or level transition
- Player manual override (optional instant hand-back on WASD/Stick input)

### Stage 6: Live Execution & 3-Gate Verification
Compiling is not completion. Run the game and verify:
1. **Smoke Gate:** Clean startup, `F5` toggles autonomy without frame hitching, `F6` cycles `TACTICAL` → `CINEMATIC_LIVE` → `CINEMATIC_RESOLVE`.
2. **Tactical Competence Gate:** Watch 5 minutes of combat. Verify the agent parries/dodges telegraphed (`isWindUp`) strikes, utilizes equipped abilities, and avoids obstacle oscillation via 16-Slot Context Steering.
3. **Quest Integrity Gate:** Trigger `CINEMATIC_RESOLVE` during an objective fight and verify that the next quest stage unlocks cleanly.

### Stage 7: Recipe Archival
Complete `targets/<game>/REPORT.md` and update the Supported Targets table in the root `README.md`.
