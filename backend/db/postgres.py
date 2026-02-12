import asyncpg
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager
from .base import DatabaseInterface


class PostgresDatabase(DatabaseInterface):
    """PostgreSQL Database Implementation using asyncpg"""

    def __init__(self, connection_string: str):
        self.database_url = connection_string
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Create connection pool"""
        self.pool = await asyncpg.create_pool(
            self.database_url, min_size=5, max_size=20, command_timeout=60
        )

    async def disconnect(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()

    @asynccontextmanager
    async def acquire(self):
        """Acquire a connection from the pool"""
        async with self.pool.acquire() as conn:
            yield conn

    # ========================================
    # Session Queries
    # ========================================

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
        recording_mode: str = "none",
        name: Optional[str] = None,
        video_height: Optional[int] = None,
        source_width: Optional[int] = None,
        source_height: Optional[int] = None,
    ) -> int:
        async with self.acquire() as conn:
            session_id = await conn.fetchval(
                """
                INSERT INTO inference_sessions (
                    model_name, language, source_type, source_path,
                    fps_target, conf_threshold, iou_threshold,
                    save_video, video_output_path, render_mode, recording_mode, name, video_height,
                    source_width, source_height
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
                recording_mode,
                name,
                video_height,
                source_width,
                source_height,
            )
        return session_id

    async def update_session(self, session_id: int, updates: Dict[str, Any]):
        if not updates:
            return

        query = "UPDATE inference_sessions SET "
        params = []
        set_clauses = []

        for i, (key, value) in enumerate(updates.items(), start=1):
            set_clauses.append(f"{key} = ${i}")
            params.append(value)

        query += ", ".join(set_clauses)
        query += f" WHERE id = ${len(params) + 1}"
        params.append(session_id)

        async with self.acquire() as conn:
            await conn.execute(query, *params)

    async def get_session(self, session_id: int) -> Optional[Dict[str, Any]]:
        async with self.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM session_summary WHERE id = $1
                """,
                session_id,
            )
        return dict(row) if row else None

    async def list_sessions(
        self, limit: int = 100, offset: int = 0, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        async with self.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    """
                    SELECT * FROM session_summary
                    WHERE status = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    status,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM session_summary
                    ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
                    """,
                    limit,
                    offset,
                )
        return [dict(row) for row in rows]

    async def update_session_status(self, session_id: int, status: str):
        async with self.acquire() as conn:
            await conn.execute(
                """
                UPDATE inference_sessions
                SET status = $2::VARCHAR, ended_at = CASE WHEN $2 != 'running' THEN NOW() ELSE ended_at END
                WHERE id = $1
                """,
                session_id,
                status,
            )

    # ========================================
    # Detection Queries
    # ========================================

    async def get_detections(
        self,
        session_id: int,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        class_id: Optional[int] = None,
        min_confidence: Optional[float] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM detections WHERE session_id = $1"
        params = [session_id]
        param_count = 1

        if start_time:
            param_count += 1
            query += f" AND timestamp >= ${param_count}"
            params.append(start_time)

        if end_time:
            param_count += 1
            query += f" AND timestamp <= ${param_count}"
            params.append(end_time)

        if class_id is not None:
            param_count += 1
            query += f" AND class_id = ${param_count}"
            params.append(class_id)

        if min_confidence is not None:
            param_count += 1
            query += f" AND confidence >= ${param_count}"
            params.append(min_confidence)

        query += f" ORDER BY timestamp DESC, frame_number DESC LIMIT ${param_count + 1} OFFSET ${param_count + 2}"
        params.extend([limit, offset])

        async with self.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [dict(row) for row in rows]

    async def count_detections(
        self,
        session_id: int,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        class_id: Optional[int] = None,
        min_confidence: Optional[float] = None,
    ) -> int:
        query = "SELECT COUNT(*) FROM detections WHERE session_id = $1"
        params = [session_id]
        param_count = 1

        if start_time:
            param_count += 1
            query += f" AND timestamp >= ${param_count}"
            params.append(start_time)

        if end_time:
            param_count += 1
            query += f" AND timestamp <= ${param_count}"
            params.append(end_time)

        if class_id is not None:
            param_count += 1
            query += f" AND class_id = ${param_count}"
            params.append(class_id)

        if min_confidence is not None:
            param_count += 1
            query += f" AND confidence >= ${param_count}"
            params.append(min_confidence)

        async with self.acquire() as conn:
            count = await conn.fetchval(query, *params)

        return count

    # ========================================
    # Performance Metrics Queries
    # ========================================

    async def get_metrics(
        self, session_id: int, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        async with self.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM performance_metrics
                WHERE session_id = $1
                ORDER BY frame_number DESC
                LIMIT $2 OFFSET $3
                """,
                session_id,
                limit,
                offset,
            )
        return [dict(row) for row in rows]

    async def get_performance_stats(self, session_id: int) -> Optional[Dict[str, Any]]:
        async with self.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM performance_stats WHERE session_id = $1
                """,
                session_id,
            )
        return dict(row) if row else None

    # ========================================
    # Analytics Queries
    # ========================================

    async def get_detection_stats_by_class(self, session_id: int) -> List[Dict[str, Any]]:
        async with self.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM detection_stats_by_class
                WHERE session_id = $1
                ORDER BY detection_count DESC
                """,
                session_id,
            )
        return [dict(row) for row in rows]

    async def get_fps_over_time(
        self, session_id: int, interval_seconds: int = 60
    ) -> List[Dict[str, Any]]:
        async with self.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    date_trunc('minute', timestamp) as timestamp,
                    1000.0 / AVG(total_ms) as fps
                FROM performance_metrics
                WHERE session_id = $1
                GROUP BY date_trunc('minute', timestamp)
                ORDER BY timestamp
                """,
                session_id,
            )
        return [dict(row) for row in rows]

    async def get_detections_over_time(
        self, session_id: int, interval_seconds: int = 60
    ) -> List[Dict[str, Any]]:
        async with self.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    date_trunc('minute', timestamp) as timestamp,
                    COUNT(*) as count
                FROM detections
                WHERE session_id = $1
                GROUP BY date_trunc('minute', timestamp)
                ORDER BY timestamp
                """,
                session_id,
            )
        return [dict(row) for row in rows]

    # ========================================
    # Health Check
    # ========================================

    async def health_check(self) -> bool:
        try:
            async with self.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return True
        except Exception:
            return False

    async def create_video_segment(
        self, session_id: int, file_path: str, start_time: datetime
    ) -> int:
        async with self.acquire() as conn:
            segment_id = await conn.fetchval(
                """
                INSERT INTO video_segments (session_id, file_path, start_time, status)
                VALUES ($1, $2, $3, 'recording')
                RETURNING id
                """,
                session_id,
                file_path,
                start_time,
            )
        return segment_id

    async def update_video_segment(
        self, segment_id: int, end_time: datetime, duration: float, status: str = "completed"
    ):
        async with self.acquire() as conn:
            await conn.execute(
                """
                UPDATE video_segments 
                SET end_time = $2, duration_seconds = $3, status = $4
                WHERE id = $1
                """,
                segment_id,
                end_time,
                duration,
                status,
            )

    async def get_session_segments(self, session_id: int) -> List[Dict[str, Any]]:
        async with self.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM video_segments 
                WHERE session_id = $1 
                ORDER BY start_time ASC
                """,
                session_id,
            )
            return [dict(row) for row in rows]

    async def get_stuck_segments(self):
        async with self.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_id, file_path, start_time
                FROM video_segments
                WHERE status = 'recording'
                """
            )
            return [dict(row) for row in rows]

    async def mark_segment_recovered(
        self, segment_id: int, new_path: str, duration: float, status: str
    ):
        async with self.acquire() as conn:
            await conn.execute(
                """
                UPDATE video_segments
                SET file_path = $1, duration_seconds = $2, status = $3, end_time = start_time + make_interval(secs => $2)
                WHERE id = $4
                """,
                new_path,
                duration,
                status,
                segment_id,
            )

    # ========================================
    # App Settings
    # ========================================

    async def get_app_setting(self, key: str, default: Any = None) -> Any:
        async with self.acquire() as conn:
            row = await conn.fetchrow("SELECT value FROM app_settings WHERE key = $1", key)
        if row:
            return row["value"]
        return default

    async def set_app_setting(self, key: str, value: Any):
        import json

        async with self.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_settings (key, value, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
                """,
                key,
                value,
            )
