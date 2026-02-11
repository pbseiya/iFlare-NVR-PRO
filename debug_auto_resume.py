import asyncio
import os
from backend.database import Database


async def main():
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference"
    )
    print(f"Connecting to DB: {db_url}")
    db = Database(db_url)
    await db.connect()
    try:
        # Check App Settings
        auto_resume = await db.get_app_setting("auto_resume", default="NOT_SET")
        print(f"📌 Current 'auto_resume' setting: {auto_resume}")

        # Check Running Sessions
        async with db.acquire() as conn:
            running_sessions = await conn.fetch(
                "SELECT * FROM inference_sessions WHERE status = 'running'"
            )
            print(f"🔎 Found {len(running_sessions)} sessions with status='running'")
            for s in running_sessions:
                print(f"  - ID: {s['id']}, Name: {s['name']}, Source: {s['source_path']}")

            # Check Stopped Sessions (Recent)
            stopped_sessions = await conn.fetch(
                "SELECT * FROM inference_sessions WHERE status = 'stopped' ORDER BY ended_at DESC LIMIT 5"
            )
            print(f"🔎 Recent stopped sessions:")
            for s in stopped_sessions:
                print(f"  - ID: {s['id']}, Name: {s['name']}, Ended: {s['ended_at']}")

    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
