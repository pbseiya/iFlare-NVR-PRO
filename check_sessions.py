import asyncio
from backend.database import Database
import os


async def main():
    database_url = os.getenv(
        "DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference"
    )
    db = Database(database_url)
    await db.connect()

    async with db.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM inference_sessions")
    print(f"Total Sessions: {len(rows)}")
    for row in rows:
        print(dict(row))

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
