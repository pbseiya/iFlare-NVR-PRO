# Est. Output Size Accuracy Experiment

## Objective
Test the accuracy of Est. Output Size calculation by comparing estimated values with actual file sizes across different configurations.

## Experiment Design

### Fixed Parameters
- **Model:** `~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt`
- **Source:** `/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4` (2560×1440 @ 6 FPS)
- **Recording Duration:** 5 minutes per session (5 segments × 60 seconds)
- **Recording Mode:** Clean (no bounding boxes)

### Variable Parameters

**FPS Target:** 2 levels
- 1 FPS
- 6 FPS

**Storage Resolution:** 4 levels
- Original (2560×1440)
- 1080p (1920×1080)
- 720p (1280×720)
- 480p (852×480)

**Total Combinations:** 2 × 4 = **8 sessions**

## Test Matrix

| Session | FPS | Resolution | Est. Size (MB/min) | Actual Size (MB/min) | Error (%) |
|---------|-----|------------|-------------------|---------------------|-----------|
| 1 | 1 | Original | ? | ? | ? |
| 2 | 1 | 1080p | ? | ? | ? |
| 3 | 1 | 720p | ? | ? | ? |
| 4 | 1 | 480p | ? | ? | ? |
| 5 | 6 | Original | ? | ? | ? |
| 6 | 6 | 1080p | ? | ? | ? |
| 7 | 6 | 720p | ? | ? | ? |
| 8 | 6 | 480p | ? | ? | ? |

## Procedure

### Phase 1: Record Estimated Values

For each session:
1. Open New Session Config form
2. Set Source Path and click "Analyze Source"
3. Configure FPS Target and Storage Resolution
4. **Record Est. Output Size** from UI
5. Start session
6. Wait 5 minutes (until 5 segments recorded)
7. Stop session
8. Record session ID

### Phase 2: Measure Actual File Sizes

For each session:
1. Query database for file paths:
   ```sql
   SELECT file_path FROM video_segments 
   WHERE session_id = ? AND status = 'ready'
   ```

2. Calculate total file size:
   ```bash
   du -b <file1> <file2> ... | awk '{sum+=$1} END {print sum}'
   ```

3. Calculate MB/min:
   ```
   Actual MB/min = (Total Bytes / 1048576) / 5
   ```

4. Calculate error:
   ```
   Error % = ((Actual - Estimated) / Estimated) × 100
   ```

### Phase 3: Analysis

1. Calculate average error across all sessions
2. Identify which configurations have highest/lowest error
3. Determine if error is systematic (always over/under estimate)
4. Update calibration constants if needed

## Automation Script

```python
#!/usr/bin/env python3
"""
Automated Est. Output Size Accuracy Test
"""

import requests
import time
import subprocess
import json
from pathlib import Path

BASE_URL = "http://localhost:8000"
MODEL_PATH = "~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt"
SOURCE_PATH = "/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4"

# Test configurations
CONFIGS = [
    {"fps": 1, "resolution": 0, "name": "1fps_original"},
    {"fps": 1, "resolution": 1080, "name": "1fps_1080p"},
    {"fps": 1, "resolution": 720, "name": "1fps_720p"},
    {"fps": 1, "resolution": 480, "name": "1fps_480p"},
    {"fps": 6, "resolution": 0, "name": "6fps_original"},
    {"fps": 6, "resolution": 1080, "name": "6fps_1080p"},
    {"fps": 6, "resolution": 720, "name": "6fps_720p"},
    {"fps": 6, "resolution": 480, "name": "6fps_480p"},
]

results = []

for config in CONFIGS:
    print(f"\n{'='*60}")
    print(f"Testing: {config['name']}")
    print(f"{'='*60}")
    
    # 1. Analyze source to get estimate
    analyze_resp = requests.post(
        f"{BASE_URL}/api/analyze-source",
        json={"source_path": SOURCE_PATH}
    )
    source_info = analyze_resp.json()
    
    # Calculate estimated size (would need to replicate frontend logic)
    # For now, we'll capture it manually from UI
    estimated_mb_min = input(f"Enter Est. Output Size from UI for {config['name']}: ")
    
    # 2. Start session
    session_resp = requests.post(
        f"{BASE_URL}/api/sessions/start",
        json={
            "source_path": SOURCE_PATH,
            "source_type": "video",
            "model_name": MODEL_PATH,
            "language": "python+pytorch",
            "conf_threshold": 0.25,
            "iou_threshold": 0.45,
            "fps_target": config["fps"],
            "target_height": config["resolution"],
            "recording_mode": "clean",
            "save_video": True,
            "session_name": f"EST_TEST_{config['name']}"
        }
    )
    session_id = session_resp.json()["session_id"]
    print(f"✓ Session {session_id} started")
    
    # 3. Wait 5 minutes
    print("⏳ Recording for 5 minutes...")
    time.sleep(300)
    
    # 4. Stop session
    requests.post(f"{BASE_URL}/api/sessions/{session_id}/stop")
    print(f"✓ Session {session_id} stopped")
    
    # 5. Wait for conversion to complete
    print("⏳ Waiting for conversion...")
    time.sleep(30)
    
    # 6. Get file paths from database
    # (Would need database connection - simplified here)
    
    # 7. Calculate actual size
    # (Would use du command on actual files)
    
    # Store results
    results.append({
        "config": config["name"],
        "session_id": session_id,
        "fps": config["fps"],
        "resolution": config["resolution"],
        "estimated_mb_min": float(estimated_mb_min),
        # "actual_mb_min": actual_mb_min,  # To be filled
        # "error_percent": error_percent,   # To be calculated
    })
    
    print(f"✓ Test complete for {config['name']}")

# Save results
with open("est_size_test_results.json", "w") as f:
    json.dump(results, indent=2, fp=f)

print("\n" + "="*60)
print("All tests complete! Results saved to est_size_test_results.json")
print("="*60)
```

