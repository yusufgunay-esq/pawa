# Stuntdouble Target Report: Assassin's Creed Odyssey (version not verified / PC, Ubisoft Connect)

- **Target Slug:** `assassins-creed-odyssey`
- **Status:** `RECON` (Stage 1 passed with caveats)
- **Brain Runtime Linked:** none yet (planned: `stuntdouble-brain-ts`, out-of-process)
- **Strategy Tier:** `S4` recommended, not implemented
- **Profile:** empty, supplied by the user later

**DECISION: Stage 1 PASSED with caveats.** No anti-cheat found. The executables are VMProtect-packed and Denuvo's absence is not proven, so nothing touches the protected code. Only out-of-process S4 is considered.

---

## 1. Binary & Engine Fingerprint

Install path: `D:\Games\Assassin's Creed Odyssey`. Method: passive only (file listing, PE headers/sections/imports, raw string search, Authenticode, hashes). Nothing was launched or modified.

| Property | Observed Value | Evidence |
|---|---|---|
| Engine & Runtime | `ScimitarEngineWindowClass` string (Anvil family). Data in `DataPC*.forge`. | raw string search; file listing |
| Launcher | Ubisoft Connect (`uplay_r1_loader64.dll`) | file listing |
| Executables | `ACOdyssey.exe` 272 MB, `ACOdyssey_plus.exe` 478 MB, both signed. Hashes match their `.original.bak` copies (`3CB92F72…`, `422439DA…`), so they are unmodified. | Authenticode; hash comparison |
| Protection | `.vmp0`/`.vmp1` sections (typical VMProtect names). No Denuvo strings found, **but absence not proven**. | PE sections; raw string search |
| Anti-Cheat | No BattlEye/EAC strings or files found | raw string search; file listing |
| Imports | `ws2_32`, `opengl32`, `bink2w64`, `oo2core_4_win64`; no `dinput8`/`dxgi`/`version` | PE imports |
| Offline mode | not verified | — |

## 2. Seams

| Seam | Status | Plan |
|---|---|---|
| `Seam.Perception` | not verified | S4: read the entity list, health and wind-up state from process memory. The structures are unknown, so this needs runtime observation (only with the user's go). |
| `Seam.Input` | not verified | S4: synthetic keyboard/mouse/pad input from outside the process |
| `Seam.Interlock` | not verified | Cutscene/menu/loading flags from memory; fallback: screen-state heuristics |
| `Seam.NpcAI` | out of scope | Would need decompiling the protected exe |

Unexplored lead: `ugc\schemas\v1` JSON files (actions, conditions, npcs) are plain-text Story Creator data and may hold an action and condition vocabulary.

## 3. Strategy Justification

- **S4 (recommended):** external memory read plus synthetic input, with `stuntdouble-brain-ts` out of process. Touches the protection least.
- **S3 (conditional):** DLL proxy. The only candidates are app-folder DLLs (`bink2w64`, `oo2core_4`). Not verified; it would run inside the protected process, so it is not pursued for now.
- **S1/S2:** rejected because they need decompiling the protected exe.
- **S5:** not verified.

Note: the install folder holds the user's own earlier experiments: a Cheat Engine table that uses `aobscanmodule` on `ACOdyssey.exe` (its description mentions Breakpoint, which does not match) and a watcher `.py`/`.bat`. Whether they work is not verified. They are not copied into this repo.

## 4. Open Questions
1. Run a full section scan to confirm or rule out Denuvo.
2. Does Ubisoft Connect offline mode work?
3. Which memory structures hold the entity list, health and wind-up flags? (next step: runtime observation, with the user's go)

## 5. Verification Ledger
- [ ] Arena gates pass with the planned profile (`packages/stuntdouble-arena`)
- [ ] Smoke: F5 hand-off without stutter
- [ ] Interlocks: pause on cutscene/menu/loading/death
- [ ] 5-minute live combat competence
