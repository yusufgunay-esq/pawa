# Engine & Mod Loader Matrix

Verify the exact engine build and binary architecture with REA before selecting a loader and AUTOMA Brain runtime:

| Engine Family | Primary REA Recon Tool | Mod Loader / Injection Vector | AUTOMA Brain Package |
|---|---|---|---|
| **Unity (Mono)** | `inspect_managed_artifact` | `BepInEx 5/6` or `MelonLoader` (HarmonyX) | [`packages/automa-brain-cs`](../../../packages/automa-brain-cs/AutomaBrain.cs) |
| **Unity (IL2CPP)** | `open_binary` + `Il2CppDumper` | `BepInEx BE (IL2CPP)` or `MelonLoader` | [`packages/automa-brain-cs`](../../../packages/automa-brain-cs/AutomaBrain.cs) |
| **Unreal Engine 4 / 5** | `open_binary` + UObject Dump | `UE4SS` (Lua or C++ API) | [`packages/automa-brain-lua`](../../../packages/automa-brain-lua/automa_brain.lua) or [`automa-brain-cpp`](../../../packages/automa-brain-cpp/include/automa/automa_brain.hpp) |
| **REDengine 4** | `open_binary` + TweakDB | `Cyber Engine Tweaks (CET)` / `RED4ext` | [`packages/automa-brain-lua`](../../../packages/automa-brain-lua/automa_brain.lua) |
| **Source / Source 2** | `open_binary` + VScript | `SourceMod` / `VScript` | [`packages/automa-brain-lua`](../../../packages/automa-brain-lua/automa_brain.lua) |
| **AnvilNext / Proprietary C++** | `open_binary` + `xrefs` | Native DLL Proxy (`dxgi.dll` / `version.dll`) + `MinHook` | [`packages/automa-brain-cpp`](../../../packages/automa-brain-cpp/include/automa/automa_brain.hpp) |
| **Electron / Web / JS** | `analyze_javascript_application` | Bundle Patch / Runtime Hook | [`packages/automa-brain-ts`](../../../packages/automa-brain-ts/src/index.ts) |
