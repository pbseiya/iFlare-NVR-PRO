#!/usr/bin/env python3
"""
Complete Workflow Test with VideoConverter
Tests: Recording → M4V Capture → H.264 Conversion → Playback
"""

import os
import sys
import cv2
import time
import asyncio
from pathlib import Path
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from database import Database
from inference_engine import VideoSegmentManager
from video_converter import VideoConverter


async def test_complete_workflow_with_converter():
    """Test complete workflow including H.264 conversion."""
    print("\n" + "=" * 70)
    print("Complete Workflow Test with H.264 Conversion")
    print("=" * 70)

    # Setup
    source_video = "/home/pongsak/projects/aiml/rtsp_server/demo_clips/tf2dfx.mp4"
    if not Path(source_video).exists():
        print(f"✗ Source video not found: {source_video}")
        return

    base_dir = "test_converter_workflow"
    session_id = 1001
    camera_id = "test_cam_converter"

    # Clean up previous test
    import shutil

    if Path(base_dir).exists():
        shutil.rmtree(base_dir)

    print(f"\n📋 Test Configuration:")
    print(f"  Source: {source_video}")
    print(f"  Base Dir: {base_dir}")
    print(f"  Session ID: {session_id}")
    print(f"  Camera ID: {camera_id}")

    # Step 1: Initialize Database and VideoConverter
    print(f"\n{'='*70}")
    print("STEP 1: Initialize Database and VideoConverter")
    print("=" * 70)

    database_url = os.getenv(
        "DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference"
    )
    db = Database(database_url)
    await db.connect()
    print("  ✓ Database connected")

    # Initialize VideoConverter with 1 worker for testing
    converter = VideoConverter(db, max_concurrent=1)
    await converter.start()
    print("  ✓ VideoConverter started (1 worker)")

    # Step 2: Source Analysis
    print(f"\n{'='*70}")
    print("STEP 2: Source Analysis")
    print("=" * 70)

    cap = cv2.VideoCapture(source_video)
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = cap.get(cv2.CAP_PROP_FPS)

    print(f"  Source Resolution: {source_width}x{source_height}")
    print(f"  Source FPS: {source_fps:.2f}")

    # Step 3: Recording with VideoConverter
    print(f"\n{'='*70}")
    print("STEP 3: Recording (10 seconds, 2 segments × 5s)")
    print("=" * 70)

    target_height = 480
    scale_factor = target_height / source_height
    store_width = int(source_width * scale_factor)
    store_height = target_height

    # Align to 2
    if store_width % 2 != 0:
        store_width -= 1
    if store_height % 2 != 0:
        store_height -= 1

    print(f"  Storage Resolution: {store_width}x{store_height}")
    print(f"  Scale Factor: {scale_factor:.4f}")

    segment_manager = VideoSegmentManager(
        db,
        session_id,
        base_dir,
        store_width,
        store_height,
        fps=source_fps,
        camera_id=camera_id,
        interval_seconds=5,  # 5-second segments
        converter=converter,  # Pass converter
    )

    frame_count = 0
    target_frames = int(source_fps * 10)  # 10 seconds

    print(f"  Target Frames: {target_frames}")

    while frame_count < target_frames:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                break

        # Resize frame for storage
        resized_frame = cv2.resize(frame, (store_width, store_height), interpolation=cv2.INTER_AREA)

        # Write to segment
        await segment_manager.write_frame(resized_frame)

        frame_count += 1

        if frame_count % 30 == 0:
            print(f"  Progress: {frame_count}/{target_frames} frames")

    await segment_manager.close()
    cap.release()

    print(f"\n  ✓ Recording complete: {frame_count} frames")

    # Step 4: Wait for Conversion
    print(f"\n{'='*70}")
    print("STEP 4: Waiting for H.264 Conversion")
    print("=" * 70)

    print("  Waiting for conversion queue to empty...")
    await converter.queue.join()
    print("  ✓ All conversions complete")

    # Give a moment for final DB updates
    await asyncio.sleep(1)

    # Step 5: Verify Results
    print(f"\n{'='*70}")
    print("STEP 5: Verify Conversion Results")
    print("=" * 70)

    # Check files
    m4v_files = list(Path(base_dir).rglob("*.m4v"))
    mp4_files = list(Path(base_dir).rglob("*.mp4"))

    print(f"\n  M4V Files (should be deleted): {len(m4v_files)}")
    for f in m4v_files:
        print(f"    ⚠ {f.relative_to(base_dir)}")

    print(f"\n  MP4 Files (converted): {len(mp4_files)}")
    for f in mp4_files:
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"    ✓ {f.relative_to(base_dir)} ({size_mb:.2f} MB)")

    # Check database
    async with db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, file_path, status, duration_seconds FROM video_segments WHERE session_id = $1 ORDER BY start_time",
            session_id,
        )

    print(f"\n  Database Segments:")
    for row in rows:
        file_path = Path(row["file_path"])
        exists = file_path.exists()
        status_icon = "✓" if exists else "✗"
        print(
            f"    {status_icon} ID {row['id']}: {row['status']} - {file_path.name} ({row['duration_seconds']:.1f}s)"
        )

    # Count by status
    ready_count = sum(1 for r in rows if r["status"] == "ready")
    processing_count = sum(1 for r in rows if r["status"] == "processing")
    failed_count = sum(1 for r in rows if r["status"] == "failed")

    print(f"\n  Status Summary:")
    print(f"    Ready: {ready_count}")
    print(f"    Processing: {processing_count}")
    print(f"    Failed: {failed_count}")

    # Step 6: Cleanup
    print(f"\n{'='*70}")
    print("STEP 6: Cleanup")
    print("=" * 70)

    await converter.stop()
    print("  ✓ VideoConverter stopped")

    await db.disconnect()
    print("  ✓ Database disconnected")

    # Summary
    print(f"\n{'='*70}")
    print("TEST SUMMARY")
    print("=" * 70)

    success = (
        len(m4v_files) == 0  # M4V files deleted
        and len(mp4_files) == 2  # 2 MP4 files created
        and ready_count == 2  # 2 segments ready
        and processing_count == 0  # No stuck processing
        and failed_count == 0  # No failures
    )

    if success:
        print(f"\n  ✅ ALL TESTS PASSED!")
        print(f"  ✓ M4V files cleaned up: {len(m4v_files) == 0}")
        print(f"  ✓ MP4 files created: {len(mp4_files) == 2}")
        print(f"  ✓ Segments ready: {ready_count == 2}")
        print(f"  ✓ No stuck conversions: {processing_count == 0}")
        print(f"  ✓ No failures: {failed_count == 0}")
    else:
        print(f"\n  ❌ SOME TESTS FAILED")
        print(f"  M4V files cleaned: {len(m4v_files) == 0} (expected: True)")
        print(f"  MP4 files created: {len(mp4_files) == 2} (expected: True)")
        print(f"  Segments ready: {ready_count == 2} (expected: True)")
        print(f"  No stuck conversions: {processing_count == 0} (expected: True)")
        print(f"  No failures: {failed_count == 0} (expected: True)")

    print(f"\n{'='*70}")
    print(f"Test files kept in '{base_dir}/' for inspection")
    print(f"Run 'rm -rf {base_dir}' to clean up manually")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_complete_workflow_with_converter())
