Suggested model: Claude Sonnet 5.5 (High) (yeni katman + seam tasarımı, 4 dil) · Fallback / Yedek: Gemini 3.8 Flash (High)
Önkoşul: 005

# 006 — Canlı talimatlar (FM tarzı) + ObjectiveSeam

## Neden
Hikâye için oynayan oyuncu karakteri sürmez, kenardan talimat verir ("kaç", "bastır", "kapıya ilerle"). Çizgisel oyunlarda asıl gereken "ilerlemen gereken yere ilerle".

## Hedef
1. **Order katmanı (çekirdek, 4 SDK):** `Order = RETREAT | PUSH | HOLD | ADVANCE | STEALTH | FOCUS(targetId)`, her biri `until` ile biter: süre (s), koşul (`noHostiles`, `reachedObjective`, `targetDead`) ya da yeni emir. Emir profil ve Behaviors üstüne biner; bitince normal davranış. Güvenlik refleksleri (ölümcül wind-up'ta parry/dodge, kritik can) emirden üstündür, `RETREAT` hariç hiçbir emir intihar etmez.
   - `RETREAT`: influence map en güvenli cebe çekil, takipte savunmada kal.
   - `PUSH`: commit eşiğini düşür, baskı.
   - `HOLD`: konumda/siperde kal, yalnız menzile gireni karşıla.
   - `ADVANCE`: objective yoluna git, yalnız yolu kesen düşmanla dövüş.
   - `STEALTH`: görüş konilerinden kaçın (arena'da basit koni), saldırma.
   - `FOCUS`: hedef seçimini kilitle.
2. **`ObjectiveSeam`** (seams-ts + C# arayüzü): `current()` → konum ya da yol noktaları, `reached()`. Yoksa yedek: keşfedilmemiş yöne/son waypoint'e ilerle. `targets/_template/adapter-checklist.md`'ye ekle (görev işaretçisini bellekte bulma ipucu).
3. **Giriş kanalları:** (a) `StuntRuntime.issue(order)` API'si; (b) kısayol/radyal menü eşlemesi ayarı (`orderKeys`, sabit tuş yok); (c) doğal dil: `scripts/parse-order.mjs "geri çekil sonra kapıya ilerle"` → emir dizisi JSON (kural tabanlı, TR+EN anahtar kelime; LLM yok). Ajanın (Claude vb.) sözü bu formata çevirmesi SKILL'de anlatılır. Dil modeli asla tick döngüsünde değildir.
4. **Arena testi:** her emir ölçülebilir etki: RETREAT → ortalama düşman mesafesi ↑; PUSH → saldırı oranı ↑; HOLD → yer değiştirme ↓; ADVANCE → objective'e varış süresi ↓ ve `reachedObjective`; STEALTH → tespit 0 (koni senaryosu); FOCUS → önce hedef ölür. Yeni çizgisel senaryo: koridor + kapı objective + yol üstünde düşmanlar.
5. Conformance: emirli yeni senaryolar, 4 runner yeşil.

## Söylenmeyen ama gereken
- Emir sırası (kuyruk) ve iptal; aynı anda tek aktif emir + kuyruk.
- Belgeler: README'ye "talimat ver" bölümü (örnek komutlar), SKILL'e çeviri kuralları.

## Kabul
- Kök `npm test` yeşil; her emir testi geçer; `parse-order` TR/EN 10 örnekte doğru.
- Commit/push YOK. Rapor: `_claude/raporlar/006-canli-talimatlar-ve-objective-seam-rapor.md`.
