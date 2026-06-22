"""ParaGraf IG sok-karti renderer (Pillow).

1080x1350 (4:5) dikey kart uretir. Tarayicidaki #share-card ile ayni mesaj/estetik:
koyu zemin + altin accent. Headless Chromium yerine Pillow -> CI'da bagimsiz, deterministik.

Hesaplama paragraf/calc.js ile birebir ayni semantik:
  birimAdedi(tutar, fiyat)       = tutar / fiyat
  degerKoruma(tutar, eski, yeni) = (tutar / eski) * yeni
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(HERE, "fonts", "Montserrat-Bold.ttf")

W, H = 1080, 1350
BG = (13, 15, 19)          # #0d0f13
ACCENT = (212, 181, 114)   # #d4b572 altin
TEXT = (240, 240, 242)
MUTED = (154, 160, 171)    # #9aa0ab
UP = (96, 200, 140)        # kazanc yesili (hero icin degil; ileride kullanim)
DOWN = (227, 110, 110)     # erime/azalma kirmizisi (web var(--down))
PAD = 80
CEYREK_GRAM = 1.6


def _font(size):
    return ImageFont.truetype(FONT_PATH, size)


def tr_fmt(v, decimals=1):
    """Turkce sayi bicimi: binlik '.', ondalik ','. ornek 62126.5 -> '62.126,5'."""
    neg = v < 0
    v = abs(v)
    s = f"{v:,.{decimals}f}"            # 62,126.5  (en-US)
    s = s.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return ("-" if neg else "") + s


def tl(v, decimals=0):
    return "₺" + tr_fmt(v, decimals)


def birim_adedi(tutar, fiyat):
    return (tutar / fiyat) if (isinstance(fiyat, (int, float)) and fiyat > 0) else 0.0


def deger_koruma(tutar, eski, yeni):
    if not (isinstance(eski, (int, float)) and eski > 0):
        return 0.0
    return (tutar / eski) * yeni


def compute(data, guncel, yil, tutar):
    """render edilecek tum degerleri uretir. guncel: {gram_altin,usd,eur,ekmek,...} (canli altin)."""
    gec = data["yillar"][str(yil)]
    return {
        "yil": yil,
        "tutar": tutar,
        "altin_bugun": deger_koruma(tutar, gec["gram_altin"], guncel["gram_altin"]),
        "ceyrek_gec": birim_adedi(tutar, gec["gram_altin"] * CEYREK_GRAM),
        "ceyrek_bug": birim_adedi(tutar, guncel["gram_altin"] * CEYREK_GRAM),
        "ekmek_gec": birim_adedi(tutar, gec["ekmek"]),
        "ekmek_bug": birim_adedi(tutar, guncel["ekmek"]),
        "usd_gec": birim_adedi(tutar, gec["usd"]),
        "usd_bug": birim_adedi(tutar, guncel["usd"]),
    }


def _center(draw, text, font, y, fill):
    w = draw.textlength(text, font=font)
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)


def render(vals, out_path):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # ust koselerde hafif altin glow (radial yerine basit elips blur taklidi)
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 620, -420, W + 320, 360], fill=(23, 22, 20))
    glow = glow.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(120))
    img = Image.blend(img, glow, 0.7)
    d = ImageDraw.Draw(img)

    y = PAD
    # eyebrow
    eb = _font(30)
    d.text((PAD, y), "P A R A N   E R İ D İ   M İ ?", font=eb, fill=ACCENT)
    y += 70

    # baslik: yil -> 2026
    d.text((PAD, y), f"{vals['yil']}  →  2026", font=_font(96), fill=TEXT)
    y += 120
    d.text((PAD, y), f"{tl(vals['tutar'])} ne oldu?", font=_font(48), fill=MUTED)
    y += 110

    # hero blok (ust/alt cizgi)
    d.line([(PAD, y), (W - PAD, y)], fill=(60, 56, 48), width=3)
    y += 50
    d.text((PAD, y), "O parayı altında saklasaydın bugün", font=_font(34), fill=MUTED)
    y += 52
    d.text((PAD, y), tl(vals["altin_bugun"]), font=_font(118), fill=ACCENT)
    y += 150
    d.line([(PAD, y), (W - PAD, y)], fill=(60, 56, 48), width=3)
    y += 70

    # satirlar: etiket solda, "gec -> bug" sagda
    rows = [
        ("Çeyrek altın", f"{tr_fmt(vals['ceyrek_gec'])} → {tr_fmt(vals['ceyrek_bug'])} adet"),
        ("Ekmek", f"{tr_fmt(vals['ekmek_gec'])} → {tr_fmt(vals['ekmek_bug'])} adet"),
        ("Dolar", f"{tr_fmt(vals['usd_gec'])} → {tr_fmt(vals['usd_bug'])} $"),
    ]
    lf = _font(46)
    for label, val in rows:
        d.text((PAD, y), label, font=lf, fill=TEXT)
        vw = d.textlength(val, font=lf)
        d.text((W - PAD - vw, y), val, font=lf, fill=DOWN)
        y += 92

    # footer
    fy = H - PAD - 40
    d.line([(PAD, fy - 36), (W - PAD, fy - 36)], fill=(40, 38, 34), width=2)
    d.text((PAD, fy), "kuraura.com.tr/paragraf", font=_font(34), fill=ACCENT)
    note = "≈ yaklaşık"
    nw = d.textlength(note, font=_font(28))
    d.text((W - PAD - nw, fy + 4), note, font=_font(28), fill=MUTED)

    img.save(out_path, "PNG")
    return out_path


if __name__ == "__main__":
    # lokal smoke test
    import json
    base = os.path.dirname(HERE)
    with open(os.path.join(base, "paragraf_data.json"), encoding="utf-8") as f:
        data = json.load(f)
    guncel = dict(data["guncel"])
    vals = compute(data, guncel, 2010, 1000)
    out = render(vals, os.path.join(HERE, "cards", "sample.png"))
    print("rendered ->", out)
    print(vals)
