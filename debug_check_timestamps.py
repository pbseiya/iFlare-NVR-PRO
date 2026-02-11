import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"


def check_timestamps(session_id):
    print(f"--- Checking Session {session_id} ---")

    # 1. Session Info
    try:
        r_sess = requests.get(f"{BASE_URL}/api/sessions/{session_id}")
        sess = r_sess.json()
        print(f"[Session] created_at: {sess.get('created_at')} (Raw)")
    except Exception as e:
        print(f"[Session] Error: {e}")

    # 2. Segments
    try:
        r_seg = requests.get(f"{BASE_URL}/api/sessions/{session_id}/segments")
        segs = r_seg.json()
        if segs:
            print(f"[Segment] start_time: {segs[0].get('start_time')} (Raw First Seg)")
            print(f"[Segment] Count: {len(segs)}")
        else:
            print("[Segment] None found")
    except Exception as e:
        print(f"[Segment] Error: {e}")

    # 3. Detections
    try:
        r_det = requests.get(f"{BASE_URL}/api/sessions/{session_id}/detections?limit=5")
        dets = r_det.json()
        if isinstance(dets, dict):
            dets = dets.get("detections", [])
        if dets:
            print(f"[Detection] timestamp: {dets[0].get('timestamp')} (Raw First Det)")
            print(f"[Detection] class_name: {dets[0].get('class_name')}")
            print(f"[Detection] class: {dets[0].get('class')}")
        else:
            print("[Detection] None found")
    except Exception as e:
        print(f"[Detection] Error: {e}")


if __name__ == "__main__":
    # Check session 156 (from manual inspection) and maybe list recent
    try:
        r_list = requests.get(f"{BASE_URL}/api/sessions?limit=1")
        latest = r_list.json()["sessions"][0]
        print(f"Latest Session ID: {latest['id']}")
        check_timestamps(latest["id"])
    except:
        print("Could not list sessions, trying 156")
        check_timestamps(156)
