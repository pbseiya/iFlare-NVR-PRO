import asyncio
import os
from database import Database


async def inspect():
    db = Database(
        os.getenv("DATABASE_URL", "postgresql://admin:password@localhost:5432/yolov11_inference")
    )
    await db.connect()
    try:
        rows = await db.pool.fetch(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'detections';
        """
        )
        print("Columns in performance_metrics:")
        for row in rows:
            print(f"- {row['column_name']} ({row['data_type']}) Nullable: {row['is_nullable']}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(inspect())
