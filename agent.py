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

    models = ["gemini-2.5-flash", "gemini-2.0-flash"]
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

    # 1. Search Google for current Kapalıçarşı gold and silver rates
    print("Searching Google for current Kapalıçarşı physical gold/silver prices...")
    search_prompt = (
        "Find the current physical Gram gold price in the Grand Bazaar (Kapalıçarşı alış satış fiyatı), "
        "interbank Gram gold, Çeyrek gold, Ons gold, and physical Silver (Gümüş gram) prices in Turkish Liras (TRY) today."
    )
    
    search_results = "No search results available."
    try:
        raw_res = call_gemini(search_prompt, use_search=True)
        if raw_res:
            search_results = raw_res
            print("[OK] Grand Bazaar trends searched successfully.")
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
    
    For each metal, calculate or search the estimated daily percentage change (e.g. 0.12 or -0.25).
    
    Format the values clearly as numbers (e.g. "2480.50", "31.45").
    
    SEARCH TRENDS:
    {search_results}

    Respond in STRICT JSON format (no markdown blocks, just raw JSON matching the schema below):
    {{
      "metals": [
        {{
          "name": "Metal Name (in Turkish, e.g. 'Gram Altın', 'Kapalı Çarşı Gram Altın', 'Çeyrek Altın', 'Ons Altın', 'Gümüş Gram')",
          "code": "Code label (e.g. 'Gram', 'Fiziki', 'Çeyrek', 'Ons/USD', 'Gümüş')",
          "price": "Price string (numeric format like '2450.50' or '31.25')",
          "change": Float percentage change (e.g., 0.15 or -0.10)
        }}
      ]
    }}
    """
    
    raw_json = call_gemini(generator_prompt, use_search=False)
    if not raw_json:
        print("[FAIL] Gemini returned empty response. Aborting.")
        return

    # 3. Parse and save rates.json
    try:
        clean_json = raw_json.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        data["last_updated"] = datetime.datetime.utcnow().isoformat() + "Z"
        
        # Save to file
        with open("rates.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        print("[OK] rates.json updated successfully.")
        
    except Exception as e:
        print(f"[FAIL] Error parsing Gemini JSON: {e}")
        print("Raw response was:", raw_json[:300])
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
