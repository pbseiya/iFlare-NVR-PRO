import subprocess
import os
import re
from gtts import gTTS
from pydub import AudioSegment

# Configuration
project_dir = "/home/pongsak/projects/yolov11_inference_cpu"
materials_dir = os.path.join(project_dir, "explainer_materials")
input_video = os.path.join(materials_dir, "combined_explainer.mp4")
input_srt = os.path.join(materials_dir, "combined_explainer.srt")
output_audio = os.path.join(materials_dir, "combined_audio.mp3")
output_video = os.path.join(materials_dir, "explainer_with_voiceover.mp4")

# Font for Hardsubs (Verified path)
font_path = "/usr/share/fonts/truetype/noto/NotoSerifThai-Regular.ttf"


def get_video_duration(file_path):
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


# 1. Parse SRT
print("Parsing SRT...")
subtitles = []
with open(input_srt, "r") as f:
    content = f.read()
    blocks = re.split(r"\n\n+", content.strip())
    for block in blocks:
        lines = block.split("\n")
        if len(lines) >= 3:
            timing_match = re.search(
                r"(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})", lines[1]
            )
            if timing_match:
                start_time = parse_time(timing_match.group(1))
                text = " ".join(lines[2:])
                subtitles.append({"start": start_time, "text": text})

# 2. Generate Audio Track & Correct SRT
print("Generating TTS Audio and Correcting Timings...")
video_duration = get_video_duration(input_video)
base_audio = AudioSegment.silent(duration=int(video_duration * 1000 + 5000))  # Add 5s buffer

corrected_subtitles = []
current_audio_time_ms = 0
min_gap_ms = 250  # Minimum gap between clips

for i, sub in enumerate(subtitles):
    print(f"Processing ({i+1}/{len(subtitles)}): {sub['text'][:30]}...")

    # Generate TTS
    tts = gTTS(text=sub["text"], lang="th")
    temp_file = os.path.join(materials_dir, "temp_tts.mp3")
    tts.save(temp_file)
    clip = AudioSegment.from_mp3(temp_file)

    # Speed up slightly (1.1x) to ensure fit
    # clip = clip.speedup(playback_speed=1.1)

    clip_duration_ms = len(clip)

    # Calculate Start Time (ms)
    # Rule: Start at SRT time, BUT if previous clip hasn't finished, wait for it + gap
    srt_start_ms = int(sub["start"] * 1000)
    safe_start_ms = max(srt_start_ms, current_audio_time_ms + min_gap_ms)

    # Overlay Audio
    base_audio = base_audio.overlay(clip, position=safe_start_ms)

    # Update Tracking
    current_audio_time_ms = safe_start_ms + clip_duration_ms

    # Record new timing for SRT
    new_start_sec = safe_start_ms / 1000.0
    new_end_sec = current_audio_time_ms / 1000.0
    corrected_subtitles.append(
        {"index": i + 1, "start": new_start_sec, "end": new_end_sec, "text": sub["text"]}
    )

    if os.path.exists(temp_file):
        os.remove(temp_file)

# Trim audio to video duration (or slightly longer if needed, but video length dictates visual)
# If audio is longer than video, we might cut off speech. Let's warn.
if current_audio_time_ms > (video_duration * 1000):
    print(
        f"WARNING: Total audio duration ({current_audio_time_ms/1000}s) exceeds video duration ({video_duration}s). Speech may be truncated!"
    )
else:
    base_audio = base_audio[: int(video_duration * 1000)]

base_audio.export(output_audio, format="mp3")
print(f"Created Audio: {output_audio}")

# 3. Write Corrected SRT
corrected_srt_path = os.path.join(materials_dir, "corrected_for_voiceover.srt")


def format_timestamp(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


with open(corrected_srt_path, "w") as f:
    for sub in corrected_subtitles:
        f.write(f"{sub['index']}\n")
        f.write(f"{format_timestamp(sub['start'])} --> {format_timestamp(sub['end'])}\n")
        f.write(f"{sub['text']}\n\n")

print(f"Created Corrected SRT: {corrected_srt_path}")

# 4. Merge Video + Audio + Hardsubs
print("Merging and Hardcoding Subtitles...")
ffmpeg_font_path = font_path.replace("\\", "/").replace(":", "\\:")

# Use relative path for subtitles to avoid complex escaping issues in filter
rel_srt = os.path.relpath(corrected_srt_path, start=project_dir)

cmd = [
    "ffmpeg",
    "-y",
    "-i",
    input_video,
    "-i",
    output_audio,
    # -map 0:v (Video from input 0)
    # -map 1:a (Audio from input 1 - NEW TRACK ONLY)
    # hardsub uses the NEW corrected SRT
    "-filter_complex",
    f"[0:v]subtitles='{corrected_srt_path}':force_style='Fontname=Noto Serif Thai,Fontsize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=20'[v]",
    "-map",
    "[v]",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest",
    output_video,
]

subprocess.run(cmd, check=True)
print(f"Created Final Video: {output_video}")
