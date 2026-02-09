# Video Looping Analysis & Implementation Plan

## Current Status Analysis

### ✅ What's Already Working

The current code **ALREADY supports video looping** through the reconnection loop mechanism:

**Location:** `backend/inference_engine.py` (Lines 511-770)

```python
# Main Reconnection Loop (Infinite for Anti-Stale)
while True:  # Line 513 - Outer infinite loop
    cap = None
    try:
        # ... open video file ...
        
        # Inner frame processing loop
        while True:  # Line 558 - Inner loop for frames
            ret, frame = await asyncio.to_thread(cap.read)
            if not ret:
                break  # Exit inner loop when video ends
            
            # ... process frame ...
        
        # End of Inner Loop
        if cap:
            await asyncio.to_thread(cap.release)
        
        # Video looping is handled by re-opening the file
        if is_live:
            await asyncio.sleep(1)
        else:
            await asyncio.sleep(0.1)  # Small delay before restart
            
    except Exception as e:
        # ... error handling ...
```

**How it works:**
1. **Outer Loop** (`while True` at line 513) - Never exits unless cancelled
2. **Inner Loop** (line 558) - Processes frames until video ends (`ret == False`)
3. **Video Restart** (line 768-770) - Releases cap, sleeps 0.1s, then outer loop restarts
4. **Re-opening** - Outer loop re-opens the video file from the beginning

### 🔍 Potential Issues to Check

#### 1. **Frame Position Reset**
**Issue:** Code sets `start_frame` on first open (line 536-537)
```python
if not is_live and start_frame > 0:
    await asyncio.to_thread(cap.set, cv2.CAP_PROP_POS_FRAMES, start_frame)
```

**Problem:** If `start_frame > 0`, video will restart from that frame, not from 0.

**Solution:** For looping, `start_frame` should be 0 or reset after first iteration.

#### 2. **Session End Condition**
**Issue:** Code has `break` statement for file not found (line 534)
```python
if not cap.isOpened():
    if is_live:
        await asyncio.sleep(5)
        continue
    else:
        break  # File not found, stop.
```

**Problem:** If file path is invalid, session stops instead of retrying.

**Solution:** This is correct behavior - invalid files should stop, not loop.

#### 3. **Frame Stride Calculation**
**Issue:** Frame stride is calculated once (line 544-551)
```python
frame_stride = int(source_fps / fps_target)
```

**Problem:** None - this is correct for consistent FPS across loops.

---

## Test Scenario Requirements

### User Request:
- **Source:** `/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4`
- **Storage Resolution:** Original (no resize)
- **FPS Target:** 1 FPS
- **Behavior:** Loop video indefinitely (simulate RTSP stream)

### Expected Behavior:
1. Open video file
2. Process frames at 1 FPS
3. When video ends, restart from beginning
4. Continue looping until session is stopped

---

## Implementation Analysis

### ✅ Current Code Supports This

**No code changes needed!** The current implementation already:

1. ✅ **Loops indefinitely** - Outer `while True` loop
2. ✅ **Restarts video** - Releases and re-opens on each iteration
3. ✅ **Maintains FPS target** - Frame stride persists across loops
4. ✅ **Simulates RTSP** - Continuous playback with time throttling

### ⚠️ Potential Edge Cases

#### Edge Case 1: `start_frame` Parameter
**Current Behavior:**
- If `start_frame > 0`, video restarts from that frame on **every loop**
- This is likely **unintended** for looping scenarios

**Recommendation:**
- For looping, always use `start_frame = 0`
- Or reset `start_frame = 0` after first iteration

**Code Location:** Line 536-537

#### Edge Case 2: Video End Detection
**Current Behavior:**
```python
ret, frame = await asyncio.to_thread(cap.read)
if not ret:
    break  # Exit inner loop
```

**Analysis:**
- ✅ Correctly detects video end
- ✅ Exits inner loop
- ✅ Outer loop restarts video

**No issues here.**

#### Edge Case 3: Segment Manager Persistence
**Current Behavior:**
- `segment_manager` is created once (line 619-634)
- Persists across video loops
- Continues recording across restarts

**Analysis:**
- ✅ **Correct for looping** - Segments span multiple video loops
- ✅ Recording is continuous, not reset per loop

---

## Testing Plan

### Step 1: Clean Database
```sql
-- Delete all existing sessions
DELETE FROM video_segments;
DELETE FROM detections;
DELETE FROM performance_metrics;
DELETE FROM inference_sessions;
```

Or via API:
```bash
# Get all sessions
curl http://localhost:8000/api/sessions

# Delete each session
curl -X DELETE http://localhost:8000/api/sessions/{session_id}
```

### Step 2: Create Test Session

