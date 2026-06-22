"""ParaGraf IG poster — idempotent.

latest.json'daki image_url (public raw URL) + caption ile IG feed postu yapar.
KRITIK ogrenim (noble-vision-poster): Meta media_publish 403 donse bile postu
gercekte yayinlayabiliyor. Bu yuzden publish ETRAFINDA idempotency guard var:
publish'ten once son media id'yi al; "basarisizlik" sonrasi yeni post olustuysa
RETRY YOK (duplicate engeli).

Env: INSTAGRAM_BUSINESS_ID, META_ACCESS_TOKEN (GitHub Secrets).
"""
import json
import os
import sys
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
IG_ID = os.getenv("INSTAGRAM_BUSINESS_ID")
TOKEN = os.getenv("META_ACCESS_TOKEN")
GRAPH = "https://graph.facebook.com/v20.0"


def get_latest_media_id():
    if not (IG_ID and TOKEN):
        return None
    try:
        r = requests.get(f"{GRAPH}/{IG_ID}/media",
                         params={"fields": "id", "limit": 1, "access_token": TOKEN}, timeout=15)
        if r.status_code == 200:
            d = r.json().get("data", [])
            return d[0]["id"] if d else None
        print(f"uyari: son media id alinamadi: {r.status_code} {r.text[:120]}")
    except Exception as e:
        print(f"uyari: son media id exception: {e}")
    return None


def publish(image_url, caption):
    if not (IG_ID and TOKEN):
        print("HATA: INSTAGRAM_BUSINESS_ID / META_ACCESS_TOKEN yok. Atlaniyor.")
        return None

    baseline = get_latest_media_id()  # idempotency referansi

    # 1) container
    r = requests.post(f"{GRAPH}/{IG_ID}/media",
                      json={"image_url": image_url, "caption": caption, "access_token": TOKEN},
                      timeout=30)
    if r.status_code != 200:
        print(f"HATA: container olusturulamadi: {r.status_code} {r.text}")
        return None
    creation_id = r.json().get("id")
    print(f"container: {creation_id}")
    time.sleep(10)  # image isleme

    # 2) publish (idempotent: guard ile)
    try:
        pr = requests.post(f"{GRAPH}/{IG_ID}/media_publish",
                           json={"creation_id": creation_id, "access_token": TOKEN}, timeout=60)
        if pr.status_code == 200:
            pid = pr.json().get("id")
            print(f"OK: yayinlandi. Post ID: {pid}")
            return pid
        print(f"publish basarisiz gibi: {pr.status_code} {pr.text[:160]}")
    except Exception as e:
        print(f"publish exception: {e}")

    # publish "basarisiz" dedi — ama gercekten yayinlanmis olabilir (403 false-negative).
    time.sleep(8)
    latest = get_latest_media_id()
    if latest and latest != baseline:
        print(f"guard: post aslinda yayinlanmis ({latest}). RETRY YOK.")
        return latest
    print("guard: yeni post yok. Bir sonraki cron denemesine birakiliyor (retry yok).")
    return None


def main():
    meta_path = os.path.join(HERE, "cards", "latest.json")
    if not os.path.exists(meta_path):
        print("HATA: latest.json yok. Once paragraf_bot.py calistir.")
        sys.exit(1)
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    publish(meta["image_url"], meta["caption"])


if __name__ == "__main__":
    main()
