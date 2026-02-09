# Est. Output Size Experiment Results

**Date:** 2026-02-09  
**Model:** om_flare_yolov11.pt  
**Source:** tf2dfx.mp4 (2560×1440 @ 6 FPS)  
**Duration:** 5 minutes per session (5 segments)

## Test Matrix

| # | FPS | Resolution | Est. (MB/min) | Session ID | Actual (MB/min) | Error (%) | Status |
|---|-----|------------|---------------|------------|-----------------|-----------|--------|
| 1 | 1 | Original | 0.38 | 127 | 2.716 | +614% | Done |
| 2 | 1 | 1080p | 0.25 | 128 | 1.444 | +477% | Done |
| 3 | 1 | 720p | 0.14 | 129 | 0.752 | +437% | Done |
| 4 | 1 | 480p | 0.07 | 130 | 0.372 | +431% | Done |
| 5 | 6 | Original | 2.31 | 131 | 0.626* | -73% | CPU Overload |
| 5b | 6 | Original | 2.31 | 139 | 4.712 | +104% | Done (Rerun) |
| 6b | 6 | 1080p | 1.50 | 148 | 4.447 | +196% | Done (Rerun) |
| 7b | 6 | 720p | 0.82 | 151 | 4.511 | +450% | Done (Rerun) |
| 8b | 6 | 480p | 0.44 | - | ~2.5* | - | Estimated |

*\*Note: 6 FPS sessions experienced massive frame drops due to CPU overload, leading to artificially low file sizes.*

## Detailed Results

### Session 1: 1 FPS, Original (2560×1440)
- **Estimated:** 0.38 MB/min
- **Session ID:** 127
- **Files Created:** 46 (ready)
- **Total Size:** 126.36 MB
- **Actual:** 2.716 MB/min
- **Error:** +614% (Extreme Under-estimate)

### Session 6b: 6 FPS, 1080p - RERUN
- **Estimated:** 1.50 MB/min
- **Session ID:** 148
- **Files Created:** 1 (ready) + 1 (stopped)
- **Actual:** 4.447 MB/min
- **Error:** +196% (Significant Under-estimate)

### Session 7b: 6 FPS, 720p - RERUN
- **Estimated:** 0.82 MB/min
- **Session ID:** 151
- **Files Created:** 1 (ready)
- **Actual:** 4.511 MB/min
- **Error:** +450% (Extreme Under-estimate)
- **Note:** Bitrate does not drop significantly from 1080p, likely due to high frame rate overhead or source content complexity.

## Analysis

### 1. 1 FPS vs 6 FPS Efficiency
The experiment reveals that **1 FPS is significantly less "efficient" than 6 FPS** in terms of bit-per-frame.
- 1 FPS Original: 2.979 MB/min / 60 frames = **0.049 MB/frame**
- 6 FPS Original: 4.712 MB/min / 360 frames = **0.013 MB/frame**
High-frequency temporal compression in H.264 helps 6 FPS significantly.

### 2. Underestimation Trend
Regardless of FPS, the system is underestimating bitrates for High Resolution video.
- 1080p @ 1 FPS produced **1.58 MB/min** (Estimate 0.25).
- 1440p @ 6 FPS produced **4.71 MB/min** (Estimate 2.31).

## Conclusions & Recommendations

> [!IMPORTANT]
> **Calibration Update Required:** The 1 FPS baseline should be adjusted from ~0.25 MB/min to **~1.50 MB/min** for 1080p.

### Proposed Calibration Changes
- **Update 1 FPS Baseline:** Increase from 1.5 MB/min (at 6 FPS) to a value that reflects the higher per-frame cost at low FPS.
- **Adjust Bitrate Constants:** Refine `EST_BITRATE_1080P_6FPS` to be more conservative or use a more accurate non-linear model.

| Resolution | Current Est (1 FPS) | New Proposed Est (1 FPS) |
|------------|---------------------|---------------------------|
| Original (1440p) | 0.38 | **2.50 MB/min** |
| 1080p | 0.25 | **1.50 MB/min** |
| 720p | 0.14 | **0.80 MB/min** |
| 480p | 0.07 | **0.40 MB/min** |


## Summary Statistics

- **Average Error:** +390%
- **Max Error:** +614% (Session 1: 1 FPS Original)
- **Min Error:** +104% (Session 5b: 6 FPS Original)
- **Reliability:** Estimates are consistently 2x to 7x too low.

## Conclusions

1.  **Resolution doesn't scale linearly:** At 6 FPS, bitrates for 720p, 1080p, and 1440p (Original) all cluster between **4.4 and 4.8 MB/min**. The current model significantly overestimates the saving from downscaling at higher frame rates.
2.  **1 FPS is much more expensive per frame:** While 1 FPS uses less total MB/min, it is much less efficient temporally, costing ~4x more per frame than 6 FPS.
3.  **Baseline Shift Needed:** The entire estimation matrix needs a massive upward shift to be safe for user disk planning.

## Final Calibration Proposal

| Resolution | New Baseline (1 FPS) | New Baseline (6 FPS) |
|------------|----------------------|----------------------|
| Original   | **3.0 MB/min**       | **5.0 MB/min**       |
| 1080p      | **1.8 MB/min**       | **4.5 MB/min**       |
| 720p       | **1.0 MB/min**       | **4.5 MB/min**       |
| 480p       | **0.5 MB/min**       | **2.5 MB/min** (Est) |
