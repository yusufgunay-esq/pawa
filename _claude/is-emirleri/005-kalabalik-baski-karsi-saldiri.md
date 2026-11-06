Suggested model: Claude Sonnet 5.5 (High) (oyun YZ'si teşhisi + 4 dilde çekirdek) · Fallback / Yedek: Gemini 3.8 Flash (High)
Önkoşul: 004 (adlar Stuntdouble)

# 005 — Kalabalık baskı altında karşı saldırı + 16 m ötesi okçu

## Sorun (003 raporundan)
- 3+ yakın düşmanda beyin kalıcı DEFENSIVE'e kilitleniyor (pressure > 0.72), hiç karşı saldırmıyor. Zor kademe bu yüzden 2 yakın düşmanla kuruldu: test zaafa göre ayarlanmış. Aksiyon oyunlarında en yaygın durum kalabalık.
- 16 m ötesindeki okçu wind-up'ına tepki yok.
- `aggression` duel'de 0.3–0.6 arası neredeyse düz.

## Hedef
1. **Karşı saldırı penceresi:** başarılı parry/dodge sonrası, düşmanın toparlanma (recovery) penceresinde ve stamina rezervi uygunsa tek hedefe kısa ceza saldırısı; sonra yeniden savunma. Kalabalıkta konumlanma: düşmanları tek hatta toplayan yay hareketi (influence map'te en az eşzamanlı tehdit gelen kenar), köşeye sıkışmama. Kalıcı kilit yok: pressure histerezisli.
2. **Uzak okçu:** menzilli tehdit sınırı profile ya da düşmanın gerçek menziline bağlı (sabit 16 m değil); uzak okçuya siper/yanal hareket.
3. **Zor kademeye** `t4_crowd` ekle: 4 yakın düşman + 1 okçu. `--compare` kapısı: Stuntdouble ve native+Stuntdouble hayatta kalır, karşı saldırıyla düşman öldürür (yalnız kaçarak değil: `kills ≥ 1`, saldırı oranı > 0).
4. `aggression` 0.3–0.6 bandında da ölçülebilir eğim (komut/aktif tick).
5. Geriye uyum: eski expected yalnız bilinçli değişirse, gerekçesi raporda.

## Söylenmeyen ama gereken
- İzleyici gözüyle: kalabalıkta "geri geri kaçan" karakter sıkıcı ve hikâyeye aykırı; karşı saldırı görsel olarak okunur olmalı (aynı hamle spamı sınırı korunur).
- 4 runner yerelde (csc, ziglang, lupa) ve CI'da yeşil.

## Kabul
- Kök `npm test` yeşil; `run.mjs --compare` t3 ve t4_crowd kapıları geçer, README tablosu gerçek sayılarla.
- Commit/push YOK. Rapor: `_claude/raporlar/005-kalabalik-baski-karsi-saldiri-rapor.md`.
