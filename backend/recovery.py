import os
import asyncio
import logging
from datetime import datetime
from .db.base import DatabaseInterface

# Configure separate logger for recovery
logger = logging.getLogger("recovery")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)s - RECOVERY - %(levelname)s - %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


class VideoRecoveryService:
    def __init__(self, db: DatabaseInterface):
        self.db = db

    async def scan_and_recover(self):
        """Scan DB for stuck segments and attempt recovery"""
        logger.info("Starting video recovery scan...")

        try:
            stuck_segments = await self.db.get_stuck_segments()
            if not stuck_segments:
                logger.info("No stuck segments found.")
                return

            logger.info(f"Found {len(stuck_segments)} stuck segments. Starting recovery...")

            for segment in stuck_segments:
                await self._recover_segment(segment)

            logger.info("Recovery scan completed.")

        except Exception as e:
            logger.error(f"Error during recovery scan: {e}")

    async def _recover_segment(self, segment: dict):
        """Attempt to recover a single segment"""
        segment_id = segment["id"]
        file_path = segment["file_path"]

        if not file_path or not os.path.exists(file_path):
            logger.warning(f"Segment {segment_id} missing file: {file_path}. Marking as failed.")
            await self.db.mark_segment_recovered(segment_id, file_path, 0.0, "failed")
            return

        logger.info(f"Attempting to repair: {file_path}")

        # Repair Logic
        # 1. Rename original to .bad
        # 2. Run ffmpeg to copy streams to new valid container

        dir_name = os.path.dirname(file_path)
        file_name = os.path.basename(file_path)
        bad_path = os.path.join(dir_name, f"corrupt_{file_name}")

        try:
            # Rename if not already renamed (idempotency)
            if not os.path.exists(bad_path):
                os.rename(file_path, bad_path)

            # repair command: ffmpeg -i bad.mp4 -c copy good.mp4
            # We ignore stderr/stdout unless error
            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-y",
                "-i",
                bad_path,
                "-c",
                "copy",
                file_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                # Get new duration
                duration = await self._get_duration(file_path)
                logger.info(
                    f"Successfully repaired segment {segment_id}. New duration: {duration:.2f}s"
                )

                await self.db.mark_segment_recovered(segment_id, file_path, duration, "recovered")

                # Cleanup bad file
                try:
                    os.remove(bad_path)
                except:
                    pass
            else:
                logger.error(
                    f"FFmpeg failed to repair {segment_id}. Return code: {process.returncode}"
                )
                # logger.error(stderr.decode())

                # Restore original name? Or leave as corrupt?
                # Leave as corrupt_<name> so user knows it's bad, and maybe update DB to point to it?
                # For now marking as failed and pointing to bad path
                await self.db.mark_segment_recovered(segment_id, bad_path, 0.0, "failed")

        except Exception as e:
            logger.error(f"Exception recovering {segment_id}: {e}")
            await self.db.mark_segment_recovered(segment_id, file_path, 0.0, "failed")

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
