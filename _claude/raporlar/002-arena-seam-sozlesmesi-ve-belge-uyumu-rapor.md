# 002 rapor — Arena, seam sözleşmesi, belge/araç uyumu (+ ek kapsam A/B/C, engage politikası)

## Yapılanlar
- `packages/automa-seams-ts`: `PerceptionSeam`, `InputSeam`, `InterlockSeam`, opsiyonel `NativeAiSeam`, `AutomaRuntime`. Kilit/manuel/OFF/STANDBY'da command-steer yazılmaz (en çok bir nötr `release`). `engage: 'onCombat'` (varsayılan: düşman görünce devral, 2 sn düşmansız kalınca geri ver; CRUISE içeren maske hep devrede) / `'manual'` (`toggleKey` ayarı, sabit tuş yok). Native AI temel katman; AUTOMA yalnız refleks (parry/dodge/heal), düşük can, DEFENSIVE altında saldırı durumlarında geçersiz kılar ve `overrides` listesine sebebi yazar. C# eşi: `packages/automa-brain-cs/AutomaSeams.cs` (arayüzler + kural yorumu, csc ile derlendi).
- `packages/automa-arena`: seed'li deterministik XZ simülatörü (`src/sim.ts`), 8 senaryo (`scenarios.ts`), kapılar (`gates.ts`), `run.mjs` (`--scenario --seed --json --html`), tek dosyalık canvas oynatma (`html.ts`, telefon genişliği). Node'da flag yoksa kendini `--experimental-strip-types` ile yeniden başlatır.
- Kök `package.json`: `test:seams`, `test:arena`, `arena`; `npm test` hepsini içerir. `ci.yml`'e seam + arena adımları eklendi.
- Belgeler: README, SKILL (Stage 3/5/6/7), strategies.md, brains.md, ROADMAP, WHITEPAPER, `_template/REPORT.md` Gate 1; `_template/adapter-checklist.md` yeni. F5/F6/F7 anlatımı kaldırıldı (tuş opsiyonel). "Frame-perfect" iddiası kaldırıldı (kalan tek geçiş `schemas/profile.schema.json` discipline açıklaması, dokunulmadı). İki örnek rapora bağlantı (AC Odyssey, Ghost Recon). Motivasyon örneği oyun adsız.
- `scripts/contribute-recipe.mjs`: PR/gh/git yok; `--dry-run` denetim, `--bundle out.json --user-approved` yerel paket; `ATLAS_INTAKE_OPEN=false` -> "henüz açık değil", dosya yerelde.
- Lisans/atıf: NOTICE AUTOMA + doğru URL; README BibTeX = CITATION.cff `preferred-citation` metni; CFF abstract yeni mimari; `LICENSE-CC-BY-4.0.md` (paper/ + docs/). Kod MPL-2.0.

## Test sonuçları (`npm test`, yeşil)
TS çekirdek 8/8, seams 10/10, arena 12/12 (8 senaryo x seed 1-5 + determinizm + DEFENSIVE 0 saldırı + native karşılaştırma + profil etkisi), arena tablosu ALL GATES PASS, validate 5 belge OK, fixtures taze, C# runner bu makinede atlandı (dotnet yok; AutomaBrain.cs + AutomaSeams.cs csc ile derlendi).

## Arena kapı tablosu (seed 1, hepsi geçti)
duel geçti · surround3 geçti · archer_melee geçti · boss_defensive geçti (0 saldırı komutu, 13/14 parry) · cruise_ambush geçti (4/4 waypoint) · ambush_oncombat geçti (standby 0 girdi, devralma 0 sn, geri verme 2 sn) · native_overlay geçti (AUTOMA'lı: can 100, 0 isabet; yalnız native: can 0, öldü; 488 override) · interlock geçti (kilit/manuelde 0 girdi, manuel geri verme aynı tick).

## Profil etkisi (duel, aggression 0.95 vs 0.15)
Saldırı komutu seed1: 131 vs 69; seed2: 113 vs 69; seed3: 114 vs 70; isabet 6 vs 4. 0.15 ile 0.5 arası fark yok (basamak: stance AGGRESSIVE >=0.65, STRIKE_COMBO >0.78). Çekirdekte kopukluk yok, düzeltme gerekmedi.

## Çekirdekte düzeltilen sapma
Bu işte yok (001'dekiler: C# `Holds`, `new EntitySnapshot[]`, `f` literalleri, nodiscard).

## CI
001 koşusu success (41 sn). Bu işin yeni adımları (seams/arena) henüz push edilmedi, ilk koşuları bekliyor.

## Açık sorular, sapmalar
1. Sapma: "telegraflı vuruşların >=%X'i parry/dodge" yerine "kaçınılan oran" (parry + dodge + menzil dışı kalan; isabet olmayan). Brain çoğunlukla geri çekilerek kaçınıyor (duel: 3 telegraftan 3'ü menzil dışı, 0 parry). Bu yüzden parry/dodge sayısı ayrıca tabloda yazılı; boss_defensive'de 13/14 parry. Sim düşmanları (hız 3.3 m/s) oyuncuyu (4 m/s) yakalayamıyor: kapılar tek başına zayıf ayırt edici; ayırt ediciliği `native_overlay` (native tek başına 0%/öldü) kanıtlıyor. Daha sıkı düşman modeli ayrı iş.
2. Menzil dışı (>4.5 m) okçu wind-up'ına beyin tepki vermiyor (çekirdek imminence yarıçapı); `unreactableHit` olarak raporlanır, kapıdan hariç. Çekirdeği değiştirmek fixture'ları bozar, karar Yusuf'ta.
3. `HUMAN_PASS_THROUGH` kararı (001) belgelendi. Tasarım kararı: CRUISE içeren maske `onCombat`'ta hep devrede sayılır (aksi halde cruise hiç çalışmazdı).
4. `schemas/` lisansı belgede MPL (CC BY yalnız paper/ + docs/); eski README schemas'ı CC BY demişti.

## Yapılamayanlar
- C# runner yerelde (dotnet yok); C++/Lua yeni işte değişmedi.
- Gerçek oyunda canlı doğrulama (kapsam dışı).

## Kalan işler
- Commit/push (orkestratör), ardından yeni CI adımlarını izle (`gh run view --log-failed`).
- C#/C++/Lua'ya AutomaRuntime portu (şimdilik yalnız TS referansı + C# arayüzleri).
- Daha zorlayıcı sim düşman modeli; menzil dışı okçu için çekirdek kararı.
