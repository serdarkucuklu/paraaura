"""ParaGraf gunluk IG sok-karti GENERATOR.

Gunluk olarak rastgele bir yil + tutar secer, paragraf_data.json + canli rates.json
(gram altin) ile sok degerini hesaplar, 1080x1350 karti uretir ve caption + meta yazar.
Posting AYRI adimda (publisher_ig.py) -> once kart repoya push'lanir, sonra IG raw URL'den ceker.

Determinizm: gun (UTC) bazli seed -> ayni gun tekrar calistirinca ayni kart (idempotent generate).
"""
import json
import os
import random
import sys
from datetime import datetime, timezone

import card_render as cr

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows cp1252 konsolunda TR karakter print'i
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)  # 07-para-hub-agent (paraaura repo koku)
CARDS = os.path.join(HERE, "cards")

# IG'nin cekecegi public raw URL (push sonrasi aninda canli; Vercel deploy beklemez)
RAW_BASE = "https://raw.githubusercontent.com/serdarkucuklu/paraaura/main/paragraf-bot/cards"

AMOUNT_POOL = [500, 1000, 2000, 5000, 10000, 25000, 50000, 100000]


def year_pool(data):
    """Yalniz veride GERCEKTEN var olan yillar (2025 haric; ->2026 icin anlamli boşluk)."""
    return sorted(int(y) for y in data["yillar"].keys() if y != "2025")

# Cesitlendirilmis hashtag havuzu (shadowban koruması + kesfedilebilirlik) — her gun alt-kume secilir
HASHTAG_POOL = [
    "#enflasyon", "#ekonomi", "#altın", "#dolar", "#paranınpulu", "#tasarruf",
    "#yatırım", "#asgariücret", "#zam", "#hayatpahalılığı", "#finans", "#bütçe",
    "#altınfiyatları", "#satınalmagücü", "#paraaura", "#kuraura", "#paragraf",
    "#geçmişvsbugün", "#türkiyeekonomisi", "#birikim",
]


def load_data():
    with open(os.path.join(BASE, "paragraf_data.json"), encoding="utf-8") as f:
        return json.load(f)


def build_guncel(data):
    """data.guncel'i kopyala; gram altini canli rates.json'dan override et (varsa)."""
    g = dict(data.get("guncel") or data["yillar"]["2025"])
    try:
        with open(os.path.join(BASE, "rates.json"), encoding="utf-8") as f:
            r = json.load(f)
        for m in r.get("metals", []):
            if "gram" in (m.get("name") or "").lower():
                v = float(str(m.get("price")).replace(",", "."))
                if v > 0:
                    g["gram_altin"] = v
                break
    except Exception as e:
        print(f"uyari: canli altin alinamadi, guncel blogu kullanilacak: {e}")
    return g


def pick(seed_str, years):
    rng = random.Random(seed_str)
    return rng.choice(years), rng.choice(AMOUNT_POOL), rng


def build_caption(vals, rng):
    yil, tutar = vals["yil"], vals["tutar"]
    altin = vals["altin_bugun"]
    kat = (altin / tutar) if tutar else 0
    tl = cr.tl
    lines = [
        f"{yil} yılında {tl(tutar)} cebinde olsaydı bugün ne olurdu? 👀",
        "",
        f"O parayı ALTINDA saklasaydın bugün → {tl(altin)} "
        f"(yaklaşık {cr.tr_fmt(kat)} katı).",
        f"Ama TL'de tuttuysan… hâlâ {tl(tutar)}. Reel olarak eridi. 🫠",
        "",
        f"O zamanki {tl(tutar)} ile {cr.tr_fmt(vals['ekmek_gec'])} ekmek alınırdı; "
        f"bugün aynı parayla sadece {cr.tr_fmt(vals['ekmek_bug'])}.",
        "",
        "Kendi yılını & tutarını dene 👉 kuraura.com.tr/paragraf",
        "",
        "≈ yaklaşık yıllık ortalamalardır; bilgilendirme amaçlıdır. Yatırım tavsiyesi değildir.",
    ]
    tags = rng.sample(HASHTAG_POOL, 11)
    return "\n".join(lines) + "\n\n" + " ".join(tags)


def main():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data = load_data()
    guncel = build_guncel(data)
    yil, tutar, rng = pick(today, year_pool(data))
    vals = cr.compute(data, guncel, yil, tutar)

    os.makedirs(CARDS, exist_ok=True)
    img_path = os.path.join(CARDS, "latest.png")
    cr.render(vals, img_path)
    caption = build_caption(vals, rng)

    meta = {
        "date": today,
        "yil": yil,
        "tutar": tutar,
        "image_url": f"{RAW_BASE}/latest.png",
        "caption": caption,
    }
    with open(os.path.join(CARDS, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"[generate] {today}: {yil} / {tutar} TL -> {img_path}")
    print(f"[generate] image_url: {meta['image_url']}")
    print("----- caption -----")
    print(caption)


if __name__ == "__main__":
    main()
