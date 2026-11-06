Suggested model: Claude Haiku 5.5 (Medium) (mekanik, tek script ile toplu yeniden adlandırma, testle doğrulanır) · Fallback / Yedek: Claude Sonnet 5.5 (Medium) (yalnız testler kırmızı kalırsa)

Adımlar (sırayla, atlamadan): 1) `scripts/rename-project.mjs` yaz (eşleme tablosu aşağıda; dosya içerikleri + `git mv` ile dizin/dosya adları; `_claude/`, `.git/`, `LICENSE`'ın MPL gövdesi hariç). 2) `--dry-run` çalıştır, değişecek dosya sayısını yaz. 3) Uygula. 4) Fixture'ları yeniden üret (`node packages/conformance/emit-reference.mjs` sonra `node packages/conformance/gen-fixtures.mjs`). 5) Kök `npm test`. 6) Kabul grep'i. Kırmızı kalırsa 2 denemeden sonra dur ve hatayı raporla.
Önkoşul: 003 commit edilmiş olmalı

# 004 — AUTOMA → Stuntdouble yeniden adlandırma

## Neden
"AUTOMA", GitHub'da 21.7K yıldızlı `AutomaApp/automa` ile çakışıyor: arama ve atıf kaybı. Yeni ad **Stuntdouble**: oyuncu hikâyede kalır, dövüşü dublör oynar. Alt başlık: "Competent combat hand-over for story-driven single-player games".

## Hedef (önce script yaz: `scripts/rename-project.mjs`, kuru çalıştırma + uygulama)
1. Metin: `AUTOMA` → `STUNTDOUBLE` (başlık/sabit bağlamında `Stuntdouble`), `Autonomous Play Architecture` → alt başlık, `automa` (slug/URL) → `stuntdouble`, `@automa/*` → `@stuntdouble/*`.
2. Kod adları: `AutomaBrain` → `StuntBrain`, `AutomaRuntime` → `StuntRuntime`, `AutomaSeams` → `StuntSeams`, `AutomaDecision` → `StuntDecision`, namespace/modül `Automa`/`automa` → `Stuntdouble`/`stuntdouble`. Dizinler: `packages/automa-*` → `packages/stuntdouble-*`, `skills/automa` → `skills/stuntdouble`, `include/automa/automa_brain.hpp` → `include/stuntdouble/stunt_brain.hpp`, `automa_brain.lua` → `stunt_brain.lua`. Fixture üretici + runner + CI yolları güncellenir; fixture'lar yeniden üretilir (davranış değişmez, expected sayıları birebir aynı).
3. `.claude-plugin/plugin.json`, CITATION.cff, NOTICE, LICENSE başlığı, README BibTeX, CLAUDE.md ve AGENTS.md repo URL'si → `https://github.com/yusufgunay-esq/stuntdouble`. Atıf: "Günay, Y. (2026). Stuntdouble: Competent combat hand-over for story-driven single-player games."
4. `_claude/` altındaki eski iş emri/raporlar DEĞİŞMEZ (tarihsel kayıt).
5. Kabul: `grep -rniI "automa" --exclude-dir=.git --exclude-dir=_claude .` yalnız bilinçli kalanlar (ör. "formerly AUTOMA" notu README'de bir kez); kök `npm test` yeşil; 4 runner yeşil.

## Orkestratör yapar (ajan değil)
`gh repo rename stuntdouble` + `git remote set-url origin ...` + push + CI.

Commit/push YOK. Rapor: `_claude/raporlar/004-ad-degisikligi-stuntdouble-rapor.md`.
