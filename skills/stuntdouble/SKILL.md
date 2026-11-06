---
name: stuntdouble
description: Competent combat hand-over for story-driven single-player games (Stuntdouble). Reverse engineer any single-player game with REA, discover its controller/perception/native-AI seams, and give the player's character a competent autonomous fighter: the game's own AI as the base, Stuntdouble's 4-layer brain (Orchestrator, Regressive A* GOAP, Compensated Utility AI, 16-Slot Context Steering) as a competence layer or standalone. Trigger when the user says "Stuntdouble this game", "şu oyuna Stuntdouble yap", "add autopilot/auto-combat to <game>", or wants a character to play fights on its own and hand control back afterwards. Protagonist Fidelity (mimicking the story protagonist) is an open Phase-2 idea.
metadata:
  version: "1.0.0"
---

# Stuntdouble — Competent combat hand-over for story-driven single-player games

Purpose: a player who wants the story (or just wants to watch) hands the fighting to a competent agent; control returns when the fight is over. It is the *working* version of the old "bot takes over" toggle. The profile is five optional knobs with a good default, not a persona.

---

## 1. Behaviors (Five Presets), Hand-over, Architecture Order

- **Behavior flags** (`Behaviors` bit mask): `COMBAT`=1, `ASSIST`=2, `CRUISE`=4, `DEFENSIVE`=8, `COMMAND`=16. The five `AutonomyMode` names are presets (`FULL_COMBAT`=COMBAT, `CO_PILOT`=ASSIST, `GRIND_AUTOPILOT`=CRUISE+COMBAT, `SHADOW_SURVIVAL`=DEFENSIVE, `COMMANDER`=COMBAT+COMMAND). Rules: DEFENSIVE overrides offense; ASSIST is inert while COMBAT is set and an enemy exists; CRUISE runs only while no enemy exists; **no active behavior => `HUMAN_PASS_THROUGH`** (no intercept, no steering). An optional preset-cycle key walks the five presets; other masks come from the user's words.
- **Hand-over** (`StuntRuntime`, `packages/stuntdouble-seams-ts`): default `engage: 'onCombat'` takes over when a hostile is perceived and hands back after ~2 s without hostiles; `engage: 'manual'` uses a toggle bound to a key the user picks (`toggleKey`, no fixed key; F5 etc. are only examples). Manual input hands control back immediately; cutscene/menu/loading interlocks keep Stuntdouble inert.
- **Architecture order:** (1) the game's own AI is the foundation (S1/S2); (2) Stuntdouble is a competence layer on top, overriding only weak moments (wind-up parry/dodge, low-health retreat, target choice, oscillation) and logging each override reason; (3) if native AI is unreachable (DRM), Stuntdouble drives alone (S3/S4); (4) S5 story-first resolve.
- **Phase 2 / open (not core):** camera (`Ext.Camera`), reactive audio, fast-resolve (`Ext.Resolve`), telemetry, **Protagonist Fidelity** (REA-derived fighting style), "let the AI figure out the game itself". Only when the user asks.

---

## 2. Hard Scope & Ethics Boundaries

1. **Single-Player & Offline Only:** Immediately abort and inform the user if the target binary links active online competitive matchmaking or kernel-mode anti-cheat drivers (`EasyAntiCheat`, `BattlEye`, `Vanguard`, `RICOCHET`). Never attempt to bypass anti-cheat or DRM.
2. **Clean-Room Repository Hygiene:** Never commit game executables, proprietary assets, `.pak` archives, or raw decompiled dumps into `targets/<game>/`. Only commit the thin adapter code, hook definitions, `profile.json`, and `REPORT.md`.
3. **Reversible Injection:** Always deploy via non-destructive mod loaders (BepInEx, MelonLoader, UE4SS, Cyber Engine Tweaks, or drop-in DLL proxy) with one-step removal.

---

## 3. End-to-End Stuntdouble Engineering Workflow

When asked to **"Stuntdouble `<game>`"**, execute these stages in order and record every symbol/address in `targets/<game>/REPORT.md`:

### Stage 0: Query the Upstream Stuntdouble Atlas First
Before running heavy binary decompilation, check whether `targets/<game-slug>/REPORT.md` already exists in the local checkout or upstream at `https://github.com/yusufgunay-esq/stuntdouble/tree/main/targets`. If a verified recipe exists, reuse its discovered seams and adapter directly.

### Stage 1: Binary & Engine Reconnaissance (via REA)
1. Identify the engine and runtime (`Unity Mono`, `Unity IL2CPP`, `Unreal Engine 4/5`, `AnvilNext`, `REDengine`, `Source`, or custom C++) using REA (`open_binary`, `binary_overview`, `inspect_managed_artifact`).
2. Consult [references/engines.md](references/engines.md) to select the appropriate non-destructive loader and matching Stuntdouble Brain package (`stuntdouble-brain-cs`, `stuntdouble-brain-cpp`, `stuntdouble-brain-lua`, or `stuntdouble-brain-ts`).

