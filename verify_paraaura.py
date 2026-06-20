import os
import sys
import json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def verify_files():
    print("--- Verifying Project Files ---")
    required = [
        "index.html", "style.css", "app.js", "rates.json", "agent.py",
        ".github/workflows/run_agent.yml",
        # NVDS premium additions
        "theme.css", "manifest.webmanifest", "sw.js", "offline.html",
        "vendor/nvds/tokens.css", "vendor/nvds/ds.css", "vendor/nvds/ds.js", "vendor/nvds/icons.css",
        "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable.png",
    ]
    all_ok = True
    for f in required:
        if os.path.exists(f):
            print(f"[OK] File exists: {f}")
        else:
            print(f"[FAIL] Missing file: {f}")
            all_ok = False
    return all_ok


def verify_premium_markers():
    print("\n--- Verifying NVDS Premium Markers & Unbreakable Contracts ---")
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()

    checks = {
        # NVDS wiring
        'NVDS tokens linked': 'vendor/nvds/tokens.css' in html,
        'NVDS ds.css linked': 'vendor/nvds/ds.css' in html,
        'NVDS ds.js loaded': 'vendor/nvds/ds.js' in html,
        'theme.css linked': 'theme.css' in html,
        'manifest linked': 'manifest.webmanifest' in html,
        'theme-color meta': 'name="theme-color"' in html,
        'skip-link present': 'nv-skip-link' in html,
        'main landmark id': 'id="main"' in html,
        'timeframe tablist': 'role="tablist"' in html,
        # Performance
        'FontAwesome async (media=print)': 'media="print"' in html and 'font-awesome' in html,
        'Chart.js deferred': 'chart.js" defer' in html,
        # Unbreakable revenue/SEO contracts
        'AdSense client id intact': 'ca-pub-9351400259394108' in html,
        'OneSignal app id intact': 'c2d81acd-bc71-4fc7-aa77-7deffece8a2c' in html,
        'FAQ JSON-LD intact': 'application/ld+json' in html and 'FAQPage' in html,
        'ecosystem footer intact': 'fiyat-dedektifi.vercel.app' in html and 'aksam-ne-pisirsem.vercel.app' in html,
        'SEO title intact': '<title>ParaAura' in html,
    }

    # Service worker must not intercept cross-origin (OneSignal/AdSense/APIs safety).
    with open("sw.js", "r", encoding="utf-8") as f:
        sw = f.read()
    checks['SW skips cross-origin'] = 'url.origin !== self.location.origin' in sw

    # Manifest is valid and standalone.
    with open("manifest.webmanifest", "r", encoding="utf-8") as f:
        man = json.load(f)
    checks['manifest standalone'] = man.get("display") == "standalone"
    checks['manifest has 3 icons'] = len(man.get("icons", [])) >= 3

    all_ok = True
    for name, ok in checks.items():
        print(f"[{'OK' if ok else 'FAIL'}] {name}")
        if not ok:
            all_ok = False
    return all_ok


def run_agent_test():
    """Optional: runs the live agent (network + rewrites rates.json). Use --agent."""
    print("\n--- Running agent.py Local Dry Run ---")
    import agent
    try:
        with open("rates.json", "r", encoding="utf-8") as f:
            old_data = json.load(f)
        print(f"[OK] Read initial rates.json. Current count of metals: {len(old_data['metals'])}")
    except Exception as e:
        print(f"[FAIL] Could not read rates.json: {e}")
        return False
    try:
        agent.run_agent()
        print("[OK] agent.run_agent() finished execution loop.")
    except Exception as e:
        print(f"[FAIL] Exception running agent: {e}")
        return False
    try:
        with open("rates.json", "r", encoding="utf-8") as f:
            new_data = json.load(f)
        if "metals" in new_data:
            print(f"[OK] rates.json structure valid. metals: {len(new_data['metals'])}")
            return True
        print(f"[FAIL] rates.json missing 'metals': {new_data.keys()}")
        return False
    except Exception as e:
        print(f"[FAIL] Could not read updated rates.json: {e}")
        return False


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    files_ok = verify_files()
    markers_ok = verify_premium_markers()

    agent_ok = True
    if "--agent" in sys.argv:
        agent_ok = run_agent_test()

    if files_ok and markers_ok and agent_ok:
        print("\nALL CHECKS PASSED! ParaAura premium build is verified.")
        sys.exit(0)
    else:
        print("\nCHECKS FAILED. See [FAIL] lines above.")
        sys.exit(1)
