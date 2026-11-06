---
name: automa
description: Autonomous Play Architecture (AUTOMA). Reverse engineer any single-player game with REA, discover its controller/AI/camera seams, and inject a 4-layer, user-configurable autonomous game brain (Orchestrator, Regressive A* GOAP, Compensated Utility AI, 16-Slot Context Steering) with user-selectable Tactical, Cinematic Live, and Cinematic Resolve presentation modes. Trigger when the user says "AUTOMA this game", "şu oyuna AUTOMA yap", "add autopilot/auto-combat to <game>", or wants a character to play autonomously with a behaviour profile they define (Protagonist Fidelity, i.e. mimicking the story protagonist, is an optional Phase-2 tier).
metadata:
  version: "1.0.0"
---

# AUTOMA — Autonomous Play Architecture

AUTOMA gives any single-player game a **normal, user-configurable AI**. With a single hotkey (`F5`), a controllable character is handed over to a **Configurable Autonomy Proxy Agent** that fights, dodges, parries, and executes abilities in real time according to a behaviour profile *the user feeds it*. Mimicking the story protagonist (Protagonist Fidelity) is the optional **Phase-2** tier, not the core—while keeping the game's native camera and flow completely intact (like *Left 4 Dead 2* or *Warband* `F5`, but powered by a genuine 4-layer tactical brain instead of a naive bot).

---

## 1. Five Core Autonomy Modes (`F5` / `F7`) & Optional Phase-2 Extensions

AUTOMA is not limited to a single "bot takeover" toggle. The cognitive kernel (`packages/automa-brain-*`) supports **Five Distinct Autonomy Modes** (`AutonomyMode`), while keeping camera, music, and fast-resolve as optional Phase-2 extensions:

### A. Core Autonomy Operating Modes (`AutonomyMode`)
1. **`FULL_COMBAT` (Default — Live AI Control):** Press `F5` and the 4-Layer AUTOMA Brain takes full control of combat, movement, parries, and ability rotations in real time while keeping the native player camera intact.
2. **`CO_PILOT` (Reflex & Micro-Assist Mode — *"I Drive, AUTOMA Parries"*):** The human player retains full movement and attack control (`HUMAN_PASS_THROUGH`), but the millisecond an enemy telegraphs a lethal strike (`isWindUp == true`) or health drops critically, AUTOMA's Compensated Utility scorer intercepts for a single frame to execute a frame-perfect parry/deflect, dodge, or emergency heal.
3. **`GRIND_AUTOPILOT` (Open-World Chore, Loot & Waypoint Cruise):** Eliminates open-world fatigue. Out of combat, the agent steers along the active waypoint/road, automatically loots fallen enemies and resource nodes (`CRUISE_OR_LOOT`), and seamlessly switches to `FULL_COMBAT` if ambushed.
4. **`SHADOW_SURVIVAL` (Zero-Offense Boss Pattern Coach):** Designed for learning brutal bosses. The agent enters strict `DEFENSIVE` stance—never attacking, only weaving, spacing, and parrying every boss combo via 16-Slot Context Steering so the player can study attack patterns safely before taking over.
5. **`COMMANDER` (High-Level Tactical Doctrine):** The player issues macro orders (*"Focus Ranged"*, *"Hold Ground"*, *"Go All-In"*) while AUTOMA executes the low-level motor combat.

### B. Optional Post-Core Extensions (Phase 2 — Only When Requested)
- **`Ext.Camera` (`CINEMATIC_LIVE`):** Dynamic FOV framing and hit-stop slow-motion on parries and finishers.
- **`Ext.Audio` (Reactive Combat Music / Stingers):** Swells combat music intensity or triggers protagonist theme stingers during high-utility maneuvers.
- **`Ext.Resolve` (`CINEMATIC_RESOLVE`):** Choreographed encounter-completion hook for skipping filler fights cleanly.
- **`Ext.Telemetry` (Scientific / Thesis Benchmark Logger):** Exports per-tick GOAP plans, Utility scores, and Influence Map entropy to CSV/JSON for academic research.