### Stage 2: Three Core Seams Extraction
Using REA static cross-references (`xrefs`, `search_strings`, `procedure_pseudo_code`) and runtime observation, locate the **Three Core Seams** required for live autonomous combat:
1. **Player Controller & Input Poll (`Seam.Input` — Core):** Where hardware inputs are read or translated into motor intents (`Move`, `LightAttack`, `HeavyAttack`, `Parry`, `Dodge`, `UseAbility`).
2. **Perceptual World State (`Seam.Perception` — Core):** Entity list iteration, health/stamina ratios, enemy attack telegraphing (`isWindUp` / animation montage flags), and faction/aggro tables.
3. **NPC / Companion Brain Entry (`Seam.NpcAI` — Core):** Existing Behavior Tree, Utility evaluator, or combat state machine used by elite NPCs or companions (for Strategy S1/S2).

*(Optional Phase 2 Seams — only locate if the user explicitly asks for camera, music, or skip extensions: `Ext.Camera` for FOV/time-dilation, `Ext.Audio` for music/stinger triggers, `Ext.Encounter` for fast-resolve callbacks.)*

### Stage 3: Strategy Selection (`S1` → `S5` Ladder)
Pick in this order and document why a higher tier was not possible ([references/strategies.md](references/strategies.md)):
1. **S1 / S2 first, if reachable:** the game's own AI (companion/elite NPC brain, or developer autoplay) is the foundation: its animations and mechanics are already right. Bind it to the player character and add Stuntdouble as a **competence layer** (`NativeAiSeam`): the native AI was written to lose, so Stuntdouble only overrides weak moments.
2. **S3 / S4 when native AI is unreachable** (DRM, VMProtect, no hook): Stuntdouble's brain drives alone, in-process (S3) or via an external bridge (S4). Examples: `targets/assassins-creed-odyssey/REPORT.md` (VMProtect: S4 only), `targets/ghost-recon-breakpoint/REPORT.md` (ABORT: Denuvo + anti-cheat traces).
3. **S5 story-first shortcut:** clean encounter resolve.

### Stage 4: Profile (User-Fed by Default, Evidence-Derived in Phase 2)
**Tier 1 (default):** take the profile from the user's own description or file; ask only if a value matters and is unclear, otherwise fork the closest preset. Do not run protagonist analysis unless asked.

**Tier 2 (Phase 2, only when the user asks for Protagonist Fidelity):** author `targets/<game-slug>/profile.json` **for this protagonist specifically**. Stuntdouble deliberately ships **no closed taxonomy of playstyles**: the `archetype` field is a free-form label and the five numeric parameters must be derived from what the protagonist actually does in this game.

1. `schemas/profiles.json` holds five **optional starting templates** (`covert_operative`, `spartan_mercenary`, `tactical_commander`, `arcane_scholar`, `ranged_skirmisher`). Fork the closest one, **then re-tune every number against REA evidence** — `preferredRange` from weapon reach and attack-animation distance, `aggression` from the ratio of committed attacks to repositioning, `discipline` from parry-window length, `cinematicFlair` from the presence of counters/finishers/hit-stop hooks, `reactionDelayMs` from dodge/parry commitment frames.
2. Rename `archetype` to whatever the game calls this fighting style (e.g. `SPARTAN_MISTHIOS`, `STEALTH_ASSASSIN`, `DRUNKEN_BRAWLER`). Do not force a protagonist into a preset name.
3. Fill the `evidence` array with the symbols/timings that justify each parameter, then validate: `node scripts/validate-profiles.mjs <game-slug>`.
4. If the shipped profile is still byte-identical to a preset, that is a specification failure — re-derive it.

### Stage 5: Adapter Implementation and Seam Contract
Implement the seams from `packages/stuntdouble-seams-ts` (C# mirror: `packages/stuntdouble-brain-cs/StuntSeams.cs`) and hand them to `StuntRuntime`: `PerceptionSeam`, `InputSeam`, `InterlockSeam` (cutscene / menu / loading / manual override: all mandatory) and, when S1/S2 is reachable, `NativeAiSeam`. Fill `targets/_template/adapter-checklist.md` (seam -> arena gate).

### Stage 6: Verification Gates
Compiling is not completion.
1. **Arena gate (automatic):** `node packages/stuntdouble-arena/run.mjs` must print `ALL GATES PASS` (kernel + runtime contract: survival, avoided telegraphs, no offense under DEFENSIVE, bounded steering reversals, zero input while locked, same-tick manual hand-back, onCombat takeover/hand-back, native-AI overlay beats native alone). It does not prove the real game.
2. **Live smoke gate:** clean startup; hand-over happens on the first hostile and returns ~2 s after the fight; manual input and cutscenes release control; no frame hitching.
3. **Live competence gate:** a short real fight: parries/dodges telegraphed strikes, no oscillation; walk the adapter checklist.
4. **Quest integrity gate (only if `Ext.Resolve`/S5 is used):** the next quest stage unlocks cleanly.

### Stage 7: Atlas Bundle (Local Verification, Consent, No PR to the Code Repo)
The atlas is a separate data repo with a single writer (see `docs/ROADMAP.md`); do **not** open pull requests against the code repository.
1. Complete `targets/<game-slug>/REPORT.md` (seam symbols/RVAs, strategy justification, verification results).
2. Audit locally: `node scripts/contribute-recipe.mjs <game-slug> --dry-run` (no binaries, no personal paths).
3. Show the user exactly what would be sent and ask for consent. Only after a yes: `node scripts/contribute-recipe.mjs <game-slug> --bundle out.json --user-approved`.
4. Submission target does not exist yet: the script says "not open yet" and the bundle stays local. Never push or PR anywhere.
