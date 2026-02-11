import cv2
import time
import os

SOURCE = "/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4"
OUTPUT_DIR = "benchmark_results"
os.makedirs(OUTPUT_DIR, exist_ok=True)

DURATION = 60  # seconds
TARGET_FPS = 1


def benchmark(codec, ext, name):
    print(f"Benchmarking {name} ({codec})...")
    cap = cv2.VideoCapture(SOURCE)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)

    output_path = os.path.join(OUTPUT_DIR, f"{name}.{ext}")

    fourcc = cv2.VideoWriter_fourcc(*codec)
    out = cv2.VideoWriter(output_path, fourcc, TARGET_FPS, (width, height))

    if not out.isOpened():
        print(f"Failed to open VideoWriter for {codec}")
        return None, None

    frame_count = 0
    start_time = time.time()

    frames_to_write = DURATION * TARGET_FPS

    stride = int(fps / TARGET_FPS)

    # Simulate reading loop for 1 minute content
    for i in range(frames_to_write):
        # Skip frames
        for _ in range(stride - 1):
            cap.grab()

        ret, frame = cap.read()
        if not ret:
            break

        out.write(frame)
        frame_count += 1

    out.release()
    cap.release()

    end_time = time.time()
    total_time = end_time - start_time
    file_size = os.path.getsize(output_path) / (1024 * 1024)  # MB

    print(f"Finished {name}:")
    print(f"  Time: {total_time:.2f}s")
    print(f"  Size: {file_size:.2f} MB")
    return total_time, file_size


def benchmark_convert(codec, ext, name):
    # 1. Capture as m4v/mp4v first
    print(f"Benchmarking {name} (Capture {codec} -> Convert H.264)...")
    temp_name = f"{name}_temp"
    capture_time, _ = benchmark(codec, ext, temp_name)

    if capture_time is None:
        return

    temp_path = os.path.join(OUTPUT_DIR, f"{temp_name}.{ext}")
    final_path = os.path.join(OUTPUT_DIR, f"{name}.mp4")

    # 2. Convert using FFMPEG
    print(f"  Converting {temp_path} to {final_path}...")
    start_conv = time.time()

    # Use ffmpeg to convert to H.264 (libx264)
    # -i input -c:v libx264 -preset fast -crf 23 -y output
    cmd = f"ffmpeg -i {temp_path} -c:v libx264 -preset fast -crf 23 -y {final_path}"

    # Run ffmpeg silently
    ret = os.system(f"{cmd} > /dev/null 2>&1")

    end_conv = time.time()
    conv_time = end_conv - start_conv

    if ret != 0:
        print("  FFMPEG conversion failed!")
        return

    total_workflow_time = capture_time + conv_time
    final_size = os.path.getsize(final_path) / (1024 * 1024)

    print(f"Finished {name} Workflow:")
    print(f"  Capture Time: {capture_time:.2f}s")
    print(f"  Convert Time: {conv_time:.2f}s")
    print(f"  Total Time:   {total_workflow_time:.2f}s")
    print(f"  Final Size:   {final_size:.2f} MB")


if __name__ == "__main__":
    # Test AVC1 - Direct (Baseline)
    benchmark("avc1", "mp4", "H264_AVC1")

    # Test M4V -> Convert Workflow
    benchmark_convert("mp4v", "mp4", "M4V_Convert")

    # VP9 (Slow, skipping to save time)
    # benchmark('vp09', 'webm', 'VP9_WEBM')
