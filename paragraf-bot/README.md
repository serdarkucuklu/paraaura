# ParaGraf — Günlük IG Şok-Kartı Botu

Her gün rastgele bir **yıl + tutar** seçip "o para bugün ne oldu?" şok-kartını (1080×1350)
üretir ve ParaGraf'a özel Instagram hesabına otomatik post eder. Veri kaynağı: `../paragraf_data.json`
+ canlı `../rates.json` (gram altın). Akış GitHub Actions cron ile 7/24 sunucusuz çalışır.

## Dosyalar
- `card_render.py` — Pillow ile kart çizimi + hesaplama (paragraf/calc.js ile aynı semantik).
- `paragraf_bot.py` — **generator**: yıl/tutar seç → `cards/latest.png` + `cards/latest.json` (caption).
- `publisher_ig.py` — **poster**: latest.json'daki raw URL + caption ile IG'ye post. **Idempotent**
  (Meta `media_publish` 403'te bile post oluşturabildiği için publish guard'lı; duplicate yok).
- `.github/workflows/paragraf-ig.yml` — günlük cron (19:00 TR) + manuel tetik.

## Mimari notlar
- **Görsel barındırma:** IG image post'u public bir URL ister (binary upload kabul etmez).
  Kart repoya commit edilir, IG `raw.githubusercontent.com/.../paragraf-bot/cards/latest.png`
  adresinden çeker — push sonrası anında canlı (Vercel deploy beklemez). Workflow bu yüzden
  **önce push, sonra publish** yapar.
- **Determinizm:** kart o günün (UTC) tarihine göre seed'lenir → aynı gün tekrar çalışınca
  aynı kart (generate idempotent).

## Kurulum (canlıya almak için — kullanıcı tarafı)
1. **Yeni IG hesabı** aç (örn. `@paragraf.tr`), **Professional/Business**'a çevir, bir Facebook
   Sayfası'na bağla.
2. **Meta App** (developers.facebook.com) → Instagram Graph API. Şunları al:
   - `INSTAGRAM_BUSINESS_ID` (IG Business hesabının id'si)
   - Uzun-ömürlü `META_ACCESS_TOKEN` (Page Access Token; `instagram_basic`,
     `instagram_content_publish`, `pages_read_engagement` izinleri).
3. GitHub repo (`serdarkucuklu/paraaura`) → Settings → Secrets and variables → Actions → **New secret**:
   - `PARAGRAF_IG_BUSINESS_ID`
   - `PARAGRAF_META_ACCESS_TOKEN`
4. Actions sekmesinden **"ParaGraf IG Sok-Karti" → Run workflow** ile manuel test et.

> Secret'lar tanımlı değilse `publisher_ig.py` post'u atlar (hata fırlatmaz) — generate adımı
> yine çalışır, kart üretilir. Yani secret'lar eklenene kadar bot zarar vermez.

## Lokal test
```bash
cd paragraf-bot
pip install -r requirements.txt
python card_render.py     # cards/sample.png üretir (gözle kontrol)
python paragraf_bot.py    # cards/latest.png + latest.json + caption
```
