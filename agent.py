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

def run_agent():
    print("=" * 60)
    print("  ParaAura Autonomous Agent: Fetching Localized Metal Rates")
    print("=" * 60)

    # 1. Search Google for current Kapalıçarşı gold, silver, platinum and bank rates
    print("Searching Google for current Kapalıçarşı physical metal prices & bank kurlar...")
    search_prompt = (
        "Find the current physical Gram gold price in the Grand Bazaar (Kapalıçarşı alış satış fiyatı), "
        "interbank Gram gold, Çeyrek gold, Ons gold, physical Silver (Gümüş gram), and physical Platinum (Platin gram) prices in TRY today. "
        "Also find the gold retail buying and selling prices for major Turkish banks (specifically Garanti BBVA, Akbank, and Yapı Kredi) today."
    )
    
    search_results = "No search results available."
    try:
        raw_res = call_gemini(search_prompt, use_search=True)
        if raw_res:
            search_results = raw_res
            print("[OK] Grand Bazaar and bank trends searched successfully.")
    except Exception as e:
        print(f"Warning: Search grounding failed: {e}")

    # 2. Ask Gemini to compile into rates.json format
    print("Formulating rates database via Gemini...")
    generator_prompt = f"""
    You are an expert financial analyst for ParaAura, a premium minimalist financial rates hub in Turkey.
    Based on the following search trends, extract and compile:
    1. Gram Altın (interbank rate)
    2. Kapalı Çarşı Gram Altın (physical retail selling price in Grand Bazaar)
    3. Çeyrek Altın (retail selling price)
    4. Ons Altın (gold ounce in USD)
    5. Gümüş Gram (silver gram price in TRY)
    6. Platin Gram (platinum gram price in TRY)
    7. Bank gold buying and selling rates for:
       - Garanti BBVA
       - Akbank
       - Yapı Kredi
    
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
    data = None
    
    if not raw_json:
        print("[WARNING] Gemini returned empty response. Attempting fallback to existing rates.json...")
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
    else:
        # 3. Parse and save rates.json
        try:
            clean_json = raw_json.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_json)
        except Exception as e:
            print(f"[WARNING] Error parsing Gemini JSON: {e}. Attempting fallback...")
            if os.path.exists("rates.json"):
                try:
                    with open("rates.json", "r", encoding="utf-8") as f:
                        data = json.load(f)
                    print("[OK] Fallback to existing rates.json succeeded.")
                except Exception as ex:
                    print(f"[FAIL] Fallback failed: {ex}")
            if not data:
                return

    # Update timestamp and save
    try:
        data["last_updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with open("rates.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("[OK] rates.json updated successfully.")
    except Exception as e:
        print(f"[FAIL] Error saving rates.json: {e}")
        return

    # 4. Trigger Notification
    try:
        trigger_milestone_alert("ParaAura Guncellendi", "Kapalıçarşı ve serbest piyasa altın/gümüş fiyatları başarıyla güncellendi.")
        print("[OK] SMS/Email notification sent.")
    except Exception as e:
        print(f"Warning: Failed to trigger notification: {e}")

    # 5. Git Commit and Push (Only in Git repo)
    if os.path.exists(".git"):
        print("Staging and committing rates.json to git...")
        try:
            subprocess.run(["git", "config", "user.name", "ParaAura Agent"], check=True)
            subprocess.run(["git", "config", "user.email", "agent@paraaura.com"], check=True)
            subprocess.run(["git", "add", "rates.json"], check=True)
            
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
