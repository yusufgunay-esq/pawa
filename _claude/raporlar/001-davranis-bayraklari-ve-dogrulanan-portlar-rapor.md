# 001 rapor — Davranış bayrakları + koşan C#/C++/Lua uyumluluk testleri

## Yapılanlar
- 4 SDK'da `Behaviors` bit maskesi (COMBAT=1, ASSIST=2, CRUISE=4, DEFENSIVE=8, COMMAND=16) + 5 eski modun preset eşlemesi. TS `tick()` string veya maske alır; C#/C++/Lua'da eski `Tick/tick` korundu, yeni `TickBehaviors/tick_behaviors/tickBehaviors`. Aynı `[FLAGS]` yorumlu blok her dilde aynı satır düzeninde.
- Kurallar: DEFENSIVE ofansı ezer; ASSIST yalnız (COMBAT ve düşman var) değilse aktif; CRUISE yalnız düşman yokken; ASSIST+CRUISE: temiz=cruise, düşman=insan geçişi+refleks; aktif davranış yoksa (maske 0, CRUISE tek başına+düşman, COMMAND tek başına) `HUMAN_PASS_THROUGH`, intercept=false, steering 0, speed 0.
- 10 yeni kombinasyon senaryosu (toplam 27). Eski 17 expected değeri bit bit aynı (`git diff --numstat expected.json` = 216 ekleme / 0 silme).
- `gen-fixtures.mjs`: expected tabloları da native üretiliyor (`expected.cs/.hpp/.lua`, JSON ayrıştırıcı gerekmez); fixture'a `has_autonomy` + `behaviors` eklendi.
- Runner'lar: `runners/cs` (csproj+Program.cs), `runners/cpp/runner.cpp`, `runners/lua/runner.lua`. Eski adlı senaryolar hem enum hem maske yolundan koşuyor (eski API kanıtı).
- Kök `package.json` (`test`, `test:ts`, `validate`, `fixtures:check`, `fixtures:gen`, `conformance:*|all`), `scripts/check-fixtures-fresh.mjs`, `scripts/run-conformance.mjs`, `.github/workflows/ci.yml` (node 22, dotnet 8, g++-12, lua5.4; hepsi katı).
- TS testleri: 6 → 8 (preset=maske bit bit, çakışma kuralları).

## Test sonuçları
- `npm test` (kök): TS 8/8, validate-profiles 5 belge OK, fixtures taze (8 dosya), C# runner atlandı (bu makinede dotnet SDK yok).
- C# runner: VS2019 Roslyn `csc.exe` ile derlenip koşturuldu: 27/27.
- C++ runner: pip `ziglang` (clang, `-std=c++20`) ile: 27/27.
- Lua runner: pip `lupa` (Lua 5.5) ile: 27/27 (5.4/LuaJIT'te CI doğrulayacak; `hasFlag` bitwise operatörsüz yazıldı, LuaJIT uyumlu).

## Açık sorular, sapmalar (portlarda bulunan ve düzeltilen)
1. C# `AutomaBrain.cs`: `WorldState.Holds(...)` hiç tanımlı değildi, port DERLENMİYORDU (3 çağrı). `Holds` eklendi (anahtar yok ya da değer farklı = false; TS `current[k] === v` ile aynı).
2. `gen-fixtures.mjs`: hostile'sız senaryolarda C# `new[] { }` derlenmiyordu; `new EntitySnapshot[]` yapıldı.
3. `gen-fixtures.mjs`: C# ve C++ fixture'larında `f` son ekli literaller (`1.8f`) double'a genişleyip TS'in double'ından farklı değer üretiyordu; kaldırıldı (artık tam double).
4. C++ `automa_brain.hpp`: `planner_.plan(...)` nodiscard uyarısı `static_cast<void>` ile giderildi.
5. Tasarım kararı (ROADMAP'te yoktu, onay iste): "aktif davranış yok" durumunun çıktısı (HUMAN_PASS_THROUGH + steering 0 + speed 0); stance/utility yine hesaplanıp raporlanır. `AutomaDecision.autonomyMode` maske çağrısında maskenin kendisini yansıtır (C#/C++/Lua'da maske yolunda FullCombat, ayrıca `behaviors` alanı).
6. Port `Cycle*AutonomyMode` hâlâ 5 preset döngüsü; bayrak maskesi döngüsü yok.

## Yapılamayanlar
- Yerelde `dotnet run` (SDK yok), `g++`, `lua5.4` ile doğrulama; yerine yukarıdaki alternatif araçlar kullanıldı. İlk gerçek tam CI koşusu henüz yapılmadı.

## Kalan işler
- Commit/push (orkestratör). CI'ın ilk koşusunu izle (özellikle `dotnet run` csproj yolu ve Lua 5.4).
- `docs/`, `targets/` dokunulmadı: README/ROADMAP'te "Behaviors" ve çalıştırma komutlarının güncellenmesi ayrı iş.
- İsteğe bağlı: bayrak maskesi için oyun entegrasyon API'si (`set_behaviors`) ve `ASSIST+DEFENSIVE` gibi kalan kombinasyonlar için senaryo.
