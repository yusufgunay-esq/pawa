# Engines and loaders (starting points, verify per game and version)

| Engine / family | Usual mod entry | Notes |
|---|---|---|
| Unity Mono | BepInEx, MelonLoader | Managed code, Harmony patches, easiest case. Decompile with REA managed tools. |
| Unity IL2CPP | BepInEx IL2CPP, MelonLoader | Dump metadata first (Il2CppDumper is in the reverse lab), then patch through the interop assemblies. |
| Unreal Engine | UE4SS (Lua / C++ mods) | Blueprint and UObject reflection exposes pawns and controllers. Dump the object list first. |
| Source engine | SourceMod, VScript | Fake-client commands and bot entities are native concepts. |
| Native, in-house engines | DLL proxy / injection, runtime hooks | Needs REA native analysis, hook at the controller or input read. Check anti-cheat first. |
| Electron / JS games | Patch the bundle, runtime script | REA JavaScript tools. |
| REDengine (Cyberpunk) | Cyber Engine Tweaks, RED4ext | Behaviour trees and TweakDB are data driven. |
| Anvil / Ubisoft titles and other large proprietary engines | Usually native hooking only | Often protected. Confirm single-player is unprotected before starting; stop if not. |

Before building, answer: can I load code at all, can I read player and enemy state, can I issue commands? If any answer is no, say so and choose S5 or stop.
