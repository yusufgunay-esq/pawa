# Engine & Mod Loader Matrix

Verify the exact engine build and binary architecture with REA before selecting a loader and Stuntdouble Brain runtime:

| Engine Family | Primary REA Recon Tool | Mod Loader / Injection Vector | Stuntdouble Brain Package |
|---|---|---|---|
| **Unity (Mono)** | `inspect_managed_artifact` | `BepInEx 5/6` or `MelonLoader` (HarmonyX) | [`packages/stuntdouble-brain-cs`](../../../packages/stuntdouble-brain-cs/StuntBrain.cs) |
| **Unity (IL2CPP)** | `open_binary` + `Il2CppDumper` | `BepInEx BE (IL2CPP)` or `MelonLoader` | [`packages/stuntdouble-brain-cs`](../../../packages/stuntdouble-brain-cs/StuntBrain.cs) |
| **Unreal Engine 4 / 5** | `open_binary` + UObject Dump | `UE4SS` (Lua or C++ API) | [`packages/stuntdouble-brain-lua`](../../../packages/stuntdouble-brain-lua/stunt_brain.lua) or [`stuntdouble-brain-cpp`](../../../packages/stuntdouble-brain-cpp/include/stuntdouble/stunt_brain.hpp) |
| **REDengine 4** | `open_binary` + TweakDB | `Cyber Engine Tweaks (CET)` / `RED4ext` | [`packages/stuntdouble-brain-lua`](../../../packages/stuntdouble-brain-lua/stunt_brain.lua) |
| **Source / Source 2** | `open_binary` + VScript | `SourceMod` / `VScript` | [`packages/stuntdouble-brain-lua`](../../../packages/stuntdouble-brain-lua/stunt_brain.lua) |
| **AnvilNext / Proprietary C++** | `open_binary` + `xrefs` | Native DLL Proxy (`dxgi.dll` / `version.dll`) + `MinHook` | [`packages/stuntdouble-brain-cpp`](../../../packages/stuntdouble-brain-cpp/include/stuntdouble/stunt_brain.hpp) |
| **Electron / Web / JS** | `analyze_javascript_application` | Bundle Patch / Runtime Hook | [`packages/stuntdouble-brain-ts`](../../../packages/stuntdouble-brain-ts/src/index.ts) |
