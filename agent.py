import os
import sys
import json
import datetime
import subprocess
import requests
from dotenv import load_dotenv

# Reconfigure console encoding to UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load environment variables
load_dotenv()
load_dotenv("d:/AI/Playground/02-auto-poster-agent/.env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Import notifier
sys.path.append("d:/AI/Playground/02-auto-poster-agent")
try:
    from notifier import trigger_milestone_alert
except ImportError:
    def trigger_milestone_alert(title, value):
        print(f"[Notifier Mock] Alert: {title} - {value}")

def call_gemini(prompt: str, use_search: bool = False):
    """Calls Gemini API with model fallback and search grounding."""
    if not GEMINI_API_KEY:
        print("Error: Gemini API Key is missing in .env")
        return None

    models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-flash-latest"]
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    if use_search:
        payload["tools"] = [{"googleSearch": {}}]

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
        try:
            response = requests.post(url, json=payload, timeout=60)
            if response.status_code == 200:
                data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            else:
                print(f"Gemini API Error ({model}): {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Error calling Gemini ({model}): {e}")
            
    print("All Gemini models failed.")
    return None


def _to_float(v):
    """Parse a price string/number to float, tolerating thousands separators."""
    try:
        return float(str(v).replace(".", "").replace(",", ".")) if str(v).count(",") == 1 and str(v).count(".") > 1 \
            else float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def update_history(data, history_file="history.json", cap_days=90):
    """Append today's snapshot to history.json as a rolling ~90-day buffer.

    This is ParaAura's free, static 'database': each cron run records real prices so the
    frontend charts and 'N-günün dibinde' buy signals use REAL history instead of fake data.
    """
    try:
        hist = {"points": [], "capped_days": cap_days}
        if os.path.exists(history_file):
            try:
                with open(history_file, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict) and isinstance(loaded.get("points"), list):
                    hist = loaded
            except Exception as e:
                print(f"Warning: history.json unreadable, starting fresh: {e}")

        metals_map = {}
        for m in data.get("metals", []):
            price = _to_float(m.get("price"))
            if m.get("code") and price is not None:
                metals_map[m.get("code")] = price

        buys = [b for b in (_to_float(x.get("buy")) for x in data.get("banks", [])) if b is not None]
        sells = [s for s in (_to_float(x.get("sell")) for x in data.get("banks", [])) if s is not None]

        now = datetime.datetime.now(datetime.timezone.utc)
        point = {"ts": now.isoformat(), "metals": metals_map}
        if buys and sells:
            point["banks_avg"] = {"buy": round(sum(buys) / len(buys), 2), "sell": round(sum(sells) / len(sells), 2)}
        hist["points"].append(point)

        # Cap by age (drop points older than cap_days) + hard count cap for safety.
        cutoff = now - datetime.timedelta(days=cap_days)
        kept = []
        for p in hist["points"]:
            try:
                if datetime.datetime.fromisoformat(p["ts"]) >= cutoff:
                    kept.append(p)
            except Exception:
                kept.append(p)  # keep unparseable rather than lose data
        hist["points"] = kept[-3000:]
        hist["capped_days"] = cap_days

        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(hist, f, indent=2, ensure_ascii=False)
        print(f"[OK] history.json updated ({len(hist['points'])} points).")
    except Exception as e:
        print(f"Warning: Failed to update history.json: {e}")


def generate_analysis(data):
    """Best-effort short Turkish market commentary for the 'Günün Yorumu' card (free Gemini)."""
    try:
        metals_summary = ", ".join(
            f"{m.get('name')}: {m.get('price')} (%{m.get('change')})" for m in data.get("metals", [])
        )
        banks_summary = ", ".join(
            f"{b.get('name')} {b.get('buy')}/{b.get('sell')}" for b in data.get("banks", [])
        )
        prompt = (
            "Aşağıdaki güncel Türkiye altın/gümüş/platin ve banka makas verilerine dayanarak yatırımcı için "
            "2-3 cümlelik, sade, abartısız Türkçe bir 'Günün Piyasa Yorumu' yaz. Yatırım tavsiyesi verme; "
            "sadece günün hareketini ve en dar/geniş banka makasını yorumla. Klişe yok. Doğru Türkçe karakter kullan. "
            "Yanıt sadece düz metin olsun (markdown yok).\n\n"
            f"METALLER: {metals_summary}\n"
            f"BANKALAR (alış/satış): {banks_summary}\n"
        )
        txt = call_gemini(prompt, use_search=False)
        if txt:
            return txt.strip().replace("```", "").strip()
    except Exception as e:
        print(f"Warning: analysis generation failed: {e}")
    return None


def run_agent():
    print("=" * 60)
    print("  ParaAura Autonomous Agent: Fetching Localized Metal Rates")
    print("=" * 60)

    # 1. Search Google for current Kapalıçarşı gold, silver, platinum and bank rates
    print("Searching Google for current Kapalıçarşı physical metal prices & bank kurlar...")
    search_prompt = (
        "Find the current physical Gram gold price in the Grand Bazaar (Kapalıçarşı alış satış fiyatı), "
        "interbank Gram gold, Çeyrek gold, Ons gold, physical Silver (Gümüş gram), and physical Platinum (Platin gram) prices in TRY today. "
        "Also find the gold retail buying and selling prices for major Turkish banks today: "
        "Garanti BBVA, Akbank, Yapı Kredi, Ziraat Bankası, Vakıfbank, Halkbank, İş Bankası, QNB Finansbank, Kuveyt Türk."
    )
    
    search_results = None
    try:
        raw_res = call_gemini(search_prompt, use_search=True)
        if raw_res:
            search_results = raw_res
            print("[OK] Grand Bazaar and bank trends searched successfully.")
        else:
            print("[WARNING] call_gemini returned empty search results.")
    except Exception as e:
        print(f"Warning: Search grounding failed: {e}")

    data = None
    if search_results:
        # 2. Ask Gemini to compile into rates.json format
        print("Formulating rates database via Gemini...")
        generator_prompt = f"""
        You are an expert financial analyst for ParaAura, a premium minimalist financial rates hub in Turkey.
        Based on the following search trends, extract and compile:
        1. Gram Altın (interbank rate)
        2. Kapalı Çarşı Gram Altın (physical retail selling price in Grand Bazaar)
        3. Çeyrek Altın (retail selling price)
        4. Ons Altın (gold ounce in USD - MUST be in US Dollars, typical value is between 1500 and 5000, e.g., "4220.00". DO NOT write the TRY equivalent!)
        5. Gümüş Gram (silver gram price in TRY)
        6. Platin Gram (platinum gram price in TRY)
        7. Bank gold buying and selling rates for ALL of these banks (include every one you can find):
           - Garanti BBVA
           - Akbank
           - Yapı Kredi
           - Ziraat Bankası
           - Vakıfbank
           - Halkbank
           - İş Bankası
           - QNB Finansbank
           - Kuveyt Türk

        For each metal and bank, calculate or search the estimated daily percentage change (e.g. 0.12 or -0.25).
        
        Format all values clearly as numeric strings (e.g. "2480.50", "31.45"). For banks, provide both buy and sell prices.
        
        SEARCH TRENDS:
        {search_results}

        Respond in STRICT JSON format (no markdown blocks, just raw JSON matching the schema below):
        {{
          "metals": [
            {{
              "name": "Gram Altın",
              "code": "Gram",
              "price": "2850.40",
              "change": 0.15
            }},
            {{
              "name": "Kapalı Çarşı Gram Altın",
              "code": "Fiziki",
              "price": "2910.50",
              "change": 0.22
            }},
            {{
              "name": "Çeyrek Altın",
              "code": "Çeyrek",
              "price": "4750.00",
              "change": 0.18
            }},
            {{
              "name": "Ons Altın",
              "code": "Ons/USD",
              "price": "2330.40",
              "change": -0.05
            }},
            {{
              "name": "Gümüş Gram",
              "code": "Gümüş",
              "price": "34.50",
              "change": 0.45
            }},
            {{
              "name": "Platin Gram",
              "code": "Platin",
              "price": "1045.20",
              "change": -0.12
            }}
          ],
          "banks": [
            {{
              "name": "Garanti BBVA",
              "buy": "2810.20",
              "sell": "2940.60",
              "change": 0.10
            }},
            {{
              "name": "Akbank",
              "buy": "2812.50",
              "sell": "2938.40",
              "change": 0.11
            }},
            {{
              "name": "Yapı Kredi",
              "buy": "2808.90",
              "sell": "2942.10",
              "change": 0.09
            }},
            {{
              "name": "Ziraat Bankası",
              "buy": "2815.00",
              "sell": "2933.00",
              "change": 0.08
            }},
            {{
              "name": "Vakıfbank",
              "buy": "2814.20",
              "sell": "2934.80",
              "change": 0.08
            }},
            {{
              "name": "Halkbank",
              "buy": "2813.50",
              "sell": "2936.00",
              "change": 0.08
            }},
            {{
              "name": "İş Bankası",
              "buy": "2811.80",
              "sell": "2939.50",
              "change": 0.09
            }},
            {{
              "name": "QNB Finansbank",
              "buy": "2809.50",
              "sell": "2943.50",
              "change": 0.10
            }},
            {{
              "name": "Kuveyt Türk",
              "buy": "2820.00",
              "sell": "2928.00",
              "change": 0.07
            }}
          ]
        }}
        """
        
        raw_json = call_gemini(generator_prompt, use_search=False)
        if raw_json:
            try:
                clean_json = raw_json.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_json)
            except Exception as e:
                print(f"[WARNING] Error parsing Gemini JSON: {e}")
        else:
            print("[WARNING] Gemini returned empty response for generator prompt.")
    else:
        print("[WARNING] Skipping generation due to missing search results.")

    if not data:
        print("[WARNING] Attempting fallback to existing rates.json...")
        if os.path.exists("rates.json"):
            try:
                with open("rates.json", "r", encoding="utf-8") as f:
                    data = json.load(f)
                print("[OK] Fallback to existing rates.json succeeded.")
            except Exception as e:
                print(f"[FAIL] Could not load existing rates.json: {e}")
        
        if not data:
            print("[FAIL] No fallback data available. Aborting.")
            return

    # Daily AI market commentary for the 'Günün Yorumu' card (best-effort; keeps old one on failure).
    analysis_text = generate_analysis(data)
    if analysis_text:
        data["analysis"] = analysis_text
        print("[OK] Market analysis (Günün Yorumu) generated.")
    else:
        print("[INFO] Analysis unavailable; keeping existing 'analysis' if any.")

    # Update timestamp and save
    try:
        data["last_updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with open("rates.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("[OK] rates.json updated successfully.")
    except Exception as e:
        print(f"[FAIL] Error saving rates.json: {e}")
        return

    # Append this snapshot to the rolling history (free static 'database' for real charts).
    update_history(data)

    # 4. Trigger Notification (skipped on dry-run — SMS/email are outward actions)
    if os.getenv("GIT_PUSH", "1") != "0":
        try:
            trigger_milestone_alert("ParaAura Guncellendi", "Kapalıçarşı ve serbest piyasa altın/gümüş fiyatları başarıyla güncellendi.")
            print("[OK] SMS/Email notification sent.")
        except Exception as e:
            print(f"Warning: Failed to trigger notification: {e}")
    else:
        print("[DRY-RUN] Bildirim (SMS/email) atlandı.")

    # 5. Git Commit and Push (Only in Git repo). Set GIT_PUSH=0 for a local dry-run
    #    (files are written for inspection, but nothing is committed or pushed).
    git_push = os.getenv("GIT_PUSH", "1") != "0"
    if not git_push:
        print("[DRY-RUN] GIT_PUSH=0 → rates.json/history.json yazıldı, commit/push atlandı.")
    elif os.path.exists(".git"):
        print("Staging and committing rates.json + history.json to git...")
        try:
            subprocess.run(["git", "config", "user.name", "ParaAura Agent"], check=True)
            subprocess.run(["git", "config", "user.email", "agent@paraaura.com"], check=True)
            subprocess.run(["git", "add", "rates.json", "history.json"], check=True)

            # Check if there are changes to commit
            status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
            if status.stdout.strip():
                subprocess.run(["git", "commit", "-m", "Otonom Guncelleme: Doviz ve altin kurlari veritabani yenilendi [skip ci]"], check=True)
                subprocess.run(["git", "push", "origin", "main"], check=True)
                print("[OK] Git push completed. Website auto-deployed!")
            else:
                print("[INFO] No changes in rates.json. Skipping commit.")
        except Exception as e:
            print(f"Warning: Git commit/push failed: {e}")
    else:
        print("[INFO] No Git repository detected. Skipping git push.")

if __name__ == "__main__":
    # Change working directory to script location
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    run_agent()
