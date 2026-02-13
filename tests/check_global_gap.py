import asyncio
import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.getcwd())

load_dotenv()

from backend.db.factory import get_database


async def check_global_gap():
    db = get_database()
    print("Connecting to database...")
    await db.connect()
    print("Connected.")

    start_time = "2026-02-13T16:45:00"
    end_time = "2026-02-13T17:05:00"

    print(f"Checking all segments between {start_time} and {end_time}...")

    query = """
        SELECT session_id, id, start_time, end_time, status
        FROM video_segments 
        WHERE start_time >= $1 
        AND start_time <= $2
        ORDER BY session_id, start_time
    """

    async with db.acquire() as conn:
        rows = await conn.fetch(query, start_time, end_time)

        if not rows:
            print("No segments found for ANY session in this period.")
        else:
            print(f"Found {len(rows)} segments:")
            for row in rows:
                print(
                    f"  Session {row['session_id']}: [{row['id']}] {row['start_time']} -> {row['end_time']} ({row['status']})"
                )

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(check_global_gap())
