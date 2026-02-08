import cv2
import numpy as np
import glob
import os


def check_video_for_boxes(video_path, num_frames=5):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Could not open {video_path}")
        return False, False, False

    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Checking {os.path.basename(video_path)} ({frame_count} frames)...")

    # Sample frames
    indices = np.linspace(0, frame_count - 1, num_frames, dtype=int)

    found_blue = False
    found_white = False
    found_cyan = False

    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        # Check for Blue (OpenCV HSV: H=100-140)
        lower_blue = np.array([100, 150, 50])
        upper_blue = np.array([140, 255, 255])
        mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
        blue_pixels = cv2.countNonZero(mask_blue)

        # Check for Cyan (06b6d4 is roughly Cyan/Teal) - H=80-100
        lower_cyan = np.array([80, 150, 50])
        upper_cyan = np.array([100, 255, 255])
        mask_cyan = cv2.inRange(hsv, lower_cyan, upper_cyan)
        cyan_pixels = cv2.countNonZero(mask_cyan)

        # Check for White (Low Saturation, High Value)
        # S < 20, V > 230
        lower_white = np.array([0, 0, 230])
        upper_white = np.array([180, 20, 255])
        mask_white = cv2.inRange(hsv, lower_white, upper_white)
        white_pixels = cv2.countNonZero(mask_white)

        if blue_pixels > 200:
            found_blue = True
            print(f"  Frame {idx}: DETECTED BLUE ({blue_pixels} px)")

        if cyan_pixels > 200:
            found_cyan = True
            print(f"  Frame {idx}: DETECTED CYAN ({cyan_pixels} px)")

        if white_pixels > 200:
            found_white = True
            print(f"  Frame {idx}: DETECTED WHITE ({white_pixels} px)")

        if found_blue and found_white and found_cyan:  # Updated condition to include cyan
            break  # Found all, likely annotated

    cap.release()
    return found_blue, found_white, found_cyan


def main():
    # Check session 97 and 96
    base_dir = "/home/pongsak/projects/yolov11_inference_cpu/videos/output"
    sessions = ["session_97", "session_96"]

    for session in sessions:
        print(f"\n--- Checking {session} ---")
        path = os.path.join(base_dir, session)
        if not os.path.exists(path):
            print(f"Directory {path} not found.")
            continue

        files = glob.glob(os.path.join(path, "*.webm"))
        files.sort()

        for f in files:
            blue, white, cyan = check_video_for_boxes(f)
            if blue and white:
                print(
                    f"🚨 ALERT: {os.path.basename(f)} likely has BLUE BOXES (Blue+White detected)."
                )
            elif cyan and white:
                print(
                    f"🚨 ALERT: {os.path.basename(f)} likely has CYAN BOXES (Cyan+White detected)."
                )
            elif white:
                print(
                    f"ℹ️ INFO: {os.path.basename(f)} has WHITE pixels (could be bright spots or text)."
                )
            else:
                print(f"✅ CLEAN: {os.path.basename(f)} seems clean.")


if __name__ == "__main__":
    main()
