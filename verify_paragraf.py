import os, sys, json
if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ok = True
    for f in ["paragraf_data.json", "paragraf/index.html", "paragraf/calc.js", "paragraf/paragraf.js"]:
        exists = os.path.exists(f)
        print(f"[{'OK' if exists else 'FAIL'}] {f}")
        ok = ok and exists
    d = json.load(open("paragraf_data.json", encoding="utf-8"))
    checks = {
        "yil >= 10": len(d.get("yillar", {})) >= 10,
        "2025 var": "2025" in d.get("yillar", {}),
        "alanlar tam": all(k in d["yillar"]["2025"] for k in ["gram_altin","usd","eur","ekmek","benzin","asgari_ucret_net"]),
    }
    html = open("paragraf/index.html", encoding="utf-8").read()
    checks["AdSense"] = "ca-pub-9351400259394108" in html
    checks["NVDS"] = "vendor/nvds/ds.css" in html
    checks["html2canvas"] = "html2canvas" in html
    checks["yaklasik notu"] = "Yaklaşık" in html or "yaklaşık" in html
    for name, v in checks.items():
        print(f"[{'OK' if v else 'FAIL'}] {name}");  ok = ok and v
    print("\n" + ("ALL CHECKS PASSED." if ok else "CHECKS FAILED."))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
