#!/usr/bin/env python3
"""
Simplified VideoConverter Test (No Database Required)
Tests: M4V Capture → H.264 Conversion → Cleanup
"""

import os
import cv2
import time
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime


async def test_video_converter_logic():
    """Test VideoConverter conversion logic without database."""
    print("\n" + "=" * 70)
    print("VideoConverter Logic Test (Simplified)")
    print("=" * 70)

    # Setup
    source_video = "/home/pongsak/projects/aiml/rtsp_server/demo_clips/tf2dfx.mp4"
    if not Path(source_video).exists():
        print(f"✗ Source video not found: {source_video}")
        return

    test_dir = "test_converter_simple"

    # Clean up previous test
    import shutil

    if Path(test_dir).exists():
        shutil.rmtree(test_dir)
    Path(test_dir).mkdir(parents=True)

    print(f"\n📋 Test Configuration:")
    print(f"  Source: {source_video}")
    print(f"  Test Dir: {test_dir}")

    # Step 1: Create M4V file
    print(f"\n{'='*70}")
    print("STEP 1: Create M4V File (mp4v codec)")
    print("=" * 70)

    cap = cv2.VideoCapture(source_video)
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = cap.get(cv2.CAP_PROP_FPS)

    # 480p storage
    target_height = 480
    scale_factor = target_height / source_height
    store_width = int(source_width * scale_factor)
    store_height = target_height

    if store_width % 2 != 0:
        store_width -= 1
    if store_height % 2 != 0:
        store_height -= 1

    print(f"  Source: {source_width}x{source_height} @ {source_fps:.2f} FPS")
    print(f"  Storage: {store_width}x{store_height}")

    m4v_path = Path(test_dir) / "test_segment.m4v"
    mp4_path = Path(test_dir) / "test_segment.mp4"

    # Record 5 seconds to M4V
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(m4v_path), fourcc, source_fps, (store_width, store_height))

    frame_count = 0
    target_frames = int(source_fps * 5)  # 5 seconds

    start_time = time.time()
    while frame_count < target_frames:
        ret, frame = cap.read()
        if not ret:
            break

        resized = cv2.resize(frame, (store_width, store_height), interpolation=cv2.INTER_AREA)
        writer.write(resized)
        frame_count += 1

    writer.release()
    cap.release()
    capture_time = time.time() - start_time

    m4v_size = m4v_path.stat().st_size / (1024 * 1024)
    print(f"\n  ✓ M4V Created: {m4v_path.name}")
    print(f"    Capture Time: {capture_time:.2f}s")
    print(f"    File Size: {m4v_size:.2f} MB")
    print(f"    Frames: {frame_count}")

    # Step 2: Convert to H.264
    print(f"\n{'='*70}")
    print("STEP 2: Convert M4V → H.264 (FFmpeg)")
    print("=" * 70)

    cmd = [
        "ffmpeg",
        "-i",
        str(m4v_path),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-y",
        str(mp4_path),
    ]

    print(f"  Running: {' '.join(cmd[:6])}...")

    start_time = time.time()
    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )

    stdout, stderr = await process.communicate()
    conversion_time = time.time() - start_time

    if process.returncode == 0 and mp4_path.exists():
        mp4_size = mp4_path.stat().st_size / (1024 * 1024)
        compression = (1 - mp4_size / m4v_size) * 100

        print(f"\n  ✓ Conversion Successful")
        print(f"    Conversion Time: {conversion_time:.2f}s")
        print(f"    Output Size: {mp4_size:.2f} MB")
        print(f"    Compression: {compression:.1f}%")
        print(f"    Total Time: {capture_time + conversion_time:.2f}s")
    else:
        print(f"\n  ✗ Conversion Failed")
        print(f"    Exit Code: {process.returncode}")
        return

    # Step 3: Cleanup M4V
    print(f"\n{'='*70}")
    print("STEP 3: Cleanup Temp File")
    print("=" * 70)

    m4v_path.unlink()
    print(f"  ✓ Deleted: {m4v_path.name}")

    # Step 4: Verify Final State
    print(f"\n{'='*70}")
    print("STEP 4: Verify Final State")
    print("=" * 70)

    m4v_exists = m4v_path.exists()
    mp4_exists = mp4_path.exists()

    print(f"\n  M4V File Exists: {m4v_exists} (expected: False)")
    print(f"  MP4 File Exists: {mp4_exists} (expected: True)")

    if mp4_exists:
        # Verify MP4 is playable
        test_cap = cv2.VideoCapture(str(mp4_path))
        is_playable = test_cap.isOpened()
        test_cap.release()
        print(f"  MP4 Playable: {is_playable} (expected: True)")

    # Summary
    print(f"\n{'='*70}")
    print("TEST SUMMARY")
    print("=" * 70)

    success = not m4v_exists and mp4_exists and is_playable

    if success:
        print(f"\n  ✅ ALL TESTS PASSED!")
        print(f"  ✓ M4V capture: {capture_time:.2f}s")
        print(f"  ✓ H.264 conversion: {conversion_time:.2f}s")
        print(f"  ✓ Total workflow: {capture_time + conversion_time:.2f}s")
        print(f"  ✓ Compression: {compression:.1f}%")
        print(f"  ✓ Temp file cleaned: Yes")
        print(f"  ✓ Output playable: Yes")
    else:
        print(f"\n  ❌ SOME TESTS FAILED")

    print(f"\n{'='*70}")
    print(f"Test files kept in '{test_dir}/' for inspection")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_video_converter_logic())
