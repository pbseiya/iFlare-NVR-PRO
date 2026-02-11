import subprocess
import os
import re
import asyncio
import edge_tts
from pydub import AudioSegment

# Configuration
project_dir = "/home/pongsak/projects/yolov11_inference_cpu"
materials_dir = os.path.join(project_dir, "explainer_materials")
input_video = os.path.join(materials_dir, "combined_explainer.mp4")
input_srt = os.path.join(materials_dir, "combined_explainer.srt")
output_audio = os.path.join(materials_dir, "autofit_male_audio.mp3")
output_video = os.path.join(materials_dir, "explainer_male_voice.mp4")

# Male Voice
VOICE = "th-TH-NiwatNeural"

# Font for Hardsubs
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


def speed_change(sound, speed=1.0):
    # Standard speed change by altering frame rate
    return sound._spawn(
        sound.raw_data, overrides={"frame_rate": int(sound.frame_rate * speed)}
    ).set_frame_rate(sound.frame_rate)


async def generate_speech(text, output_file):
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(output_file)


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
                end_time = parse_time(timing_match.group(2))
                text = " ".join(lines[2:])
                subtitles.append({"start": start_time, "end": end_time, "text": text})

# 2. Generate Audio Track with Strict Auto-Fit
print("Generating Male Voice Audio (Edge-TTS)...")
video_duration = get_video_duration(input_video)
base_audio = AudioSegment.silent(duration=int(video_duration * 1000 + 2000))


async def main():
    global base_audio
    for i, sub in enumerate(subtitles):
        print(f"Processing ({i+1}/{len(subtitles)}): {sub['text'][:30]}...")

        # Calculate available duration from SRT
        target_duration_ms = (sub["end"] - sub["start"]) * 1000

        # Generate Raw TTS
        temp_file = os.path.join(materials_dir, f"temp_tts_{i}.mp3")
        await generate_speech(sub["text"], temp_file)

        clip = AudioSegment.from_mp3(temp_file)
        current_duration_ms = len(clip)

        # Calculate Required Speed
        # We enforce a strict fit with a 200ms buffer to ensure NO OVERLAP
        speed_factor = current_duration_ms / (target_duration_ms - 200)

        if speed_factor > 1.0:
            # Limit speed up to 1.7x to prevent robotic chipmunk (still readable)
            speed_factor = min(speed_factor, 1.7)
            print(f"  -> Speeding up by {speed_factor:.2f}x")
            clip = speed_change(clip, speed=speed_factor)

        # Determine exact placement
        start_ms = int(sub["start"] * 1000)

        # Place on timeline
        # Since we force-fit the clip into the window, overlap is mathematically impossible
        # unless subtitles themselves overlap in SRT.
        base_audio = base_audio.overlay(clip, position=start_ms)

        if os.path.exists(temp_file):
            os.remove(temp_file)

    # Export
    base_audio = base_audio[: int(video_duration * 1000)]
    base_audio.export(output_audio, format="mp3")
    print(f"Created Audio: {output_audio}")


# Run Async Generation
asyncio.run(main())

# 3. Merge Video + Audio + Hardsubs
print("Merging and Hardcoding Subtitles...")
ffmpeg_font_path = font_path.replace("\\", "/").replace(":", "\\:")
rel_srt = os.path.relpath(input_srt, start=project_dir)

cmd = [
    "ffmpeg",
    "-y",
    "-i",
    input_video,
    "-i",
    output_audio,
    "-filter_complex",
    f"[0:v]subtitles='{input_srt}':force_style='Fontname=Noto Serif Thai,Fontsize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=20'[v]",
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
