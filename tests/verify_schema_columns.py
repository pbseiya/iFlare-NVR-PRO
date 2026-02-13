import asyncio
import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.getcwd())

load_dotenv()

from backend.db.factory import get_database


async def verify_schema():
    print("🔌 Connecting to database...")
    db = get_database()
    await db.connect()

    print("🔍 Checking video_segments schema...")

    query = """
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'video_segments' AND COLUMN_NAME = 'conversion_duration_ms'
    """

    async with db.acquire() as conn:
        result = await conn.fetchval(query)

    if result:
        print("✅ SUCCESS: Column 'conversion_duration_ms' found in 'video_segments'.")
    else:
        print("❌ FAILURE: Column 'conversion_duration_ms' NOT found.")

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(verify_schema())
