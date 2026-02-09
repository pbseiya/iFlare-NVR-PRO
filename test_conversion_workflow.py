#!/usr/bin/env python3
"""
Prototype test script for M4V to H.264 conversion workflow.
Tests capture, conversion, status tracking, and cleanup.
"""

import os
import cv2
import time
import subprocess
from datetime import datetime
from pathlib import Path
from enum import Enum


class SegmentStatus(Enum):
    """Video segment processing status."""

    RECORDING = "recording"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class VideoSegment:
    """Represents a video segment with status tracking."""

    def __init__(self, path: Path, status: SegmentStatus = SegmentStatus.RECORDING):
        self.path = path
        self.status = status
        self.created_at = datetime.now()
        self.converted_at = None
        self.error = None

    def __repr__(self):
        return f"VideoSegment({self.path.name}, {self.status.value})"


class ConversionWorkflow:
    """Manages M4V capture and H.264 conversion workflow."""

    def __init__(self, base_dir: str = "test_conversion"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(exist_ok=True)
        self.segments = []

    def capture_m4v(
        self, source_video: str, output_name: str, duration_sec: int = 10
    ) -> VideoSegment:
        """
        Capture video segment as M4V.

        Args:
            source_video: Path to source video file
            output_name: Output filename (without extension)
            duration_sec: Duration to capture in seconds

        Returns:
            VideoSegment object with RECORDING status
        """
        print(f"\n{'='*60}")
        print(f"PHASE 1: Capturing M4V segment")
        print(f"{'='*60}")

        output_path = self.base_dir / f"{output_name}.m4v"
        segment = VideoSegment(output_path, SegmentStatus.RECORDING)
        self.segments.append(segment)

        # Open source video
        cap = cv2.VideoCapture(source_video)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open source video: {source_video}")

        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        print(f"Source: {source_video}")
        print(f"Resolution: {width}x{height} @ {fps:.2f} FPS")
        print(f"Output: {output_path}")
        print(f"Duration: {duration_sec}s")

        # Create VideoWriter with mp4v codec
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        if not writer.isOpened():
            raise RuntimeError("Failed to create VideoWriter")

        # Capture frames
        start_time = time.time()
        frame_count = 0
        target_frames = int(fps * duration_sec)

        print(f"\nCapturing {target_frames} frames...")

        while frame_count < target_frames:
            ret, frame = cap.read()
            if not ret:
                # Loop video if needed
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
                if not ret:
                    break

            writer.write(frame)
            frame_count += 1

            if frame_count % 30 == 0:
                progress = (frame_count / target_frames) * 100
                print(f"  Progress: {frame_count}/{target_frames} frames ({progress:.1f}%)")

        writer.release()
        cap.release()

        elapsed = time.time() - start_time
        file_size = output_path.stat().st_size / (1024 * 1024)

        print(f"\n✓ Capture complete:")
        print(f"  Time: {elapsed:.2f}s")
        print(f"  Frames: {frame_count}")
        print(f"  File size: {file_size:.2f} MB")
        print(f"  Status: {segment.status.value}")

        return segment

    def convert_to_h264(self, segment: VideoSegment) -> bool:
        """
        Convert M4V segment to H.264.

        Args:
            segment: VideoSegment to convert

        Returns:
            True if conversion successful, False otherwise
        """
        print(f"\n{'='*60}")
        print(f"PHASE 2: Converting to H.264")
        print(f"{'='*60}")

        if not segment.path.exists():
            print(f"✗ Error: Source file not found: {segment.path}")
            segment.status = SegmentStatus.FAILED
            segment.error = "Source file not found"
            return False

        # Update status to PROCESSING
        segment.status = SegmentStatus.PROCESSING
        print(f"Status: {segment.status.value}")

        # Generate output path
        output_path = segment.path.with_suffix(".mp4")

        # FFmpeg command
        cmd = [
            "ffmpeg",
            "-i",
            str(segment.path),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-y",  # Overwrite
            str(output_path),
        ]

        print(f"\nInput: {segment.path.name}")
        print(f"Output: {output_path.name}")
        print(f"Command: {' '.join(cmd)}")

        # Run conversion
        start_time = time.time()

        try:
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)

            elapsed = time.time() - start_time

            if result.returncode == 0:
                # Verify output file
                if output_path.exists() and output_path.stat().st_size > 0:
                    output_size = output_path.stat().st_size / (1024 * 1024)
                    input_size = segment.path.stat().st_size / (1024 * 1024)

                    segment.status = SegmentStatus.READY
                    segment.converted_at = datetime.now()

                    print(f"\n✓ Conversion successful:")
                    print(f"  Time: {elapsed:.2f}s")
                    print(f"  Input size: {input_size:.2f} MB")
                    print(f"  Output size: {output_size:.2f} MB")
                    print(f"  Compression: {(1 - output_size/input_size)*100:.1f}%")
                    print(f"  Status: {segment.status.value}")

                    return True
                else:
                    raise RuntimeError("Output file is empty or missing")
            else:
                raise RuntimeError(f"FFmpeg failed with code {result.returncode}")

        except Exception as e:
            segment.status = SegmentStatus.FAILED
            segment.error = str(e)
            print(f"\n✗ Conversion failed:")
            print(f"  Error: {e}")
            print(f"  Status: {segment.status.value}")
            return False

    def cleanup_temp_file(self, segment: VideoSegment) -> bool:
        """
        Delete temporary M4V file after successful conversion.

        Args:
            segment: VideoSegment to clean up

        Returns:
            True if cleanup successful
        """
        print(f"\n{'='*60}")
        print(f"PHASE 3: Cleanup")
        print(f"{'='*60}")

        if segment.status != SegmentStatus.READY:
            print(f"⚠ Skipping cleanup - segment not ready (status: {segment.status.value})")
            return False

        if segment.path.exists():
            size_mb = segment.path.stat().st_size / (1024 * 1024)
            segment.path.unlink()
            print(f"✓ Deleted temp file: {segment.path.name} ({size_mb:.2f} MB)")
            return True
        else:
            print(f"⚠ Temp file already deleted: {segment.path.name}")
            return False

    def get_final_path(self, segment: VideoSegment) -> Path:
        """Get final MP4 path for a segment."""
        return segment.path.with_suffix(".mp4")

    def print_summary(self):
        """Print summary of all segments."""
        print(f"\n{'='*60}")
        print(f"WORKFLOW SUMMARY")
        print(f"{'='*60}\n")

        for i, seg in enumerate(self.segments, 1):
            print(f"Segment {i}:")
            print(f"  Name: {seg.path.name}")
            print(f"  Status: {seg.status.value}")
            print(f"  Created: {seg.created_at.strftime('%H:%M:%S')}")
            if seg.converted_at:
                duration = (seg.converted_at - seg.created_at).total_seconds()
                print(f"  Converted: {seg.converted_at.strftime('%H:%M:%S')} ({duration:.2f}s)")
            if seg.error:
                print(f"  Error: {seg.error}")

            # Check final file
            final_path = self.get_final_path(seg)
            if final_path.exists():
                size_mb = final_path.stat().st_size / (1024 * 1024)
                print(f"  Final file: {final_path.name} ({size_mb:.2f} MB)")
            print()


