Suggested model: Claude Sonnet 5.5 (High) (4 dilde aynı mantık, çapraz dil eşleşmesi kritik) · Fallback / Yedek: Gemini 3.8 Flash (High) (spesifikasyon tam, mekanik port)

# 001 — Birleşik davranış bayrakları + gerçekten koşan C#/C++/Lua uyumluluk testleri

## Sorun
- `AutonomyMode` tek seçimli; ROADMAP'teki `Behaviors` bayrak kümesi yazılmamış.
- `packages/conformance/fixtures/*.cs|hpp|lua` üretiliyor ama onları çalıştıran runner yok: C#/C++/Lua portlarının TS ile aynı karar verdiği kanıtsız.
- Kök `package.json` ve CI yok; `npm test` tek paketi koşuyor.

## Hedef
1. **Bayraklar (4 SDK, TS referans):** `Behaviors = COMBAT | ASSIST | CRUISE | DEFENSIVE | COMMAND` (bit maskesi; TS'de `number` + `Behavior` sabitleri). `tick(...)` hem eski `AutonomyMode` stringini hem bayrak maskesini kabul etsin; eski 5 mod = adlı preset (`FULL_COMBAT=COMBAT`, `CO_PILOT=ASSIST`, `GRIND_AUTOPILOT=CRUISE|COMBAT`, `SHADOW_SURVIVAL=DEFENSIVE`, `COMMANDER=COMBAT|COMMAND`). Mevcut 17 senaryonun beklenen çıktısı DEĞİŞMEMELİ.
   Çakışma kuralları (ROADMAP'teki gibi, sabit): DEFENSIVE ofansı ezer; COMBAT açık ve düşman varken ASSIST etkisiz; CRUISE yalnız düşman yokken çalışır; ASSIST+CRUISE: düşman yokken cruise, düşman varken insan geçişi + refleks müdahale.
   Birleşik olmayan durum: maske 0 → insan girdisi geçer, hiçbir şey yapmaz.
2. **Senaryolar:** `scenarios.ts`'e en az 6 kombinasyon senaryosu (CRUISE+COMBAT pusu, ASSIST+CRUISE ikisi, DEFENSIVE+COMMAND, DEFENSIVE+COMBAT, maske 0). `emit-reference.mjs` + `gen-fixtures.mjs` yeniden üret.
3. **Runner'lar:** `packages/conformance/runners/` altında
   - `cs/` küçük konsol projesi (`dotnet run`), `AutomaBrain.cs` + `fixtures.cs` derler, expected ile karşılaştırır (float tolerans 1e-6, aynı alanlar `emit-reference` ne yazıyorsa).
   - `cpp/runner.cpp` (C++20, tek dosya, `g++ -std=c++20`).
   - `lua/runner.lua` (Lua 5.4 / LuaJIT).
   Her biri: `N/N passed`, başarısızlıkta senaryo id + alan; çıkış kodu ≠0.
   Not: bu makinede yalnız `node` ve `dotnet` var; C++ ve Lua'yı CI'da doğrula.
4. **Kök `package.json`:** `npm test` = TS testleri + `validate-profiles` + fixture tazeliği kontrolü (üretip `git diff --exit-code` ya da içerik karşılaştırması) + (varsa) C# runner. `npm run conformance:all` hepsi.
5. **CI:** `.github/workflows/ci.yml` — ubuntu: node 22+, dotnet 8, g++ ≥12, lua5.4; tüm runner'lar + `npm test`. Ücretsiz public repo dakikası, gizli anahtar yok.

## Söylenmeyen ama gereken
- Portlarda bulunan sapmalar düzeltilir (TS referanstır); düzeltilen her sapma raporda.
- Eski `AutonomyMode` API'si kırılmaz (geriye uyum).
- Her bayrak mantığı her 4 dilde aynı satır düzeninde, yorumla işaretli.

## Kabul ölçütleri
- `npm test` (kök) yeşil; C# runner yerelde tüm senaryolarda geçer.
- C++ / Lua runner'ları yazılmış, CI dosyasında çağrılıyor.
- Eski 17 senaryonun expected değerleri bit bit aynı.
- Commit/push YOK (orkestratör yapar). Rapor: `_claude/raporlar/001-davranis-bayraklari-ve-dogrulanan-portlar-rapor.md` (Yapılanlar / Açık sorular, sapmalar / Yapılamayanlar / Kalan işler).