---

## 2. Hard Scope & Ethics Boundaries

1. **Single-Player & Offline Only:** Immediately abort and inform the user if the target binary links active online competitive matchmaking or kernel-mode anti-cheat drivers (`EasyAntiCheat`, `BattlEye`, `Vanguard`, `RICOCHET`). Never attempt to bypass anti-cheat or DRM.
2. **Clean-Room Repository Hygiene:** Never commit game executables, proprietary assets, `.pak` archives, or raw decompiled dumps into `targets/<game>/`. Only commit the thin adapter code, hook definitions, `profile.json`, and `REPORT.md`.
3. **Reversible Injection:** Always deploy via non-destructive mod loaders (BepInEx, MelonLoader, UE4SS, Cyber Engine Tweaks, or drop-in DLL proxy) with one-step removal.

---

## 3. End-to-End AUTOMA Engineering Workflow

When asked to **"AUTOMA `<game>`"**, execute these stages in order and record every symbol/address in `targets/<game>/REPORT.md`:

### Stage 0: Query the Upstream AUTOMA Atlas First
Before running heavy binary decompilation, check whether `targets/<game-slug>/REPORT.md` already exists in the local checkout or upstream at `https://github.com/yusufgunay-esq/automa/tree/main/targets`. If a verified recipe exists, reuse its discovered seams and adapter directly.

### Stage 1: Binary & Engine Reconnaissance (via REA)
1. Identify the engine and runtime (`Unity Mono`, `Unity IL2CPP`, `Unreal Engine 4/5`, `AnvilNext`, `REDengine`, `Source`, or custom C++) using REA (`open_binary`, `binary_overview`, `inspect_managed_artifact`).
2. Consult [references/engines.md](references/engines.md) to select the appropriate non-destructive loader and matching AUTOMA Brain package (`automa-brain-cs`, `automa-brain-cpp`, `automa-brain-lua`, or `automa-brain-ts`).

### Stage 2: Three Core Seams Extraction
Using REA static cross-references (`xrefs`, `search_strings`, `procedure_pseudo_code`) and runtime observation, locate the **Three Core Seams** required for live autonomous combat:
1. **Player Controller & Input Poll (`Seam.Input` — Core):** Where hardware inputs are read or translated into motor intents (`Move`, `LightAttack`, `HeavyAttack`, `Parry`, `Dodge`, `UseAbility`).
2. **Perceptual World State (`Seam.Perception` — Core):** Entity list iteration, health/stamina ratios, enemy attack telegraphing (`isWindUp` / animation montage flags), and faction/aggro tables.
3. **NPC / Companion Brain Entry (`Seam.NpcAI` — Core):** Existing Behavior Tree, Utility evaluator, or combat state machine used by elite NPCs or companions (for Strategy S1/S2).

*(Optional Phase 2 Seams — only locate if the user explicitly asks for camera, music, or skip extensions: `Ext.Camera` for FOV/time-dilation, `Ext.Audio` for music/stinger triggers, `Ext.Encounter` for fast-resolve callbacks.)*

### Stage 3: Strategy Selection (`S1` → `S5` Ladder)
Select the highest-fidelity strategy from [references/strategies.md](references/strategies.md) and document why any simpler tier was insufficient:
- **S1 — Hybrid Brain Grafting:** Graft `AutomaBrain` onto the game's native NPC navigation/animation controller while overriding target perception and ability scoring.
- **S2 — Dormant Developer / Bot Switch Activation:** Unlock built-in engine autoplay/spectator routines discovered via REA and augment them with AUTOMA's Utility scorer.
- **S3 — NativeAUTOMA Adapter (Recommended Standard):** Link `automa-brain-*` directly into the game process; read `Seam.Perception` each tick and dispatch motor intents directly into `Seam.Input` and `Seam.Camera`.
- **S4 — External Memory + Synthetic Input Bridge:** Run `automa-brain-ts` out-of-process when internal hooking is unstable.
- **S5 — Pure Narrative Resolve:** Hook `Seam.Encounter` and `Seam.Camera` to transition combat encounters directly into choreographed resolution cuts.

