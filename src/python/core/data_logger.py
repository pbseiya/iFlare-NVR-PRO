"""
YOLOv11 Inference System - Python Core Modules
Data Logger Module

Handles logging detections and performance metrics to PostgreSQL database.
"""

import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import asyncpg
from .postprocessor import Detection


@dataclass
class LoggerConfig:
    """Configuration for data logger"""

    database_url: str
    batch_size: int = 100  # Batch insert for better performance
    flush_interval: float = 5.0  # Seconds


@dataclass
class PerformanceMetrics:
    """Performance metrics for a frame"""

    frame_number: int
    timestamp: datetime
    preprocess_ms: float
    inference_ms: float
    postprocess_ms: float
    render_ms: float
    total_ms: float


class DataLogger:
    """
    Data logger for storing detections and metrics to PostgreSQL.

    Features:
    - Async database operations
    - Batch inserts for performance
    - Connection pooling
    - Error handling and retry logic
    """

    def __init__(self, config: LoggerConfig):
        self.config = config
        self.pool: Optional[asyncpg.Pool] = None
        self.detection_buffer: List[Dict[str, Any]] = []
        self.metrics_buffer: List[Dict[str, Any]] = []
        self._flush_task: Optional[asyncio.Task] = None

    async def connect(self) -> bool:
        """
        Connect to database and create connection pool.

        Returns:
            bool: True if successful
        """
        try:
            self.pool = await asyncpg.create_pool(
                self.config.database_url, min_size=2, max_size=10, command_timeout=60
            )
            return True
        except Exception as e:
            print(f"Error connecting to database: {e}")
            return False

    async def disconnect(self):
        """Close database connection pool"""
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    async def create_session(
        self,
        model_name: str,
        language: str,
        source_type: str,
        source_path: str,
        fps_target: int,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        save_video: bool = False,
        video_output_path: Optional[str] = None,
        render_mode: str = "pipeline",
    ) -> int:
        """
        Create a new inference session.

        Returns:
            int: Session ID
        """
        if self.pool is None:
            raise RuntimeError("Not connected to database")

        async with self.pool.acquire() as conn:
            session_id = await conn.fetchval(
                """
                INSERT INTO inference_sessions (
                    model_name, language, source_type, source_path,
                    fps_target, conf_threshold, iou_threshold,
                    save_video, video_output_path, render_mode
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
                """,
                model_name,
                language,
                source_type,
                source_path,
                fps_target,
                conf_threshold,
                iou_threshold,
                save_video,
                video_output_path,
                render_mode,
            )

        return session_id

    async def end_session(self, session_id: int, status: str = "completed"):
        """
        End an inference session.

        Args:
            session_id: Session ID
            status: Session status ('completed', 'failed', 'stopped')
        """
        if self.pool is None:
            raise RuntimeError("Not connected to database")

        # Flush any remaining buffered data
        await self.flush()

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE inference_sessions
                SET ended_at = NOW(), status = $2
                WHERE id = $1
                """,
                session_id,
                status,
            )

    def log_detection(
        self, session_id: int, frame_number: int, timestamp: datetime, detection: Detection
    ):
        """
        Log a detection (buffered).

        Args:
            session_id: Session ID
            frame_number: Frame number
            timestamp: Timestamp
            detection: Detection object
        """
        self.detection_buffer.append(
            {
                "session_id": session_id,
                "frame_number": frame_number,
                "timestamp": timestamp,
                "class_id": detection.class_id,
                "class_name": detection.class_name,
                "confidence": detection.confidence,
                "bbox_x1": detection.bbox[0],
                "bbox_y1": detection.bbox[1],
                "bbox_x2": detection.bbox[2],
                "bbox_y2": detection.bbox[3],
            }
        )

    def log_detections(
        self, session_id: int, frame_number: int, timestamp: datetime, detections: List[Detection]
    ):
        """
        Log multiple detections for a frame.

        Args:
            session_id: Session ID
            frame_number: Frame number
            timestamp: Timestamp
            detections: List of detections
        """
        for detection in detections:
            self.log_detection(session_id, frame_number, timestamp, detection)

    def log_metrics(self, session_id: int, metrics: PerformanceMetrics):
        """
        Log performance metrics (buffered).

        Args:
            session_id: Session ID
            metrics: Performance metrics
        """
        self.metrics_buffer.append(
            {
                "session_id": session_id,
                "frame_number": metrics.frame_number,
                "timestamp": metrics.timestamp,
                "preprocess_ms": metrics.preprocess_ms,
                "inference_ms": metrics.inference_ms,
                "postprocess_ms": metrics.postprocess_ms,
                "render_ms": metrics.render_ms,
                "total_ms": metrics.total_ms,
            }
        )

    async def flush(self):
        """Flush buffered data to database"""
        if self.pool is None:
            return

        async with self.pool.acquire() as conn:
            # Flush detections
            if self.detection_buffer:
                await conn.executemany(
                    """
                    INSERT INTO detections (
                        session_id, frame_number, timestamp,
                        class_id, class_name, confidence,
                        bbox_x1, bbox_y1, bbox_x2, bbox_y2
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    """,
                    [
                        (
                            d["session_id"],
                            d["frame_number"],
                            d["timestamp"],
                            d["class_id"],
                            d["class_name"],
                            d["confidence"],
                            d["bbox_x1"],
                            d["bbox_y1"],
                            d["bbox_x2"],
                            d["bbox_y2"],
                        )
                        for d in self.detection_buffer
                    ],
                )
                self.detection_buffer.clear()

            # Flush metrics
            if self.metrics_buffer:
                await conn.executemany(
                    """
                    INSERT INTO performance_metrics (
                        session_id, frame_number, timestamp,
                        preprocess_ms, inference_ms, postprocess_ms,
                        render_ms, total_ms
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    [
                        (
                            m["session_id"],
                            m["frame_number"],
                            m["timestamp"],
                            m["preprocess_ms"],
                            m["inference_ms"],
                            m["postprocess_ms"],
                            m["render_ms"],
                            m["total_ms"],
                        )
                        for m in self.metrics_buffer
                    ],
                )
                self.metrics_buffer.clear()

    async def _auto_flush_loop(self):
        """Background task to auto-flush buffers"""
        while True:
            await asyncio.sleep(self.config.flush_interval)
            try:
                await self.flush()
            except Exception as e:
                print(f"Error auto-flushing: {e}")

    def start_auto_flush(self):
        """Start background auto-flush task"""
        if self._flush_task is None:
            self._flush_task = asyncio.create_task(self._auto_flush_loop())

    def stop_auto_flush(self):
        """Stop background auto-flush task"""
        if self._flush_task is not None:
            self._flush_task.cancel()
            self._flush_task = None

    async def __aenter__(self):
        """Async context manager entry"""
        await self.connect()
        self.start_auto_flush()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        self.stop_auto_flush()
        await self.flush()
        await self.disconnect()


# Example usage
if __name__ == "__main__":

    async def main():
        # Create logger
        config = LoggerConfig(
            database_url="postgresql://admin:password@localhost:5432/yolov11_inference"
        )

        async with DataLogger(config) as logger:
            # Create session
            session_id = await logger.create_session(
                model_name="yolov11",
                language="python",
                source_type="video",
                source_path="/path/to/video.mp4",
                fps_target=10,
            )

            print(f"Created session: {session_id}")

            # Log some detections
            detections = [
                Detection(
                    bbox=(100, 100, 200, 200), confidence=0.95, class_id=0, class_name="fire"
                ),
                Detection(
                    bbox=(300, 300, 400, 400), confidence=0.85, class_id=1, class_name="smoke"
                ),
            ]

            logger.log_detections(
                session_id=session_id,
                frame_number=1,
                timestamp=datetime.now(),
                detections=detections,
            )

            # Log metrics
            metrics = PerformanceMetrics(
                frame_number=1,
                timestamp=datetime.now(),
                preprocess_ms=5.2,
                inference_ms=45.3,
                postprocess_ms=3.1,
                render_ms=2.5,
                total_ms=56.1,
            )

            logger.log_metrics(session_id, metrics)

            # Flush
            await logger.flush()

            # End session
            await logger.end_session(session_id)

            print("Session ended")

    # Run
    asyncio.run(main())
