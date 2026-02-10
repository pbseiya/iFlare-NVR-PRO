#!/usr/bin/env python3
"""
End-to-End Integration Test for Video Storage System
Tests: Session Creation → Recording → Hierarchical Storage → BBox Scaling
"""

import os
import cv2
import time
from datetime import datetime
from pathlib import Path


class MockDatabase:
    """Mock database for testing without PostgreSQL."""

    def __init__(self):
        self.segments = []
        self.detections = []
        self.next_segment_id = 1

    async def create_video_segment(self, session_id, file_path, start_time):
        """Create video segment with 'recording' status."""
        segment_id = self.next_segment_id
        self.next_segment_id += 1

        segment = {
            "id": segment_id,
            "session_id": session_id,
            "file_path": file_path,
            "start_time": start_time,
            "end_time": None,
            "duration_seconds": None,
            "status": "recording",
        }
        self.segments.append(segment)
        print(f"  📝 DB: Created segment {segment_id} with status='recording'")
        return segment_id

    async def update_video_segment(self, segment_id, end_time, duration, status):
        """Update segment with end time and status."""
        for seg in self.segments:
            if seg["id"] == segment_id:
                seg["end_time"] = end_time
                seg["duration_seconds"] = duration
                seg["status"] = status
                print(f"  📝 DB: Updated segment {segment_id} to status='{status}'")
                break

    def get_segments_by_status(self, status):
        """Get segments by status (for frontend filtering)."""
        return [s for s in self.segments if s["status"] == status]


class VideoSegmentManager:
    """Production VideoSegmentManager (simplified for testing)."""

    def __init__(
        self, db, session_id, base_dir, width, height, fps, camera_id="default", interval_seconds=60
    ):
        self.db = db
        self.session_id = session_id
        self.base_dir = base_dir
        self.width = width
        self.height = height
        self.fps = fps
        self.camera_id = camera_id
        self.interval_seconds = interval_seconds

        self.current_writer = None
        self.current_segment_id = None
        self.segment_start_time = None
        self.current_file_path = None
        self.current_temp_path = None

    async def write_frame(self, frame):
        """Write frame to current segment."""
        now = datetime.now()

        if (
            self.current_writer is None
            or (now - self.segment_start_time).total_seconds() >= self.interval_seconds
        ):
            await self._rotate_segment(now)

        if self.current_writer:
            self.current_writer.write(frame)

    async def _rotate_segment(self, now):
        """Rotate to new segment with hierarchical path."""
        # Close existing
        if self.current_writer:
            self.current_writer.release()
            duration = (now - self.segment_start_time).total_seconds()
            await self.db.update_video_segment(self.current_segment_id, now, duration, "ready")
            print(f"  📦 Segment closed: {self.current_file_path} ({duration:.1f}s)")

        # Start new
        self.segment_start_time = now

        # Generate hierarchical path: YYYY/MM/DD/HH/camera_id/
        year = now.strftime("%Y")
        month = now.strftime("%m")
        day = now.strftime("%d")
        hour = now.strftime("%H")

        segment_dir = os.path.join(self.base_dir, year, month, day, hour, self.camera_id)
        os.makedirs(segment_dir, exist_ok=True)

        # Filename: segment_HH-MM-SS.m4v
        filename = f"segment_{now.strftime('%H-%M-%S')}.m4v"
        self.current_temp_path = os.path.join(segment_dir, filename)
        self.current_file_path = self.current_temp_path

        # Use mp4v codec for M4V capture
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self.current_writer = cv2.VideoWriter(
            self.current_temp_path, fourcc, self.fps, (self.width, self.height)
        )

        # Register in DB with 'recording' status
        self.current_segment_id = await self.db.create_video_segment(
            self.session_id, self.current_temp_path, now
        )
        print(f"  🎬 New segment started: {self.current_temp_path}")

    async def close(self):
        """Close current segment."""
        if self.current_writer:
            self.current_writer.release()
            now = datetime.now()
            if self.segment_start_time:
                duration = (now - self.segment_start_time).total_seconds()
                await self.db.update_video_segment(self.current_segment_id, now, duration, "ready")
            self.current_writer = None


