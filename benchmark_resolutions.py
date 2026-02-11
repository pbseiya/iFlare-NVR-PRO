import urllib.request
import json
import time
import os
import cv2

BASE_URL = "http://localhost:8000/api/sessions"
SOURCE = "/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4"
MODEL = "models/om_flare_yolov11.pt"
FPS_TARGET = 6

configs = [("Original", None), ("720p", 720), ("480p", 480)]

print(f"Starting Benchmark using source: {SOURCE}")
print(f"Target FPS: {FPS_TARGET}")

results = []

for name, height in configs:
    print(f"\n--- Testing {name} (Target Height: {height}) ---")

    # Start Session
    payload = {
        "name": f"Benchmark_{name}",
        "source_path": SOURCE,
        "model_name": MODEL,
        "confidence": 0.25,
        "iou": 0.45,
        "fps_target": FPS_TARGET,
        "recording_mode": "clean",
        "save_video": True,
        "video_height": height,
    }

    req = urllib.request.Request(
        f"{BASE_URL}/start",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    session_id = None
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
            session_id = data["session_id"]
            print(f"Started Session ID: {session_id}")
    except Exception as e:
        print(f"Failed to start session: {e}")
        continue

    # Record for 70 seconds
    print("Recording for 70 seconds...")
    time.sleep(70)

    # Stop Session
    if session_id:
        try:
            req_stop = urllib.request.Request(f"{BASE_URL}/{session_id}/stop", method="POST")
            with urllib.request.urlopen(req_stop) as response:
                print("Session Stopped.")
        except Exception as e:
            print(f"Failed to stop session: {e}")

    # Wait for file save
    time.sleep(5)

    # Find output file
    output_dir = f"/home/pongsak/projects/yolov11_inference_cpu/videos/output/session_{session_id}"
    try:
        if not os.path.exists(output_dir):
            print(f"Output directory not found: {output_dir}")
            continue

        files = sorted([f for f in os.listdir(output_dir) if f.endswith(".webm")])
        if not files:
            print("No video file found!")
            continue

        video_path = os.path.join(output_dir, files[-1])
        size_bytes = os.path.getsize(video_path)
        size_mb = size_bytes / (1024 * 1024)

        # Get Duration/Res
        cap = cv2.VideoCapture(video_path)
        w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        fps = cap.get(cv2.CAP_PROP_FRAME_FPS)
        cap.release()

        duration = count / fps if fps > 0 else 0

        print(f"File: {files[-1]}")
        print(f"Size: {size_mb:.2f} MB")
        print(f"Resolution: {int(w)}x{int(h)}")
        print(f"Duration: {duration:.2f}s")

        results.append(
            {
                "name": name,
                "height": height,
                "size_mb": size_mb,
                "res": f"{int(w)}x{int(h)}",
                "duration": duration,
            }
        )

    except Exception as e:
        print(f"Error analyzing file: {e}")

print("\n=== Benchmark Results (Approx 1 Min Recording) ===")
print(f"{'Name':<10} | {'Resolution':<10} | {'Size (MB)':<10} | {'Duration (s)':<12}")
print("-" * 50)
for r in results:
    print(f"{r['name']:<10} | {r['res']:<10} | {r['size_mb']:<10.2f} | {r['duration']:<12.2f}")
