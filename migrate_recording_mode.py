import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


async def migrate_recording_mode():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("Adding recording_mode column...")
        # 1. Add column
        await conn.execute(
            "ALTER TABLE inference_sessions ADD COLUMN IF NOT EXISTS recording_mode VARCHAR(20) DEFAULT 'none'"
        )

        # 2. Check constraint
        await conn.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_recording_mode') THEN
                    ALTER TABLE inference_sessions ADD CONSTRAINT check_recording_mode 
                    CHECK (recording_mode IN ('none', 'clean', 'annotated'));
                END IF;
            END $$;
        """
        )

        # 3. Data Migration (Optional: preserve save_video intent)
        # Assuming save_video=True meant annotated
        print("Migrating data...")
        await conn.execute(
            "UPDATE inference_sessions SET recording_mode = 'annotated' WHERE save_video = TRUE AND recording_mode = 'none'"
        )
        await conn.execute(
            "UPDATE inference_sessions SET recording_mode = 'none' WHERE save_video = FALSE AND recording_mode = 'none'"
        )

        print("Migration successful.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(migrate_recording_mode())