### Stage 4: Profile (User-Fed by Default, Evidence-Derived in Phase 2)
**Tier 1 (default):** take the profile from the user's own description or file; ask only if a value matters and is unclear, otherwise fork the closest preset. Do not run protagonist analysis unless asked.

**Tier 2 (Phase 2, only when the user asks for Protagonist Fidelity):** author `targets/<game-slug>/profile.json` **for this protagonist specifically**. AUTOMA deliberately ships **no closed taxonomy of playstyles**: the `archetype` field is a free-form label and the five numeric parameters must be derived from what the protagonist actually does in this game.

1. `schemas/profiles.json` holds five **optional starting templates** (`covert_operative`, `spartan_mercenary`, `tactical_commander`, `arcane_scholar`, `ranged_skirmisher`). Fork the closest one, **then re-tune every number against REA evidence** — `preferredRange` from weapon reach and attack-animation distance, `aggression` from the ratio of committed attacks to repositioning, `discipline` from parry-window length, `cinematicFlair` from the presence of counters/finishers/hit-stop hooks, `reactionDelayMs` from dodge/parry commitment frames.
2. Rename `archetype` to whatever the game calls this fighting style (e.g. `SPARTAN_MISTHIOS`, `STEALTH_ASSASSIN`, `DRUNKEN_BRAWLER`). Do not force a protagonist into a preset name.
3. Fill the `evidence` array with the symbols/timings that justify each parameter, then validate: `node scripts/validate-profiles.mjs <game-slug>`.
4. If the shipped profile is still byte-identical to a preset, that is a specification failure — re-derive it.

### Stage 5: Adapter Implementation & Safety Interlocks
Wire the chosen `automa-brain-*` package to the Five Seams. Every AUTOMA adapter **must** implement automatic disengage interlocks on:
- Cutscene / dialogue active
- Menu / inventory / map open
- Loading screen or level transition
- Player manual override (optional instant hand-back on WASD/Stick input)

### Stage 6: Live Execution & 3-Gate Verification
Compiling is not completion. Run the game and verify:
1. **Smoke Gate:** Clean startup, `F5` toggles autonomy without frame hitching, `F6` cycles `TACTICAL` → `CINEMATIC_LIVE` → `CINEMATIC_RESOLVE`.
2. **Tactical Competence Gate:** Watch 5 minutes of combat. Verify the agent parries/dodges telegraphed (`isWindUp`) strikes, utilizes equipped abilities, and avoids obstacle oscillation via 16-Slot Context Steering.
3. **Quest Integrity Gate:** Trigger `CINEMATIC_RESOLVE` during an objective fight and verify that the next quest stage unlocks cleanly.

### Stage 7: Collective Atlas Sync — Contribute Recipe Upstream to `yusufgunay-esq/automa`
AUTOMA is a self-growing **Collective Game Autonomy Atlas**. Every time an agent engineers or refines a target recipe (`targets/<game-slug>/REPORT.md`, `profile.json`, and clean-room adapter source), it **must** feed the learned seams and adapter back to the central repository (`yusufgunay-esq/automa`) so no future user or agent ever has to reverse-engineer the same game twice:

1. Complete `targets/<game-slug>/REPORT.md` with exact REA seam symbols/RVAs, strategy tier justification, and verification results.
2. Run the hygiene & privacy check:
   ```bash
   node scripts/contribute-recipe.mjs <game-slug> --dry-run
   ```
   *(Verifies zero `.exe`/`.dll`/`.pak` binaries and zero profilel OS username paths are present).*
3. With the user's confirmation, submit the recipe upstream as an automated Pull Request to `yusufgunay-esq/automa`:
   ```bash
   node scripts/contribute-recipe.mjs <game-slug>
   ```
