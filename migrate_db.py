```python
import asyncio
import os
from backend.db.factory import get_database


async def main():
    db = get_database()
    await db.connect()

    try:
        print("Adding 'name' column to inference_sessions...")
        async with db.pool.acquire() as conn:
            await conn.execute("ALTER TABLE inference_sessions ADD COLUMN IF NOT EXISTS name TEXT")

        print("Creating 'video_segments' table...")
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS video_segments (
                    id SERIAL PRIMARY KEY,
                    session_id INTEGER REFERENCES inference_sessions(id),
                    file_path TEXT NOT NULL,
                    start_time TIMESTAMP NOT NULL,
                    end_time TIMESTAMP,
                    duration_seconds FLOAT,
                    status TEXT DEFAULT 'recording'
                )
            """
            )

        # Ensure performance_metrics table is correct (for debug)
        print("Ensuring 'performance_metrics' schema...")
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS performance_metrics (
                    id SERIAL PRIMARY KEY,
                    session_id INTEGER REFERENCES inference_sessions(id),
                    frame_number INTEGER,
                    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
                    total_ms FLOAT,
                    inference_ms FLOAT,
                    preprocess_ms FLOAT,
                    postprocess_ms FLOAT
                )
            """
            )

        print("✓ Migration successful")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(migrate())
