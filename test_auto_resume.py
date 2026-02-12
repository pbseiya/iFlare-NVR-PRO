import asyncio
import os
import signal
import sys
import time
import requests
import subprocess
from datetime import datetime

# Configuration
API_URL = "http://localhost:8000"
SESSION_NAME = "AutoResumeTest"
VIDEO_SOURCE = "/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4"


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def check_health():
    try:
        resp = requests.get(f"{API_URL}/health", timeout=2)
        return resp.status_code == 200
    except:
        return False


def get_session_id_by_name(name):
    try:
        resp = requests.get(f"{API_URL}/api/sessions")
        if resp.status_code == 200:
            data = resp.json()
            for s in data.get("sessions", []):
                if s["name"] == name:
                    return s["id"]
    except Exception as e:
        log(f"Error getting sessions: {e}")
    return None


def create_session():
    payload = {
        "session_name": SESSION_NAME,
        "source_path": VIDEO_SOURCE,
        "model_name": "~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt",
        "language": "python+pytorch",
        "source_type": "video",
        "fps_target": 1,
        "conf_threshold": 0.25,
        "iou_threshold": 0.45,
        "save_video": True,
        "recording_mode": "clean",
    }
    resp = requests.post(f"{API_URL}/api/sessions/start", json=payload)
    if resp.status_code == 200:
        return resp.json()["session_id"]
    return None


def main():
    log("🚀 Starting Auto-Resume Test Scenerio")

    # 1. Ensure auto_resume is ENABLED via API (if there was a setting endpoint, but we set it in DB usually)
    # Ideally we'd check DB setting, but let's assume it's ON or we'll turn it on via SQL if needed.
    # For this test, we assume the user has enabled it or we can't easily test it without DB access.
    # Wait! The user asked "if ... start next.js server new ... will auto resume?".
    # This implies checking the BEHAVIOR.
    # We need to make sure 'auto_resume' setting is TRUE in the DB.
    # I'll use a helper to set it first.

    # 2. Start a session
    sid = get_session_id_by_name(SESSION_NAME)
    if sid:
        log(f"Found existing session {sid}, deleting...")
        requests.delete(f"{API_URL}/api/sessions/{sid}")
        time.sleep(1)

    log("Creating new session...")
    sid = create_session()
    if not sid:
        log("❌ Failed to create session")
        sys.exit(1)

    log(f"Session {sid} created. Checking status...")
    time.sleep(2)
    # Check if running
    resp = requests.get(f"{API_URL}/api/sessions")
    sessions = resp.json()["sessions"]
    s = next((x for x in sessions if x["id"] == sid), None)
    if s["status"] != "running":
        log(f"❌ Session NOT running (Status: {s['status']})")
        sys.exit(1)

    log("✅ Session is RUNNING. Running for 5 seconds...")
    time.sleep(5)

    # 3. Simulate Power Outage (Kill Backend)
    log("⚡ SIMULATING POWER OUTAGE (Killing backend)...")
    subprocess.run(["pkill", "-f", "uvicorn"], check=False)
    subprocess.run(["pkill", "-f", "python backend/main.py"], check=False)

    time.sleep(2)
    if check_health():
        log("❌ Backend still alive! Kill failed.")
        sys.exit(1)
    log("✅ Backend killed.")

    # 4. Restart Backend
    log("🔄 Restarting Backend...")
    # We use nohup similar to run_app.sh but simpler for test
    # Ensure env vars are loaded? run_app.sh does it.
    subprocess.Popen(
        ["./run_app.sh", "build"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )

    log("Waiting for backend to come up (max 30s)...")
    for i in range(30):
        if check_health():
            log("✅ Backend is UP!")
            break
        time.sleep(1)
        if i % 5 == 0:
            print(".", end="", flush=True)
    else:
        log("❌ Backend failed to start or timeout.")
        sys.exit(1)

    # 5. Verify Auto-Resume
    log("🔎 Verifying Auto-Resume Status...")
    time.sleep(5)  # Give it moment to resume

    try:
        resp = requests.get(f"{API_URL}/api/sessions")
        sessions = resp.json().get("sessions", [])
        s = next((x for x in sessions if x["id"] == sid), None)

        if not s:
            log("❌ Session disappeared!")
        elif s["status"] == "running":
            log(f"✅ SUCCESS: Session {sid} successfully AUTO-RESUMED! (Status: running)")
        else:
            log(f"❌ FAILURE: Session {sid} did NOT resume. Status: {s['status']}")
            log("Note: Auto-Resume might use 'stopped' if the setting is disabled.")

    except Exception as e:
        log(f"Error checking status: {e}")


if __name__ == "__main__":
    main()
