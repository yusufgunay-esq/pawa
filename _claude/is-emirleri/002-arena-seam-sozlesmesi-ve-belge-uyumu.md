Suggested model: Claude Sonnet 5.5 (High) (simülasyon + adaptör sözleşmesi tasarım kararı içerir) · Fallback / Yedek: Gemini 3.8 Flash (High)
Önkoşul: 001 (Behaviors bayrakları)

# 002 — Arena (beynin gerçekten oynadığının kanıtı), Seam sözleşmesi, belge/araç uyumu

## Sorun
- Beyin yalnız tek-tick birim testleriyle sınanıyor; zamanla oynayan, ölçülen bir döngü yok. SKILL'deki "Tactical Competence Gate" elle izlemeye dayalı.
- Gerçek oyun adaptörünün uyacağı arayüz (Seam'ler + güvenlik kilitleri) kodda tanımlı değil, yalnız prose.
- `scripts/contribute-recipe.mjs` ve SKILL Stage 7 kod reposuna PR açıyor; ROADMAP kararı (atlas ayrı depo, tek yazar, onaylı gönderim) ile çelişiyor. README/SKILL "5 mod" anlatıyor, bayrakları değil.

## Hedef
1. **`packages/automa-seams-ts/`** (bağımlılıksız): `PerceptionSeam` (self, hostiles, waypoint okur), `InputSeam` (komut + steering yazar), `InterlockSeam` (cutscene/menu/loading/manualOverride), `AutomaRuntime` (seam'leri + `AutomaBrain` + profil + Behaviors bağlar; F5 aç/kapa, kilit aktifse girdiye dokunmaz, manuel girdide anında geri verir). Gerçek adaptör bunu taklit eder; C# için aynı arayüzlerin kısa bir eşi `packages/automa-brain-cs/AutomaSeams.cs`.
2. **`packages/automa-arena/`**: deterministik (seed'li) 2D XZ simülatör, `AutomaRuntime`'ı seam'ler üzerinden sürer. Basit kurallar: düşmanlar yaklaşır, wind-up süresi sonra vurur; parry penceresi; dodge; hasar/can; engeller; waypoint ve loot düğümleri.
   Senaryolar (en az 5): düello, 3'lü kuşatma, okçu + yakın dövüşçü, boss kombosu (DEFENSIVE), cruise + pusu (CRUISE|COMBAT).
   **Otomatik kapılar** (eşikler senaryo başına sabit, test ile korunur): hayatta kalma, telegraflı vuruşların ≥%X'i parry/dodge, DEFENSIVE'de 0 saldırı, yön salınımı (ardışık steering işaret değişimi) sınırlı, kilit aktifken 0 girdi.
   `node packages/automa-arena/run.mjs [--scenario id] [--seed n] [--json]` özet tablo basar. `--html out.html` ile tek dosyalık, bağımlılıksız oynatma (canvas, adım kaydı gömülü) üretir.
   Kapılar kök `npm test`'e eklenir.
3. **Profil etkisi gerçek olmalı:** aynı senaryoda `aggression` yüksek/düşük profil ölçülebilir fark (saldırı sayısı) üretmeli; testle kanıtla. Fark yoksa çekirdekteki kopukluğu bul ve düzelt (4 dile yay, 001 runner'ları yeşil kalsın).
4. **Belge uyumu:** README ve `skills/automa/SKILL.md` bayrak modeline, arena kapısına ve seam sözleşmesine göre güncellenir; abartılı iddialar ("frame-perfect", doğrulanmamış motorlar) kanıtla sınırlanır. Stage 7 ve `contribute-recipe.mjs`: kod reposuna PR yok; yerel doğrulama + kullanıcı onayı + atlas gönderim paketi (`--bundle out.json`), gönderim hedefi atlas henüz yoksa "henüz açık değil" der ve dosyayı yerelde bırakır. `targets/_template/` içine `adapter-checklist.md` (seam → arena kapısı eşlemesi).

5. **Belge kararları (Yusuf ile konuşuldu):** profil = persona değil, 5 ayar; hazır ayardan başlar, kullanıcı sözle ayarlar. Protagonist Fidelity (exe'den kahraman tarzı çıkarma) "ertelendi / isteğe bağlı" diye işaretlenir. Strateji merdiveninde erişilebilirse oyunun kendi yapay zekâsı (S1/S2) önce; DRM'li oyunda yalnız dış S4 (örnek: `targets/assassins-creed-odyssey/REPORT.md`, `targets/ghost-recon-breakpoint/REPORT.md` = ABORT örneği). README'de bu iki örneğe bağlantı. 001'in kararı belgelenir: aktif davranış yoksa `HUMAN_PASS_THROUGH`. F7 döngüsü 5 preset olarak kalır, belgede yazılır.
6. CI (`.github/workflows/ci.yml`) ilk koşuda kırmızıysa `gh run view --log-failed` ile bak ve düzelt.

## Söylenmeyen ama gereken
- Arena saf TS, `--experimental-strip-types` ile koşar, yeni npm bağımlılığı yok.
- Rastgelelik yalnız seed'li PRNG.
- HTML oynatma telefon genişliğinde de okunur.

## Kabul ölçütleri
- Kök `npm test` yeşil (001 + arena kapıları + seam testleri).
- `run.mjs` tüm senaryolarda kapıları geçer; raporda tablo.
- Commit/push YOK. Rapor: `_claude/raporlar/002-arena-seam-sozlesmesi-ve-belge-uyumu-rapor.md`.
