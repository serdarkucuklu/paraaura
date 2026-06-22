"""card_render saf fonksiyon testleri (calc.js parity). Calistir: python -m pytest -q  veya
python test_card_render.py"""
import card_render as cr


def approx(a, b, tol=1e-6):
    return abs(a - b) < tol


def test_tr_fmt():
    assert cr.tr_fmt(62126.5) == "62.126,5"
    assert cr.tr_fmt(1000, 0) == "1.000"
    assert cr.tr_fmt(0) == "0,0"
    assert cr.tl(106339, 0) == "₺106.339"


def test_birim_adedi():
    assert approx(cr.birim_adedi(1000, 4.0), 250.0)
    assert cr.birim_adedi(1000, 0) == 0.0      # sifira bolme korumasi
    assert cr.birim_adedi(1000, -5) == 0.0


def test_deger_koruma():
    # 1000 TL, eski gram 100 -> 10 gram; bugun 6000 -> 60.000
    assert approx(cr.deger_koruma(1000, 100, 6000), 60000.0)
    assert cr.deger_koruma(1000, 0, 6000) == 0.0


def test_compute_parity():
    data = {"yillar": {"2010": {"gram_altin": 59.0, "usd": 1.5, "ekmek": 0.6}}}
    guncel = {"gram_altin": 6274.0, "usd": 48.0, "ekmek": 18.0}
    v = cr.compute(data, guncel, 2010, 1000)
    assert approx(v["altin_bugun"], (1000 / 59.0) * 6274.0)
    assert approx(v["usd_gec"], 1000 / 1.5)
    assert approx(v["usd_bug"], 1000 / 48.0)
    assert approx(v["ceyrek_gec"], 1000 / (59.0 * cr.CEYREK_GRAM))


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok - {name}")
    print("tum testler gecti")
