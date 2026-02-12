import asyncio
import os
from backend.db.factory import get_database


async def main():
    db = get_database()
    await db.connect()
    try:
        async with db.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM session_summary WHERE id = 97")
            if row:
                print("Session Summary (View) Data:")
                for key, value in row.items():
                    print(f"{key}: {value}")
            else:
                print("Session 97 not found in session_summary view.")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
