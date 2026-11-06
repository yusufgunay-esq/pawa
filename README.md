<div align="center">

# AUTOMA
### Autonomous Play Architecture

**An Open-Source, User-Configurable Game AI & Reverse-Engineering Protocol for Single-Player Games**

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-1e293b.svg)](LICENSE)
[![Cognitive Kernel](https://img.shields.io/badge/Brain_Kernel-TS_%7C_C%23_%7C_C%2B%2B20_%7C_Lua-0f172a.svg)](#3-shared-multi-language-brain-sdk-packages)
[![Recon Engine](https://img.shields.io/badge/Binary_Recon-REA_Compatible-334155.svg)](skills/automa/SKILL.md)
[![Architecture](https://img.shields.io/badge/Architecture-4--Layer_GOAP_%2B_Utility_AI-475569.svg)](paper/WHITEPAPER.md)

[Whitepaper & Math](paper/WHITEPAPER.md) · [Agent Skill Protocol](skills/automa/SKILL.md) · [Shared Brain SDK](packages/) · [Profile Schema](schemas/profile.schema.json) · [Profile Presets](schemas/profiles.json) · [Target Recipes](targets/)

</div>

---

## Abstract

> **Core vs. Next Step.** AUTOMA's core is a *normal, configurable game AI*: the user feeds it whatever behaviour they want (aggression, range, discipline, reaction time, doctrine) and it plays accordingly. **Protagonist Fidelity** (an agent that derives the story protagonist's real fighting style from the binary and takes the character over in-narrative) is the **next step (Phase 2)**, built on top of the core and not required by it.

Narrative-driven games frequently cast the player as an elite covert operative, a mythic mercenary, or a veteran battlefield commander, yet rely strictly on repetitive manual motor execution across hundreds of filler combat encounters. Existing "bot takeover" toggles (`is_human = false` in sandbox battle simulators or idle-takeover scripts in co-op shooters) fail to bridge this gap: standard NPC brains are engineered as expendable opposition and immediately degrade into naive "charge-nearest-enemy" loops when bound to a player character.

**AUTOMA (Autonomous Play Architecture)** is both an **AI Coding Agent Skill** (built to operate alongside [REA — Reverse Engineer Anything](skills/automa/SKILL.md)) and a **Shared Multi-Language Cognitive Brain SDK**. Point an agent (Claude Code, Antigravity, Codex, Cursor) at an installed single-player game and say:

> *"AUTOMA Assassin's Creed Odyssey — when combat starts, let my character fight autonomously with a Spartan Vanguard profile and allow me to switch between live tactical combat and cinematic action camera."*

---

## 1. Five Core Autonomy Modes (+ Optional Phase-2 Extensions)

AUTOMA is engineered around a strict separation of concerns: **Core Gameplay Autonomy** comes first (with the native player camera untouched), while camera, reactive music, and fast-resolve remain strictly optional Phase-2 extensions. Beyond full combat takeover, the shared AUTOMA Brain (`packages/automa-brain-*`) natively supports **five distinct operating modes**:

### A. Core Autonomy Modes (`AutonomyMode`)

| Mode Identifier | Name | Runtime Behavior & Player Experience |
|---|---|---|
| `FULL_COMBAT` *(Default)* | **Full Protagonist Combat** | Press `F5` and the 4-Layer AUTOMA Brain fights, parries, dodges, and chains abilities in real time while keeping the game's standard camera completely intact. |
| `CO_PILOT` | **Reflex & Parry Co-Pilot** | *"I drive, AUTOMA parries."* Human inputs pass straight through (`HUMAN_PASS_THROUGH`), but the millisecond an enemy telegraphs a lethal attack (`isWindUp`) or health drops critically, AUTOMA intercepts for a single action to execute a frame-perfect deflect, dodge, or emergency heal. |
| `GRIND_AUTOPILOT` | **Open-World Chore & Loot Cruise** | Eliminates open-world fatigue. Out of combat, the agent follows active waypoints/roads, auto-loots fallen enemies and resource nodes (`CRUISE_OR_LOOT`), and switches to `FULL_COMBAT` if ambushed. |
| `SHADOW_SURVIVAL` | **Boss Pattern Coach (Zero Offense)** | Enters strict `DEFENSIVE` stance—never attacking, only weaving, spacing, and parrying every boss combo via 16-Slot Context Steering so the player can study brutal boss patterns safely before taking over. |
| `COMMANDER` | **Macro Tactical Commander** | The player issues high-level doctrine orders (*"Focus Ranged"*, *"Hold Ground"*, *"All-Out Assault"*) while AUTOMA executes the low-level motor combat. |

### B. Optional Post-Core Extensions (Phase 2 — Added Only When Requested)

| Extension ID | Name | Optional Capability |
|---|---|---|
| `Ext.Camera` | **Dynamic Action Camera** | Optional plugin (`CINEMATIC_LIVE`) that orbits the camera or triggers brief hit-stop slow-motion (`0.35x`) on counters and finishers. |
| `Ext.Audio` | **Reactive Combat Music / Stingers** | Optional hook that swells dynamic combat music or protagonist theme stingers during high-utility maneuvers. |
| `Ext.Resolve` | **Choreographed Fast-Resolve** | Optional hook (`CINEMATIC_RESOLVE`) that fires native encounter-victory callbacks for players who want to skip filler fights cleanly. |
| `Ext.Telemetry` | **Scientific Benchmark Logger** | Exports per-tick GOAP plans, Utility scores, and Influence Map entropy to CSV/JSON for academic theses and research papers. |

---

## 2. Four-Layer Cognitive Architecture

To prevent each game mod from reinventing fragile `if/else` combat scripts, every target links against the unified **AUTOMA 4-Layer Cognitive Architecture** ([full mathematical formulation in `paper/WHITEPAPER.md`](paper/WHITEPAPER.md)):

```mermaid
flowchart TD
    subgraph GameProcess["Target Game Process (Discovered via REA)"]
        S_P["Seam.Perception (Entities, Health, Wind-Up Flags)"]
        S_I["Seam.Input (Motor Intents & Ability Dispatch)"]
        S_C["Seam.Camera (FOV, Orbit & Time-Dilation)"]
        S_E["Seam.Encounter (Quest & Victory Callbacks)"]
    end

    subgraph AutomaKernel["AUTOMA Shared Cognitive Brain (@automa/brain)"]
        L4["Layer 4: Narrative & Tactical Orchestrator<br/>(Profile Profile, Stance Selection & Presentation Director)"]
        L3["Layer 3: Regressive A* GOAP Planner + Compensated Utility AI<br/>(Multi-Step Action Chains & Reflex Interrupts)"]
        L2["Layer 2: Tactical Blackboard & 2D Spatial Influence Map<br/>(Threat Heatmaps, Safe-Pocket Search & Aggro Tracking)"]
        L1["Layer 1: 16-Slot Context Steering<br/>(Interest - Danger Radial Vector Synthesis)"]
    end

    S_P --> L2
    L2 --> L4
    L4 --> L3
    L2 --> L3
    L3 --> L1
    L1 --> S_I
    L3 --> S_I
    L4 --> S_C
    L4 --> S_E
```

### Formal Algorithmic Guarantees
1. **Makeup-Value Compensated Utility Scoring (Dave Mark):** Reflex actions $a \in \mathcal{A}_U$ with $n$ normalized considerations $q_i \in [0,1]$ apply compensation factor $\mu = 1 - \frac{1}{n}$ via $\hat{q}_i = q_i + (1 - q_i)\mu q_i$, ensuring complex multi-condition maneuvers (e.g., `DEFLECT_COUNTER` on enemy wind-up) are never mathematically penalized against single-condition attacks.
2. **Regressive $A^*$ GOAP Synthesis (Jeff Orkin):** Multi-step combat chains (`CLOSE_DISTANCE` $\rightarrow$ `HEAVY_ASSAULT` $\rightarrow$ `EXECUTE_FINISHER`) are planned backward from the Orchestrator's desired goal state $G^*$ to the live world state $W_t$.
3. **16-Slot Context Steering (Andrew Fray):** Evaluates 16 radial basis vectors $\mathbf{d}_k$ on the XZ plane, subtracting repulsive hazard cones $D_k$ (weighted by enemy wind-up telegraphs) from target ring interest $I_k$ to eliminate obstacle-oscillation traps.

---

## 3. Shared Multi-Language Brain SDK (`packages/`)

Because game modding spans managed C#, native C++, embedded Lua, and out-of-process TypeScript, AUTOMA maintains a synchronized, zero-dependency implementation of the 4-Layer Brain across all four ecosystems. Every target game adapter stays a thin 150-line bridge that feeds `EntitySnapshot` structs into the shared kernel:

| Package Path | Target Engines & Mod Loaders | Implementation Highlights |
|---|---|---|
| [`packages/automa-brain-ts`](packages/automa-brain-ts/src/index.ts) | Reference Spec, Electron/JS Games, External Bridges | Full TypeScript reference kernel + automated test suite (`npm test`). |
| [`packages/automa-brain-cs`](packages/automa-brain-cs/AutomaBrain.cs) | Unity Mono & IL2CPP (`BepInEx`, `MelonLoader`), .NET | Single-file drop-in C# kernel (`Automa.Brain.AutomaBrainKernel`), zero GC allocation in steering loop. |
| [`packages/automa-brain-cpp`](packages/automa-brain-cpp/include/automa/automa_brain.hpp) | Native C++ Engines (`AnvilNext`, `Unreal C++`, `MinHook` Proxy) | Header-only C++20 (`automa::BrainKernel`), `constexpr`/stack-allocated `std::array` slots. |
| [`packages/automa-brain-lua`](packages/automa-brain-lua/automa_brain.lua) | `UE4SS` (Unreal 4/5), `Cyber Engine Tweaks` (`REDengine`), `Source` | Pure Lua 5.1+/LuaJIT module with identical compensated utility and 16-slot steering. |

---

## 4. The Three Core Seams (+ Optional Phase-2 Extensions)

When an AI agent is instructed to **AUTOMA a target game**, it follows [skills/automa/SKILL.md](skills/automa/SKILL.md) to extract the **Three Core Seams** using REA. Camera, reactive music, and fast-resolve hooks remain strictly optional Phase-2 extensions:

| Seam / Extension | Tier | Target Subsystem | Required Binary Evidence |
|---|---|---|---|
| `Seam.Input` | **Core (Mandatory)** | Player Controller & Action Dispatch | Internal command handlers (`Move`, `Attack`, `Parry`, `Dodge`, `UseAbility`). |
| `Seam.Perception` | **Core (Mandatory)** | World State & Telegraphing | Active entity array, health/stamina offsets, and enemy attack wind-up flags. |
| `Seam.NpcAI` | **Core (Mandatory)** | Native NPC / Companion Brain | Existing Behavior Tree, combat evaluator, or dormant autoplay switch. |
| `Ext.Camera` | *Optional (Phase 2)* | Action Camera & Time Dilation | Camera FOV/orbit transform and `timeScale` hooks (`CINEMATIC_LIVE`). |
| `Ext.Audio` | *Optional (Phase 2)* | Reactive Combat Music / Stingers | Dynamic music intensity / protagonist theme trigger hooks. |
| `Ext.Encounter` | *Optional (Phase 2)* | Encounter Lifecycle & Quests | Native encounter-completion callbacks (`CINEMATIC_RESOLVE`). |

---

## 5. Collective Game Autonomy Atlas (Self-Feeding Upstream Protocol)

AUTOMA is designed as a **self-growing collective intelligence repository**. Whenever a user anywhere in the world instructs their AI coding agent to AUTOMA a game:

1. **Lookup First (`Stage 0`):** The agent checks `targets/<game-slug>/` in `yusufgunay-esq/automa`. If another agent has already mapped the game's seams, the mod is built in seconds without redundant reverse engineering.
2. **Upstream Recipe Sync (`Stage 7`):** When an agent reverse-engineers a new game with REA, it records the discovered memory offsets, hook signatures, and clean-room adapter in `targets/<game-slug>/REPORT.md` and runs [`scripts/contribute-recipe.mjs`](scripts/contribute-recipe.mjs):
   ```bash
   # Audits for zero proprietary binaries / zero profilel paths, then opens a PR to yusufgunay-esq/automa
   node scripts/contribute-recipe.mjs <game-slug>
   ```
   Every user's agent automatically feeds newly discovered game seams and adapters back into **`yusufgunay-esq/automa`** via Pull Request, turning this repository into the canonical global atlas of game autonomy seams.

---

## 6. Profile: Fed By the User, Never Picked From a Menu

**Tier 1 (core, now): User-Fed Profile.** The user (or their agent, from a plain-language description) writes the `profile.json`: any playstyle, any numbers. No game knowledge is needed, and it works for any controllable unit: the player character, a companion, or any NPC. **Tier 2 (next step, Phase 2): Protagonist Fidelity.** REA derives the numbers from the protagonist's real animation and commitment behaviour so the takeover is narrative-consistent. The schema is identical for both tiers; only the *source* of the numbers differs.

"Configurable Autonomy" is the whole point of the project, so AUTOMA deliberately ships **no closed taxonomy of playstyles**. A fixed enum of five classes ("Operative / Vanguard / Scholar / Skirmisher / Guardian") would mean *"every protagonist in every game fits five boxes"* — the opposite of profile alignment. An arcane duelist, a drunken brawler and a pacifist monk are all first-class.

| | Closed taxonomy (rejected) | AUTOMA's approach |
|---|---|---|
| How the style is chosen | Pick one of five boxes | The agent **derives** it from REA evidence |
| Games that do not fit | Forced into the nearest box | Author their own `profile.json` |
| Role of the reverse-engineering engine | Cannot leave the list | Reads the protagonist's real animation/commitment behaviour and produces the numbers |
| `archetype` label | Enum, validated against a list | Free-form string, any label the game deserves |

Concretely:

1. **[`schemas/profile.schema.json`](schemas/profile.schema.json)** validates ranges and shapes only — `archetype` is a free-form label, not an enum.
2. **[`schemas/profiles.json`](schemas/profiles.json)** holds five **optional starting templates** (including an `ARCANE_SCHOLAR` and a `RANGED_SKIRMISHER`, both missing from the old enum). Fork the closest one, then re-tune every number against evidence and rename the label.
3. **Every target writes its own** `targets/<game-slug>/profile.json`, with an `evidence` array recording which symbols and timings justified each parameter, validated by `node scripts/validate-profiles.mjs <game-slug>`.

Derivation is prescriptive, not vibes: `preferredRange` comes from weapon reach and attack-animation distance, `aggression` from the ratio of committed attacks to repositioning in the combat state machine, `discipline` from the parry-window length found in `Seam.Input`, `cinematicFlair` from the presence of counters/finishers/hit-stop hooks, and `reactionDelayMs` from dodge/parry commitment frames. A profile that is still byte-identical to a preset is treated as a specification failure.

---

## 7. Repository Structure

```text
AUTOMA/
├── .claude-plugin/          # Agent plugin manifest (Claude Code / Antigravity)
├── packages/
│   ├── automa-brain-ts/       # Reference 4-Layer Cognitive Kernel (TypeScript + Node test suite)
│   ├── automa-brain-cs/       # Drop-in C# Kernel for Unity Mono / IL2CPP (BepInEx / MelonLoader)
│   ├── automa-brain-cpp/      # Header-only C++20 Kernel for Native DLL Hooking (Anvil / Unreal)
│   └── automa-brain-lua/      # Portable Lua Kernel for UE4SS / Cyber Engine Tweaks / VScript
├── paper/
│   └── WHITEPAPER.md        # Formal mathematical specification & academic references
├── schemas/
│   ├── profile.schema.json  # Profile contract (free-form playstyle label — NO fixed taxonomy)
│   ├── profiles.schema.json  # Contract for the optional preset library
│   └── profiles.json         # Five OPTIONAL starting templates, meant to be re-derived per game
├── scripts/
│   ├── contribute-recipe.mjs# Automated hygiene audit & upstream PR contributor to yusufgunay-esq/automa
│   └── validate-profiles.mjs# Zero-dependency profile contract validator
├── skills/
│   └── automa/                # Agent skill definition, strategy ladder (S1-S5) & engine matrix
└── targets/
    └── _template/REPORT.md  # Standardized 3-Core-Seam & 4-Gate verification report for new games
```

---

## 8. Quick Verification

Run the reference cognitive kernel test suite (Node.js 22+):

```bash
cd packages/automa-brain-ts
npm test
```

Validate the profile contracts (reference kernel + every shipped target):

```bash
node scripts/validate-profiles.mjs
```

---

## 9. Scope & Operational Ethics

- **Single-Player & Offline Only:** AUTOMA strictly targets offline, single-player games. Targets with online competitive modes or kernel anti-cheat drivers (`EAC`, `BattlEye`, `Vanguard`) are rejected at Stage 1 reconnaissance.
- **Zero Proprietary Assets:** No game binaries, `.pak` files, or proprietary assets are ever committed to this repository—only clean-room adapter source code, profile definitions, and REA seam documentation.

---

## Citation

If you build upon AUTOMA's cognitive architecture, profile schemas, or target adapters in academic work or open-source projects, please cite [`CITATION.cff`](CITATION.cff):

```bibtex
@software{gunay2026automa,
  author    = {G{\"u}nay, Yusuf},
  title     = {{AUTOMA: Autonomous Play Architecture for Single-Player Games}},
  year      = {2026},
  version   = {1.0.0},
  license   = {MPL-2.0},
  url       = {https://github.com/yusufgunay-esq/automa}
}
```

## License & Mandatory Academic Attribution

AUTOMA employs a dual-protection structure designed for open-source scientific software:

1. **Software & SDK (`packages/`, `skills/`, `targets/`):** Licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. Any modification or redistribution of covered files must retain the copyright notice crediting **Yusuf Günay** ([`LICENSE`](LICENSE), [`NOTICE`](NOTICE)).
2. **Whitepaper, Mathematical Formulation & Research Protocols (`paper/`, `schemas/`):** Licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**. Any academic thesis, dissertation, conference proceeding, preprint, or technical report that uses, benchmarks, or references AUTOMA is **legally required** to credit **Yusuf Günay** by name via the citation above ([`CITATION.cff`](CITATION.cff)).
