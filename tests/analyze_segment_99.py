import asyncio
import os
import sys
from dotenv import load_dotenv
from datetime import datetime

# Add project root to path
sys.path.append(os.getcwd())

load_dotenv()

from backend.db.factory import get_database


async def analyze_entry():
    db = get_database()
    await db.connect()

    segment_id = 99
    session_id = 8
    file_path = "/home/pongsak/projects/yolov11_inference_cpu/videos/output/2026/02/13/07/session_8/segment_07-47-07.m4v"
    start_time = "2026-02-13 07:47:07.474"
    end_time = "2026-02-13 07:47:43.467"

    # 1. Check File Existence
    file_exists = os.path.exists(file_path)
    file_size = os.path.getsize(file_path) if file_exists else 0

    print(f"📁 File Check: {file_path}")
    print(f"   Exists: {'✅ Yes' if file_exists else '❌ No'}")
    if file_exists:
        print(f"   Size: {file_size / (1024*1024):.2f} MB")

    # 2. Check Inference Data
    print(f"\n🔍 Checking Inference (Detections) for Session {session_id}...")

    # Query for detections within this segment's time range
    query = """
    SELECT COUNT(*) as det_count 
    FROM detections 
    WHERE session_id = $1 
    AND timestamp >= $2 
    AND timestamp <= $3
    """

    async with db.acquire() as conn:
        count = await conn.fetchval(query, session_id, start_time, end_time)

        # Get a sample of classes found if any
        classes_query = """
        SELECT class_name, COUNT(*) as count
        FROM detections
        WHERE session_id = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
        GROUP BY class_name
        """
        classes = await conn.fetch(classes_query, session_id, start_time, end_time)

    print(f"   Detections Found: {count}")
    if count > 0:
        print("   Breakdown:")
        for cls in classes:
            print(f"     - {cls['class_name']}: {cls['count']}")

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(analyze_entry())
