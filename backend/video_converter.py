"""
Video Converter Service
Background task manager for M4V to H.264 conversion.
"""

import os
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ConversionJob:
    """Represents a video conversion job."""

    segment_id: int
    input_path: str
    output_path: str
    session_id: int
    retry_count: int = 0
    max_retries: int = 3


class VideoConverter:
    """
    Background service for converting M4V videos to H.264.

    Features:
    - Queue-based conversion system
    - Retry logic for failed conversions
    - Startup recovery scan for orphaned files
    """

    def __init__(self, db, max_concurrent: int = 2):
        """
        Initialize VideoConverter.

        Args:
            db: Database instance
            max_concurrent: Maximum concurrent conversions
        """
        self.db = db
        self.max_concurrent = max_concurrent
        self.queue: asyncio.Queue = asyncio.Queue()
        self.active_jobs: List[ConversionJob] = []
        self.running = False
        self.workers: List[asyncio.Task] = []

    async def start(self):
        """Start the conversion service."""
        if self.running:
            logger.warning("VideoConverter already running")
            return

        self.running = True
        logger.info(f"Starting VideoConverter with {self.max_concurrent} workers")

        # Start worker tasks
        for i in range(self.max_concurrent):
            worker = asyncio.create_task(self._worker(i))
            self.workers.append(worker)

        # Run startup recovery scan
        await self._recovery_scan()

    async def stop(self):
        """Stop the conversion service."""
        logger.info("Stopping VideoConverter...")
        self.running = False

        # Wait for queue to empty
        await self.queue.join()

        # Cancel workers
        for worker in self.workers:
            worker.cancel()

        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        logger.info("VideoConverter stopped")

    async def enqueue(self, segment_id: int, input_path: str, session_id: int):
        """
        Add a conversion job to the queue.

        Args:
            segment_id: Database segment ID
            input_path: Path to M4V file
            session_id: Session ID
        """
        # Generate output path (replace .m4v with .mp4)
        output_path = str(Path(input_path).with_suffix(".mp4"))

        job = ConversionJob(
            segment_id=segment_id,
            input_path=input_path,
            output_path=output_path,
            session_id=session_id,
        )

        await self.queue.put(job)
        logger.info(f"Enqueued conversion job: {Path(input_path).name} -> {Path(output_path).name}")

    async def _worker(self, worker_id: int):
        """
        Worker task that processes conversion jobs.

        Args:
            worker_id: Worker identifier
        """
        logger.info(f"Worker {worker_id} started")

        while self.running:
            try:
                # Get job from queue (with timeout to allow graceful shutdown)
                try:
                    job = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                self.active_jobs.append(job)
                logger.info(f"Worker {worker_id} processing: {Path(job.input_path).name}")

                # Update status to 'processing'
                await self.db.update_video_segment(
                    job.segment_id,
                    datetime.now(),
                    0,  # Duration will be updated later
                    "processing",
                )

                # Perform conversion
                success = await self._convert(job)

                if success:
                    # Update status to 'ready' and update file path
                    await self._finalize_conversion(job)
                else:
                    # Retry or mark as failed
                    await self._handle_failure(job)

                self.active_jobs.remove(job)
                self.queue.task_done()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}", exc_info=True)
                self.queue.task_done()

        logger.info(f"Worker {worker_id} stopped")

    async def _convert(self, job: ConversionJob) -> bool:
        """
        Convert M4V to H.264 using FFmpeg.

        Args:
            job: Conversion job

        Returns:
            True if successful, False otherwise
        """
        if not Path(job.input_path).exists():
            logger.error(f"Input file not found: {job.input_path}")
            return False

        cmd = [
            "ffmpeg",
            "-i",
            job.input_path,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-y",  # Overwrite output
            job.output_path,
        ]

        try:
            # Run FFmpeg conversion
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                # Verify output file
                if Path(job.output_path).exists() and Path(job.output_path).stat().st_size > 0:
                    input_size = Path(job.input_path).stat().st_size / (1024 * 1024)
                    output_size = Path(job.output_path).stat().st_size / (1024 * 1024)
                    compression = (1 - output_size / input_size) * 100

                    logger.info(
                        f"Conversion successful: {Path(job.input_path).name} "
                        f"({input_size:.2f} MB -> {output_size:.2f} MB, {compression:.1f}% compression)"
                    )
                    return True
                else:
                    logger.error(f"Output file is empty or missing: {job.output_path}")
                    return False
            else:
                logger.error(
                    f"FFmpeg failed with code {process.returncode}: "
                    f"{stderr.decode('utf-8', errors='ignore')[:200]}"
                )
                return False

        except Exception as e:
            logger.error(f"Conversion error: {e}", exc_info=True)
            return False

    async def _get_duration(self, file_path: str) -> float:
        """Get duration of video file using ffprobe"""
        try:
            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                file_path,
            ]
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await process.communicate()
            return float(stdout.decode().strip())
        except:
            return 0.0

    async def _finalize_conversion(self, job: ConversionJob):
        """
        Finalize successful conversion.

        Args:
            job: Conversion job
        """
        # Get new duration
        duration = await self._get_duration(job.output_path)

        # Update database with new file path, duration, and 'ready' status
        async with self.db.acquire() as conn:
            await conn.execute(
                """
                UPDATE video_segments 
                SET file_path = $2, status = $3, duration_seconds = $4, end_time = start_time + make_interval(secs => $4)
                WHERE id = $1
                """,
                job.segment_id,
                job.output_path,
                "ready",
                duration,
            )

        # Delete M4V temp file
        try:
            Path(job.input_path).unlink()
            logger.info(f"Deleted temp file: {Path(job.input_path).name}")
        except Exception as e:
            logger.warning(f"Failed to delete temp file {job.input_path}: {e}")

    async def _handle_failure(self, job: ConversionJob):
        """
        Handle conversion failure with retry logic.

        Args:
            job: Failed conversion job
        """
        job.retry_count += 1

        if job.retry_count < job.max_retries:
            logger.warning(
                f"Conversion failed, retrying ({job.retry_count}/{job.max_retries}): "
                f"{Path(job.input_path).name}"
            )
            # Re-queue the job
            await self.queue.put(job)
        else:
            logger.error(
                f"Conversion failed after {job.max_retries} retries: "
                f"{Path(job.input_path).name}"
            )
            # Mark as failed in database
            await self.db.update_video_segment(job.segment_id, datetime.now(), 0, "failed")

    async def _recovery_scan(self):
        """
        Scan for orphaned files on startup and re-queue them for conversion.

        Looks for:
        - Segments with status 'processing' (conversion was interrupted)
        - M4V files without corresponding MP4 files
        """
        logger.info("Running recovery scan...")

        try:
            # Find segments with 'processing' status
            async with self.db.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT id, file_path, session_id 
                    FROM video_segments 
                    WHERE file_path LIKE '%.m4v'
                    """
                )

            for row in rows:
                segment_id = row["id"]
                file_path = row["file_path"]
                session_id = row["session_id"]

                # Check if it's an M4V file
                if file_path.endswith(".m4v") and Path(file_path).exists():
                    logger.info(f"Recovering orphaned segment: {Path(file_path).name}")
                    await self.enqueue(segment_id, file_path, session_id)
                else:
                    # File doesn't exist or already converted, mark as failed
                    logger.warning(f"Orphaned segment not found or invalid: {file_path}")
                    await self.db.update_video_segment(segment_id, datetime.now(), 0, "failed")

            logger.info(f"Recovery scan complete. Found {len(rows)} orphaned segments")

        except Exception as e:
            logger.error(f"Recovery scan error: {e}", exc_info=True)
