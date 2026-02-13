import asyncio
import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.getcwd())

load_dotenv()

from backend.db.factory import get_database


async def check_session_status():
    db = get_database()
    await db.connect()

    session_id = 8

    query = "SELECT status, ended_at FROM inference_sessions WHERE id = $1"

    async with db.acquire() as conn:
        row = await conn.fetchrow(query, session_id)
        if row:
            print(f"✅ Session {session_id} Status: {row['status']}")
            print(f"   Ended At: {row['ended_at']}")
        else:
            print(f"❌ Session {session_id} not found")

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(check_session_status())
