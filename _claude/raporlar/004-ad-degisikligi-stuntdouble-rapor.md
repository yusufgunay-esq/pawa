# 004 rapor: AUTOMA -> Stuntdouble

`scripts/rename-project.mjs` yazildi (--dry-run: 56 icerik / 21 tasima), uygulandi. `_claude/` ve LICENSE'in MPL govdesi (--- sonrasi) degismedi.
Tasinan: packages/automa-* -> stuntdouble-* (6), skills/automa -> skills/stuntdouble, include/automa/automa_brain.hpp -> include/stuntdouble/stunt_brain.hpp, automa_brain.lua -> stunt_brain.lua, AutomaBrain.cs/AutomaSeams.cs -> StuntBrain.cs/StuntSeams.cs. Kod adlari: Stunt{Brain,Runtime,Seams,Decision,Math,Kernel}; namespace Stuntdouble.
Fixture yeniden uretildi (38 senaryo, expected sayilari ayni).

## Test
- npm test yesil (TS, seams, arena ALL GATES PASS, validate, fixtures taze; cs --optional atlandi: dotnet yok).
- C# (VS2019 csc) 38/38, C++ (pip ziglang) 38/38, Lua (pip lupa, cwd runners/lua) 38/38.
- Kabul grep: yalniz scripts/rename-project.mjs (eslesme tablosu) + automatic/automated.

## Açık sorular, sapmalar
- "formerly AUTOMA" notu README'ye eklenmedi (karar bekliyor). README alt baslik/atif metni otomatik degisti, elle gozden gecirilmeli.
- `automa-atlas` / `by.automa.runs` ornekleri de stuntdouble'a cevrildi.
## Yapılamayanlar
- Commit/push, gh repo rename, remote set-url (orkestratore ait).
## Kalan işler
- 005/006 emirleri ve README formerly notu; CI'da Lua 5.4/LuaJIT ve dotnet kosusu.
