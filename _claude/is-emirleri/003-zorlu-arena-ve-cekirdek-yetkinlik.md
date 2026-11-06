Suggested model: Claude Sonnet 5.5 (High) (oyun yapay zekâsı ayarı + 4 dilde çekirdek değişikliği, teşhis gerekir) · Fallback / Yedek: Gemini 3.8 Flash (High)
Önkoşul: 001, 002

# 003 — Zorlu arena + çekirdek yetkinlik açıkları

## Sorun (002 raporundan)
- Arena düşmanları zayıf: 8 senaryoda da oyuncuya 0 isabet. Kapılar iyi beyni kötüden ayırmıyor.
- 4.5 m dışındaki menzilli wind-up'a (okçu) çekirdek tepki vermiyor (`unreactableHit`).
- `aggression` 0.15–0.5 arası davranışı değiştirmiyor (eşikler 0.65 / 0.78): profil düğmesinin yarısı ölü.

## Hedef
1. **Arena düşman modeli** (seed'li, deterministik): eşzamanlı saldırı koordinasyonu (2+ düşman aynı anda), feint (sahte wind-up), değişken wind-up süresi, menzilli mermi (uçuş süresi, dodge ile kaçılabilir), kuşatma/arkadan yaklaşma, boss çok vuruşlu kombo. En az 3 zorluk kademesi.
   Kapı ayrımı kanıtı: aynı senaryoda (a) "naif bot" (en yakına koş-vur, Warband tarzı), (b) zayıf native AI, (c) AUTOMA, (d) native+AUTOMA katmanı. Hedef sıralama: (a) ve (b) zor kademede ölür ya da çok hasar alır; (c) ve (d) hayatta kalır, belirgin daha az hasar. Eşikler testte sabit. `run.mjs --compare` tablo basar.
2. **Menzilli tehdit:** çekirdek, menzilli düşmanın wind-up'ını ve uçan mermiyi algılar (`EntitySnapshot`'a geriye uyumlu opsiyonel alanlar: `isRanged`, mermi listesi ya da `projectileEta`). Tepki: yanal dodge/siper/yaklaşma, profile göre. 4 SDK'ya yay, yeni conformance senaryoları ekle.
3. **Sürekli profil:** `aggression` tüm aralıkta monoton etki etsin (ör. saldırı sıklığı / commit eşiği sürekli fonksiyon). Diğer 4 düğme için de arena'da monotonluk testi (en az: `reactionDelayMs` ↑ → kaçınma ↓, `preferredRange` ↑ → ortalama mesafe ↑).
4. **Geriye uyum kuralı:** eski expected değerleri yalnız davranış bilinçli değiştiyse değişir; değişen her senaryo raporda gerekçesiyle listelenir. 4 runner yerel ve CI'da yeşil.

## Söylenmeyen ama gereken
- "Yetkin" ölçüsü insan izleyici için de makul olmalı: salınım, duvara sürtünme, aynı hamleyi spamlama ölçülür ve sınırlanır (arena metriği).
- `--html` oynatma yeni düşmanları ve mermileri gösterir; karşılaştırma için iki ajanı yan yana gösterebilirse daha iyi (opsiyonel).
- README'deki arena bölümü karşılaştırma tablosuyla güncellenir (gerçek sayılar).

## Kabul ölçütleri
- Kök `npm test` yeşil; `run.mjs --compare` zor kademede (c)/(d) > (a)/(b) farkını gösterir.
- Menzilli wind-up senaryosunda `unreactableHit` kapıdan çıkarılmaz, karşılanır.
- Profil monotonluk testleri geçer.
- Commit/push YOK. Rapor: `_claude/raporlar/003-zorlu-arena-ve-cekirdek-yetkinlik-rapor.md`.
