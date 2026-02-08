import asyncio
import os
from backend.database import Database


async def main():
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference"
    )
    db = Database(db_url)
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
