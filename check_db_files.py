import requests
import os
import json

BASE_URL = "http://localhost:8000"
SESSION_ID = 155


def check():
    print(f"Checking Session {SESSION_ID}...")
    try:
        r = requests.get(f"{BASE_URL}/api/sessions/{SESSION_ID}/segments")
        segments = r.json()
        print(f"Total Segments: {len(segments)}")

        missing = 0
        for s in segments:
            path = s.get("file_path")
            start = s.get("start_time")
            # Check 11:36
            if "11:36" in start:
                exists = os.path.exists(path)
                status = "OK" if exists else "MISSING"
                if not exists:
                    missing += 1
                print(f"[{status}] {start} -> {path}")

        print(f"Total Missing Files: {missing}")

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    check()
