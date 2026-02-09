import asyncio
import os
import subprocess
import json


async def run_command(cmd):
    process = await asyncio.create_subprocess_shell(
        cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate()
    return stdout.decode().strip(), stderr.decode().strip(), process.returncode


async def get_duration(file_path: str) -> float:
    """Get duration of video file using ffprobe"""
    if not os.path.exists(file_path):
        return 0.0

    cmd = f"ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {file_path}"
    stdout, _, _ = await run_command(cmd)
    try:
        return float(stdout)
    except:
        return 0.0


async def db_query(query):
    # Escape double quotes for shell
    query = query.replace('"', '\\"')
    cmd = f'docker exec 41f3a1e273a8 psql -U admin -d yolov11_inference -t -c "{query}"'
    stdout, stderr, code = await run_command(cmd)
    if code != 0:
        raise Exception(f"DB Error: {stderr}")
    return stdout


async def main():
    print("Finding segments with 0 duration...")

    # Get ID and File Path. Output format: id|file_path
    try:
        # Use simple string concatenation for output format in PSQL
        output = await db_query(
            "SELECT id || '|' || file_path FROM video_segments WHERE status = 'ready' AND duration_seconds = 0"
        )
    except Exception as e:
        print(f"Failed to query DB: {e}")
        return

    lines = output.split("\n")
    count = 0

    for line in lines:
        line = line.strip()
        if not line or "|" not in line:
            continue

        parts = line.split("|")
        if len(parts) < 2:
            continue

        segment_id = parts[0].strip()
        file_path = parts[1].strip()

        if not segment_id or not file_path:
            continue

        print(f"Processing segment {segment_id}: {file_path}")

        duration = await get_duration(file_path)

        if duration > 0:
            print(f"  -> Duration: {duration:.2f}s. Updating DB...")
            try:
                # Update duration
                await db_query(
                    f"UPDATE video_segments SET duration_seconds = {duration}, end_time = start_time + make_interval(secs => {duration}) WHERE id = {segment_id}"
                )
                count += 1
            except Exception as e:
                print(f"  -> Failed to update DB: {e}")
        else:
            print(f"  -> Failed to get duration (file missing or invalid).")

    print(f"Done. Fixed {count} segments.")


if __name__ == "__main__":
    asyncio.run(main())