## Manual Testing Workflow

### Step-by-Step Instructions

**For each configuration:**

1. **Open browser** → http://localhost:3000

2. **Configure session:**
   - Session Name: `EST_TEST_<fps>fps_<resolution>`
   - Model Path: `~/projects/yolov11_inference_cpu/models/om_flare_yolov11.pt`
   - Source Path: `/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4`
   - Click "Analyze Source"
   - Set FPS Target: 1 or 6
   - Set Storage Resolution: Original/1080p/720p/480p

3. **Record estimate:**
   - Note down "Est. Output Size" value
   - Take screenshot

4. **Start session:**
   - Click "Start Session"
   - Note session ID

5. **Wait 5 minutes:**
   - Monitor segment creation
   - Should create 5 segments

6. **Stop session:**
   - Click "Stop Session"

7. **Measure actual size:**
   ```bash
   # Get session ID from UI
   SESSION_ID=<id>
   
   # Find video files
   find videos/output -name "*.mp4" | grep session_${SESSION_ID}
   
   # Calculate total size
   du -ch videos/output/*/session_${SESSION_ID}/*.mp4 | grep total
   
   # Or use database query
   docker exec 41f3a1e273a8 psql -U admin -d yolov11_inference \
     -c "SELECT file_path FROM video_segments WHERE session_id = ${SESSION_ID}"
   ```

8. **Calculate error:**
   ```python
   total_mb = <total_size_from_du> / 1024 / 1024
   actual_mb_min = total_mb / 5
   error_percent = ((actual_mb_min - estimated_mb_min) / estimated_mb_min) * 100
   ```

## Expected Results

### Hypothesis

Based on current calibration (1.5 MB/min @ 6 FPS, 1080p):

**FPS=1:**
- Original: ~0.63 MB/min
- 1080p: ~0.25 MB/min
- 720p: ~0.13 MB/min
- 480p: ~0.08 MB/min

**FPS=6:**
- Original: ~3.75 MB/min
- 1080p: ~1.50 MB/min
- 720p: ~0.78 MB/min
- 480p: ~0.45 MB/min

### Success Criteria

- **Good:** Error < ±20% for all configurations
- **Acceptable:** Error < ±30% for most configurations
- **Needs Adjustment:** Error > ±30% consistently

## Data Collection Template

```markdown
## Session 1: 1 FPS, Original
- **Estimated:** ___ MB/min
- **Session ID:** ___
- **Files Created:** ___
- **Total Size:** ___ MB
- **Actual:** ___ MB/min
- **Error:** ___% (over/under)

## Session 2: 1 FPS, 1080p
...
```

## Next Steps After Experiment

1. **If error is acceptable (< ±20%):**
   - Document calibration accuracy
   - No changes needed

2. **If error is systematic:**
   - Adjust calibration constants
   - Re-test with 1-2 configurations

3. **If error varies by resolution:**
   - Update resolution scaling factor
   - Consider separate calibration per resolution

4. **If error varies by FPS:**
   - Verify linear FPS scaling assumption
   - Consider non-linear correction factor

## Notes

- Use **H.264 final file size** (MP4), not M4V
- Wait for all conversions to complete before measuring
- Video loops continuously, so 5 minutes = ~10 loops of 30s video
- Detections may vary slightly per loop, affecting file size
