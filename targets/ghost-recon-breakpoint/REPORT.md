# AUTOMA Target Report: Ghost Recon Breakpoint (version not verified / PC, Ubisoft Connect)

- **Target Slug:** `ghost-recon-breakpoint`
- **Status:** `ABORTED` (Stage 1 ethics gate)
- **Brain Runtime Linked:** none
- **Strategy Tier Used:** none (S1–S5 all rejected)
- **Profile:** not derived

**DECISION: ABORT.** Denuvo-protected executable plus online services and anti-cheat components. This falls outside AUTOMA's scope (single-player, offline, no anti-cheat, never work against DRM).

---

## 1. Binary & Engine Fingerprint

Install path: `D:\Games\Ghost Recon Breakpoint`. Method: passive only (file listing, PE headers/sections/imports, raw string search, Authenticode). The game was never launched and nothing was modified.

| Property | Observed Value | Evidence |
|---|---|---|
| Engine & Runtime | `ScimitarEngineWindowClass` string in exe (Anvil family). Data in `DataPC*.forge`. The "AnvilNext 2.0" label is not in the binary (not verified). | raw string search; file listing |
| Launcher | Ubisoft Connect (`uplay_r1_loader64.dll`) | file listing |
| DRM | **Denuvo confirmed**: `Denuvo Timing` at file offset `0x83CA638` in `GRB.exe` | raw string search |
| Anti-Cheat / Online | Service key list contains `BattlEye` (`0x456F360`) and `EasyAntiCheat` (`0x456F400`) next to `OnlineSync`, `ServiceEventsDGS`, `Hermes`, `PlayerStats`. No BE/EAC client files or `.sys` drivers in the install folder (weak negative; which one is active cannot be confirmed without launching). | raw string search; file listing |
| Executables | `GRB.exe`, `GRB_vulkan.exe`, `GRB_UPP.exe`, `GRB_UPP_vulkan.exe`; signed; obfuscated sections (`.rsrc` 69 MB, `.idata` 389 MB, `.TGT0`/`.TGT1`) | PE headers; Authenticode |
| Offline mode | not verified | — |

## 2. Seams

Not derived. Aborted before Stage 2.

## 3. Strategy Justification

- **S1/S2/S3:** need analysis of, or injection into, the Denuvo-protected process. That is working against DRM. Rejected.
- **S4:** reading memory from a process that ships anti-cheat and online telemetry risks account action and is out of scope. Rejected.
- **S5:** needs encounter hooks inside the protected process. Rejected.

## 4. Verification Ledger

Not reached.

## 5. What would change this decision
A future official offline build without Denuvo or anti-cheat. Until then this target stays closed.
