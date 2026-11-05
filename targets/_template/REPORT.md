# PAWA Target Report: <Game Title> (<Version / Platform>)

- **Target Slug:** `<game-slug>`
- **Status:** `RECON` | `PROTOTYPE` | `VERIFIED`
- **Brain Runtime Linked:** `pawa-brain-cs` | `pawa-brain-cpp` | `pawa-brain-lua` | `pawa-brain-ts`
- **Strategy Tier Used:** `S1` | `S2` | `S3` | `S4` | `S5`
- **Default Persona Profile:** `covert_operative` | `spartan_mercenary` | `tactical_commander`
- **Supported Presentation Modes:** `TACTICAL`, `CINEMATIC_LIVE`, `CINEMATIC_RESOLVE`

---

## 1. Binary & Engine Fingerprint (REA Evidence)

| Property | Observed Value | REA Tool / Evidence ID |
|---|---|---|
| Engine & Runtime | | |
| Mod Loader / Injection Vector | | |
| Anti-Cheat / Online Check | Must be `None` (Single-Player Offline) | |

---

## 2. Core Seams & Optional Phase-2 Extensions

| Seam ID | Tier | Subsystem | Symbol / RVA / Signature | Discovery Method (REA) |
|---|---|---|---|---|
| `Seam.Input` | **Core (Mandatory)** | Player Controller & Motor Intent | | |
| `Seam.Perception` | **Core (Mandatory)** | Entity List, Health, Wind-Up Telegraph | | |
| `Seam.NpcAI` | **Core (Mandatory)** | Native NPC / Companion Brain Entry | | |
| `Ext.Camera` | *Optional (Phase 2)* | FOV, Orbit Transform & Time-Dilation | | |
| `Ext.Audio` | *Optional (Phase 2)* | Dynamic Combat Music / Stinger Trigger | | |
| `Ext.Encounter` | *Optional (Phase 2)* | Fast-Resolve Encounter Callbacks | | |

---

## 3. Strategy Justification & Architecture Notes

Explain why the selected strategy tier (`S1`–`S5`) was chosen and how the shared `PawaBrain` kernel interfaces with the target's state and action hooks.

---

## 4. Three-Gate Verification Ledger

- [ ] **Gate 1 — Smoke & Hotkey Hand-off:** `F5` toggles autonomy without frame stutter; `F6` cycles `TACTICAL` $\rightarrow$ `CINEMATIC_LIVE` $\rightarrow$ `CINEMATIC_RESOLVE`.
- [ ] **Gate 2 — Safety Interlocks:** Autonomy cleanly pauses on cutscenes, dialogues, menus, loading screens, and player death.
- [ ] **Gate 3 — Protagonist Competence (5-Minute Live Combat):** Agent parries/dodges telegraphed (`isWindUp`) attacks, uses equipped skills, and navigates obstacles via 16-Slot Context Steering without oscillation.
- [ ] **Gate 4 — Quest & Save Integrity:** `CINEMATIC_RESOLVE` triggers native encounter completion callbacks and advances quest objectives cleanly.
