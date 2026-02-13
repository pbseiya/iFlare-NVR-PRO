import asyncio
import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.getcwd())

load_dotenv()

from backend.db.factory import get_database


async def check_gap():
    db = get_database()
    print("Connecting to database...")
    await db.connect()
    print("Connected to database.")

    session_id = 9
    start_time = "2026-02-13T16:45:00"
    end_time = "2026-02-13T17:05:00"

    print(f"Checking segments for session {session_id} between {start_time} and {end_time}...")

    query = """
        SELECT id, start_time, end_time, duration_seconds, status, file_path 
        FROM video_segments 
        WHERE session_id = $1 
        AND start_time >= $2 
        AND start_time <= $3
        ORDER BY start_time ASC
    """

    async with db.acquire() as conn:
        rows = await conn.fetch(query, session_id, start_time, end_time)

        print(f"Found {len(rows)} segments:")
        for row in rows:
            print(
                f"  [{row['id']}] {row['start_time']} -> {row['end_time']} ({row['status']}) - {row['file_path']}"
            )

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(check_gap())
