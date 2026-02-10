import json
import subprocess
import os
import re

results = []
for i in range(127, 160):
    # Query database for segments using timestamp extraction for duration
    cmd = f"docker exec 41f3a1e273a8 psql -U admin -d yolov11_inference -A -t -F '|' -c \"SELECT file_path, EXTRACT(EPOCH FROM (end_time - start_time)) as duration FROM video_segments WHERE session_id = {i} AND status = 'ready'\""
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate()

    if stderr:
        print(f"Error querying DB for session {i}: {stderr.decode()}")
        continue

    output = stdout.decode().strip()
    if not output:
        print(f"No ready segments for session {i}")
        continue

    lines = output.split("\n")

    total_bytes = 0
    total_duration = 0
    file_count = 0

    for line in lines:
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 2:
            path = parts[0].strip()
            path = re.sub(r"[\r\n]", "", path)
            duration_str = parts[1].strip()

            if not path or not duration_str:
                continue
            try:
                duration = float(duration_str)
                # Filter out garbage segments (e.g. extremely short ones)
                if duration < 0.1:
                    continue

                if os.path.exists(path):
                    file_size = os.path.getsize(path)
                    total_bytes += file_size
                    total_duration += duration
                    file_count += 1
                else:
                    rel_path = path.replace("/home/pongsak/projects/yolov11_inference_cpu/", "./")
                    if os.path.exists(rel_path):
                        file_size = os.path.getsize(rel_path)
                        total_bytes += file_size
                        total_duration += duration
                        file_count += 1
            except Exception as e:
                pass

    if total_duration > 0:
        actual_mb_min = (total_bytes / 1024 / 1024) / (total_duration / 60)
        results.append(
            {
                "id": i,
                "count": file_count,
                "duration_total_sec": round(total_duration, 2),
                "total_mb": round(total_bytes / 1024 / 1024, 2),
                "mb_min": round(actual_mb_min, 3),
            }
        )

print(json.dumps(results, indent=2))