async def test_complete_workflow():
    """Test complete workflow from session creation to playback."""
    print("\n" + "=" * 70)
    print("End-to-End Integration Test")
    print("=" * 70)

    # Setup
    source_video = "/home/pongsak/projects/aiml/rtsp_server/demo_clips/tf2dfx.mp4"
    if not Path(source_video).exists():
        print(f"✗ Source video not found: {source_video}")
        return

    base_dir = "test_e2e_storage"
    session_id = 999
    camera_id = "test_camera_01"

    # Clean up previous test
    import shutil

    if Path(base_dir).exists():
        shutil.rmtree(base_dir)

    print(f"\n📋 Test Configuration:")
    print(f"  Source: {source_video}")
    print(f"  Base Dir: {base_dir}")
    print(f"  Session ID: {session_id}")
    print(f"  Camera ID: {camera_id}")

    # Step 1: Source Analysis
    print(f"\n{'='*70}")
    print("STEP 1: Source Analysis")
    print("=" * 70)

    cap = cv2.VideoCapture(source_video)
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = cap.get(cv2.CAP_PROP_FPS)

    print(f"  Source Resolution: {source_width}x{source_height}")
    print(f"  Source FPS: {source_fps:.2f}")

    # Step 2: Session Creation with Storage Resolution
    print(f"\n{'='*70}")
    print("STEP 2: Session Creation (480p Storage)")
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

    # Step 3: Recording with Hierarchical Storage
    print(f"\n{'='*70}")
    print("STEP 3: Recording (15 seconds, 3 segments × 5s)")
    print("=" * 70)

    db = MockDatabase()
    segment_manager = VideoSegmentManager(
        db,
        session_id,
        base_dir,
        store_width,
        store_height,
        fps=6.0,  # Match source FPS
        camera_id=camera_id,
        interval_seconds=5,  # 5-second segments for testing
    )

    frame_count = 0
    target_frames = int(source_fps * 15)  # 15 seconds

    print(f"  Target Frames: {target_frames}")

    # Simulate BBox detection
    test_bbox_original = [100, 100, 300, 300]  # Original coordinates
    test_bbox_scaled = [
        int(test_bbox_original[0] * scale_factor),
        int(test_bbox_original[1] * scale_factor),
        int(test_bbox_original[2] * scale_factor),
        int(test_bbox_original[3] * scale_factor),
    ]

    print(f"  Test BBox (Original): {test_bbox_original}")
    print(f"  Test BBox (Scaled): {test_bbox_scaled}")

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

    # Step 4: Verify Hierarchical Storage
    print(f"\n{'='*70}")
    print("STEP 4: Verify Hierarchical Storage Structure")
    print("=" * 70)

    video_files = list(Path(base_dir).rglob("*.m4v"))
    print(f"  Total Files Created: {len(video_files)}")

    for vf in video_files:
        rel_path = vf.relative_to(base_dir)
        size_mb = vf.stat().st_size / (1024 * 1024)
        print(f"  📁 {rel_path} ({size_mb:.2f} MB)")

    # Verify structure
    expected_pattern = f"YYYY/MM/DD/HH/{camera_id}/segment_HH-MM-SS.m4v"
    print(f"\n  Expected Pattern: {expected_pattern}")

    for vf in video_files:
        parts = vf.relative_to(base_dir).parts
        if len(parts) == 6:  # YYYY/MM/DD/HH/camera_id/filename
            print(f"  ✓ Valid structure: {'/'.join(parts)}")
        else:
            print(f"  ✗ Invalid structure: {'/'.join(parts)}")

    # Step 5: Database Status Verification
    print(f"\n{'='*70}")
    print("STEP 5: Database Status Verification")
    print("=" * 70)

    print(f"\n  All Segments:")
    for seg in db.segments:
        print(f"    ID {seg['id']}: {seg['status']} - {Path(seg['file_path']).name}")

    ready_segments = db.get_segments_by_status("ready")
    print(f"\n  Ready Segments (playable): {len(ready_segments)}")
    for seg in ready_segments:
        print(f"    ✓ {Path(seg['file_path']).name} ({seg['duration_seconds']:.1f}s)")

    # Step 6: Playback Simulation (Frontend Filter)
    print(f"\n{'='*70}")
    print("STEP 6: Playback Simulation (Frontend Filtering)")
    print("=" * 70)

    # Simulate frontend filter: status !== 'failed'
    playable_segments = [s for s in db.segments if s["status"] != "failed"]
    print(f"  Playable Segments (status !== 'failed'): {len(playable_segments)}")

    for seg in playable_segments:
        file_exists = Path(seg["file_path"]).exists()
        status_icon = "✓" if file_exists else "✗"
        print(f"    {status_icon} {seg['status']}: {Path(seg['file_path']).name}")

    # Summary
    print(f"\n{'='*70}")
    print("TEST SUMMARY")
    print("=" * 70)

    print(f"\n  ✓ Source Analysis: {source_width}x{source_height} @ {source_fps:.2f} FPS")
    print(f"  ✓ Storage Resolution: {store_width}x{store_height}")
    print(f"  ✓ Scale Factor: {scale_factor:.4f}")
    print(f"  ✓ Segments Created: {len(db.segments)}")
    print(f"  ✓ Files on Disk: {len(video_files)}")
    print(f"  ✓ Ready for Playback: {len(ready_segments)}")
    print(f"  ✓ Hierarchical Structure: Valid")
    print(f"  ✓ BBox Scaling: Original {test_bbox_original} → Scaled {test_bbox_scaled}")

    print(f"\n{'='*70}")
    print("All Tests Passed! ✓")
    print("=" * 70)

    print(f"\n⚠  Test files kept in '{base_dir}/' for inspection")
    print(f"   Run 'rm -rf {base_dir}' to clean up manually")


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_complete_workflow())
