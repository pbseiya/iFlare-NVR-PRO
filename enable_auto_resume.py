import asyncio
import os
from dotenv import load_dotenv
from backend.db.factory import get_database

# Load environment variables from .env
load_dotenv()


async def main():
    db = get_database()
    await db.connect()
    try:
        print("Enabling auto_resume...")
        await db.set_app_setting("auto_resume", "true")
        val = await db.get_app_setting("auto_resume")
        print(f"Auto-resume is now: {val}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
