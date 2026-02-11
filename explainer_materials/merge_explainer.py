import subprocess
import os
import re

# File paths
clips_dir = "/home/pongsak/projects/yolov11_inference_cpu/explainer_materials/clips"
output_dir = "/home/pongsak/projects/yolov11_inference_cpu/explainer_materials"
clip_files = ["clip_1_dashboard.mp4", "clip_2_cameras.mp4", "clip_3_recordings.mp4"]
srt_files = ["clip_1_dashboard.srt", "clip_2_cameras.srt", "clip_3_recordings.srt"]

output_video = os.path.join(output_dir, "combined_explainer.mp4")
output_srt = os.path.join(output_dir, "combined_explainer.srt")


def get_duration(file_path):
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file_path,
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return float(result.stdout.strip())


def parse_time(time_str):
    h, m, s_ms = time_str.split(":")
    s, ms = s_ms.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def format_time(total_seconds):
    h = int(total_seconds // 3600)
    m = int((total_seconds % 3600) // 60)
    s = int(total_seconds % 60)
    ms = int((total_seconds - int(total_seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# 1. Concatenate Videos (Re-encoding required due to format mismatch)
print("Concatenating videos with re-encoding...")

# Create filter complex for scaling and concatenation
inputs = []
filter_parts = []

for i in range(len(clip_files)):
    inputs.extend(["-i", os.path.join(clips_dir, clip_files[i])])
    filter_parts.append(
        f"[{i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v{i}];"
    )

concat_filter = "".join(filter_parts)
concat_filter += "".join([f"[v{i}]" for i in range(len(clip_files))])
concat_filter += f"concat=n={len(clip_files)}:v=1:a=0[v]"

cmd = (
    ["ffmpeg", "-y"]
    + inputs
    + [
        "-filter_complex",
        concat_filter,
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        output_video,
    ]
)

subprocess.run(cmd, check=True)
print(f"Created: {output_video}")

# 2. Merge SRTs with Offset
print("Merging SRTs...")
current_offset = 0.0
subtitle_index = 1
merged_content = ""

for i, srt_file in enumerate(srt_files):
    video_path = os.path.join(clips_dir, clip_files[i])
    duration = get_duration(video_path)

    srt_path = os.path.join(clips_dir, srt_file)
    if os.path.exists(srt_path):
        with open(srt_path, "r") as f:
            content = f.read()

        # Parse blocks
        blocks = re.split(r"\n\n+", content.strip())
        for block in blocks:
            lines = block.split("\n")
            if len(lines) >= 3:
                # Timing line
                timing_match = re.search(
                    r"(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})", lines[1]
                )
                if timing_match:
                    start_time = parse_time(timing_match.group(1)) + current_offset
                    end_time = parse_time(timing_match.group(2)) + current_offset

                    new_timing = f"{format_time(start_time)} --> {format_time(end_time)}"
                    text = "\n".join(lines[2:])

                    merged_content += f"{subtitle_index}\n{new_timing}\n{text}\n\n"
                    subtitle_index += 1

    current_offset += duration

with open(output_srt, "w") as f:
    f.write(merged_content)

print(f"Created: {output_srt}")

# Cleanup
if os.path.exists(concat_list_path):
    os.remove(concat_list_path)