**API Request:**
```json
POST /api/sessions/start
{
  "source_path": "/home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4",
  "source_type": "video",
  "model_name": "~/models/yolo11n.pt",
  "conf_threshold": 0.25,
  "iou_threshold": 0.45,
  "fps_target": 1,
  "target_height": 0,  // 0 = original resolution
  "recording_mode": "clean",
  "save_video": true,
  "session_name": "video_loop_test"
}
```

### Step 3: Monitor Behavior

**Expected Observations:**

1. **Console Output:**
```
🔌 Connecting to source: /home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4
🎬 New segment started: videos/2026/02/09/18/video_loop_test/segment_18-45-00.m4v
... (processing frames at 1 FPS) ...
📦 Segment closed, queued for conversion: ... (60.0s)
🎬 New segment started: videos/2026/02/09/18/video_loop_test/segment_18-46-00.m4v
... (video ends, inner loop breaks) ...
🔌 Connecting to source: /home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4  ← RESTART
... (continues looping) ...
```

2. **Database:**
- Segments created continuously
- Timestamps increment across loops
- No gaps in recording

3. **File System:**
- M4V files created every 60 seconds
- VideoConverter processes them to MP4
- Hierarchical structure maintained

### Step 4: Verify Loop Behavior

**Check 1: Video Duration**
```bash
# Get video duration
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 \
  /home/pongsak/projects/rtsp_server/demo_clips/tf2dfx.mp4
```

Expected: ~30 seconds (or whatever the actual duration is)

**Check 2: Recording Duration**
- Let session run for 2-3 minutes
- Check database for total recording time
- Should be > video duration (proving it looped)

**Check 3: Frame Timestamps**
- Query detections table
- Verify timestamps are continuous
- No resets or gaps when video restarts

---

## Potential Issues & Solutions

### Issue 1: `start_frame` Interference

**Problem:**
If `start_frame > 0` is set in config, video will restart from that frame on every loop.

**Current Code:**
```python
if not is_live and start_frame > 0:
    await asyncio.to_thread(cap.set, cv2.CAP_PROP_POS_FRAMES, start_frame)
```

**Solution Option 1: Reset after first use**
```python
if not is_live and start_frame > 0:
    await asyncio.to_thread(cap.set, cv2.CAP_PROP_POS_FRAMES, start_frame)
    start_frame = 0  # Reset for subsequent loops
```

**Solution Option 2: Document behavior**
- Add comment explaining that `start_frame` applies to all loops
- User should set `start_frame = 0` for looping scenarios

**Recommendation:** Option 1 (reset after first use)

### Issue 2: Loop Counter (Optional Enhancement)

**Current:** No loop counter

**Enhancement:**
```python
loop_count = 0
while True:
    loop_count += 1
    print(f"🔄 Video loop iteration: {loop_count}")
    # ... rest of code ...
```

**Benefit:** Easier debugging and monitoring

---

## Configuration Recommendations

### For Video Looping (RTSP Simulation):

```json
{
  "source_type": "video",
  "fps_target": 1,           // Slow down playback
  "target_height": 0,        // Original resolution
  "start_frame": 0,          // Always start from beginning
  "recording_mode": "clean", // Record without annotations
  "save_video": true
}
```

### For One-Time Video Processing:

```json
{
  "source_type": "video",
  "fps_target": 0,           // Process all frames
  "target_height": 480,      // Resize for storage
  "start_frame": 0,
  "recording_mode": "none",  // Don't record
  "save_video": false
}
```

---

## Summary

### ✅ Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Video Looping | ✅ Working | Outer loop restarts video automatically |
| FPS Control | ✅ Working | Frame stride maintained across loops |
| Continuous Recording | ✅ Working | Segments span multiple loops |
| RTSP Simulation | ✅ Working | Infinite playback with throttling |

### ⚠️ Minor Improvements Needed

1. **`start_frame` Reset** - Reset to 0 after first iteration
2. **Loop Counter** (Optional) - Add for monitoring
3. **Documentation** - Add comments explaining loop behavior

### 🎯 Testing Checklist

- [ ] Delete all existing sessions
- [ ] Create session with video source
- [ ] Set `fps_target = 1`, `target_height = 0`
- [ ] Monitor console for restart messages
- [ ] Verify recording spans multiple video loops
- [ ] Check database for continuous timestamps
- [ ] Confirm no gaps in segment creation

---

## Conclusion

**The current code ALREADY supports video looping!** 

The outer `while True` loop (line 513) ensures the video restarts indefinitely. The only minor issue is the `start_frame` parameter, which should be reset after the first iteration to ensure loops start from frame 0.

**No major code changes required** - the system is ready for RTSP simulation via video looping.