def test_full_workflow():
    """Test complete M4V to H.264 workflow."""
    print("\n" + "=" * 60)
    print("M4V to H.264 Conversion Workflow Test")
    print("=" * 60)

    # Find source video
    source_video = "/home/pongsak/projects/aiml/rtsp_server/demo_clips/tf2dfx.mp4"

    if not Path(source_video).exists():
        print(f"✗ Source video not found: {source_video}")
        return

    workflow = ConversionWorkflow("test_conversion")

    # Test 1: Successful workflow
    print("\n" + "=" * 60)
    print("TEST 1: Complete Workflow (Capture → Convert → Cleanup)")
    print("=" * 60)

    segment = workflow.capture_m4v(source_video, "test_segment_01", duration_sec=10)

    if workflow.convert_to_h264(segment):
        workflow.cleanup_temp_file(segment)

    # Test 2: Multiple segments
    print("\n" + "=" * 60)
    print("TEST 2: Multiple Segments")
    print("=" * 60)

    for i in range(2, 4):
        segment = workflow.capture_m4v(source_video, f"test_segment_{i:02d}", duration_sec=5)
        workflow.convert_to_h264(segment)
        workflow.cleanup_temp_file(segment)

    # Print summary
    workflow.print_summary()

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)


def cleanup():
    """Remove test files."""
    import shutil

    if Path("test_conversion").exists():
        shutil.rmtree("test_conversion")
        print("\n✓ Cleaned up test files")


if __name__ == "__main__":
    try:
        test_full_workflow()
    finally:
        # Keep files for inspection
        print("\n⚠ Test files kept in 'test_conversion/' for inspection")
        print("  Run 'rm -rf test_conversion' to clean up manually")
