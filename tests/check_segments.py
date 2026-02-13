import asyncio
import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.getcwd())

load_dotenv()

from backend.db.factory import get_database


async def check_segments():
    print("🔌 Connecting to database...")
    db = get_database()
    await db.connect()

    print("🔍 Checking video_segments for sessions 7 and 8...")

    query = """
    SELECT id, session_id, status, file_path, start_time, duration_seconds, conversion_duration_ms
    FROM video_segments 
    WHERE session_id IN (7, 8)
    ORDER BY id DESC
    OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY
    """

    async with db.acquire() as conn:
        rows = await conn.fetch(query)

    print(f"Found {len(rows)} segments.")
    for row in rows:
        print(
            f"ID: {row['id']}, Session: {row['session_id']}, Status: {row['status']}, Path: {row['file_path']}, ConvDur: {row['conversion_duration_ms']}"
        )

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(check_segments())
