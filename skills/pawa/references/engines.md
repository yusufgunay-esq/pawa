# Engine & Mod Loader Matrix

Verify the exact engine build and binary architecture with REA before selecting a loader and PAWA Brain runtime:

| Engine Family | Primary REA Recon Tool | Mod Loader / Injection Vector | PAWA Brain Package |
|---|---|---|---|
| **Unity (Mono)** | `inspect_managed_artifact` | `BepInEx 5/6` or `MelonLoader` (HarmonyX) | [`packages/pawa-brain-cs`](../../../packages/pawa-brain-cs/PawaBrain.cs) |
| **Unity (IL2CPP)** | `open_binary` + `Il2CppDumper` | `BepInEx BE (IL2CPP)` or `MelonLoader` | [`packages/pawa-brain-cs`](../../../packages/pawa-brain-cs/PawaBrain.cs) |
| **Unreal Engine 4 / 5** | `open_binary` + UObject Dump | `UE4SS` (Lua or C++ API) | [`packages/pawa-brain-lua`](../../../packages/pawa-brain-lua/pawa_brain.lua) or [`pawa-brain-cpp`](../../../packages/pawa-brain-cpp/include/pawa/pawa_brain.hpp) |
| **REDengine 4** | `open_binary` + TweakDB | `Cyber Engine Tweaks (CET)` / `RED4ext` | [`packages/pawa-brain-lua`](../../../packages/pawa-brain-lua/pawa_brain.lua) |
| **Source / Source 2** | `open_binary` + VScript | `SourceMod` / `VScript` | [`packages/pawa-brain-lua`](../../../packages/pawa-brain-lua/pawa_brain.lua) |
| **AnvilNext / Proprietary C++** | `open_binary` + `xrefs` | Native DLL Proxy (`dxgi.dll` / `version.dll`) + `MinHook` | [`packages/pawa-brain-cpp`](../../../packages/pawa-brain-cpp/include/pawa/pawa_brain.hpp) |
| **Electron / Web / JS** | `analyze_javascript_application` | Bundle Patch / Runtime Hook | [`packages/pawa-brain-ts`](../../../packages/pawa-brain-ts/src/index.ts) |
