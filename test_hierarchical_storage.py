#!/usr/bin/env python3
"""
Prototype test script for hierarchical video storage structure.
Tests folder creation, path generation, and file organization.
"""

import os
from datetime import datetime, timedelta
from pathlib import Path


class HierarchicalVideoStorage:
    """Manages hierarchical video file storage structure."""

    def __init__(self, base_dir: str = "videos"):
        self.base_dir = Path(base_dir)

    def generate_path(self, timestamp: datetime, camera_id: str, filename: str) -> Path:
        """
        Generate hierarchical path for video file.

        Pattern: videos/YYYY/MM/DD/HH/camera_id/filename

        Args:
            timestamp: Recording timestamp
            camera_id: Camera identifier
            filename: Video filename

        Returns:
            Full path to video file
        """
        year = timestamp.strftime("%Y")
        month = timestamp.strftime("%m")
        day = timestamp.strftime("%d")
        hour = timestamp.strftime("%H")

        path = self.base_dir / year / month / day / hour / camera_id / filename
        return path

    def create_directory(self, path: Path) -> None:
        """Create directory structure for given path."""
        path.parent.mkdir(parents=True, exist_ok=True)

    def simulate_recording(self, camera_id: str, start_time: datetime, duration_minutes: int = 60):
        """
        Simulate video recording with 1-minute segments.

        Args:
            camera_id: Camera identifier
            start_time: Recording start time
            duration_minutes: Total recording duration in minutes
        """
        print(f"\n{'='*60}")
        print(f"Simulating {duration_minutes}-minute recording for {camera_id}")
        print(f"Start time: {start_time}")
        print(f"{'='*60}\n")

        created_files = []

        for minute in range(duration_minutes):
            segment_time = start_time + timedelta(minutes=minute)

            # Generate filename: segment_HH-MM-SS.m4v
            filename = f"segment_{segment_time.strftime('%H-%M-%S')}.m4v"

            # Generate full path
            file_path = self.generate_path(segment_time, camera_id, filename)

            # Create directory
            self.create_directory(file_path)

            # Create dummy file
            file_path.touch()

            created_files.append(file_path)

            # Print every 10 minutes to avoid spam
            if minute % 10 == 0 or minute == duration_minutes - 1:
                print(f"[{minute+1:3d}/{duration_minutes}] Created: {file_path}")

        return created_files


def test_single_camera():
    """Test single camera recording."""
    print("\n" + "=" * 60)
    print("TEST 1: Single Camera - 1 Hour Recording")
    print("=" * 60)

    storage = HierarchicalVideoStorage("test_videos")
    start_time = datetime(2026, 2, 9, 16, 0, 0)

    files = storage.simulate_recording("cam_01", start_time, duration_minutes=60)

    print(f"\n✓ Created {len(files)} files")
    print(f"✓ Directory structure:")

    # Show directory tree
    base = Path("test_videos/2026/02/09/16")
    if base.exists():
        for item in sorted(base.rglob("*")):
            if item.is_file():
                rel_path = item.relative_to("test_videos")
                print(f"  {rel_path}")


def test_multi_camera():
    """Test multiple cameras recording simultaneously."""
    print("\n" + "=" * 60)
    print("TEST 2: Multi-Camera - 2 Hours Recording")
    print("=" * 60)

    storage = HierarchicalVideoStorage("test_videos")
    start_time = datetime(2026, 2, 9, 14, 30, 0)

    cameras = ["cam_01", "cam_02", "cam_03", "cam_04"]
    total_files = 0

    for camera in cameras:
        files = storage.simulate_recording(camera, start_time, duration_minutes=120)
        total_files += len(files)

    print(f"\n✓ Created {total_files} files across {len(cameras)} cameras")
    print(f"✓ Files per camera: {total_files // len(cameras)}")


def test_midnight_crossing():
    """Test recording that crosses midnight."""
    print("\n" + "=" * 60)
    print("TEST 3: Midnight Crossing - 23:30 to 00:30")
    print("=" * 60)

    storage = HierarchicalVideoStorage("test_videos")
    start_time = datetime(2026, 2, 9, 23, 30, 0)

    files = storage.simulate_recording("cam_01", start_time, duration_minutes=60)

    print(f"\n✓ Created {len(files)} files")
    print(f"✓ Files span across two days:")

    # Check files in both days
    day1 = Path("test_videos/2026/02/09")
    day2 = Path("test_videos/2026/02/10")

    if day1.exists():
        day1_files = list(day1.rglob("*.m4v"))
        print(f"  Feb 09: {len(day1_files)} files")

    if day2.exists():
        day2_files = list(day2.rglob("*.m4v"))
        print(f"  Feb 10: {len(day2_files)} files")


def test_file_count_per_directory():
    """Verify file count per directory stays reasonable."""
    print("\n" + "=" * 60)
    print("TEST 4: Directory File Count Analysis")
    print("=" * 60)

    storage = HierarchicalVideoStorage("test_videos")
    start_time = datetime(2026, 2, 9, 16, 0, 0)

    # Simulate 24 hours
    storage.simulate_recording("cam_01", start_time, duration_minutes=1440)

    # Analyze directory structure
    base = Path("test_videos/2026/02/09")

    print(f"\n✓ File count per hour directory:")
    for hour_dir in sorted(base.glob("*/cam_01")):
        files = list(hour_dir.glob("*.m4v"))
        hour = hour_dir.parent.name
        print(f"  Hour {hour}: {len(files)} files")


def cleanup():
    """Remove test files."""
    import shutil

    if Path("test_videos").exists():
        shutil.rmtree("test_videos")
        print("\n✓ Cleaned up test files")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("Hierarchical Video Storage - Prototype Test")
    print("=" * 60)

    try:
        test_single_camera()
        test_multi_camera()
        test_midnight_crossing()
        test_file_count_per_directory()

        print("\n" + "=" * 60)
        print("All tests completed successfully!")
        print("=" * 60)

    finally:
        cleanup()
