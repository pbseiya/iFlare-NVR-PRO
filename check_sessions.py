```python
import asyncio
from backend.db.factory import get_database


async def main():
    db = get_database()
    await db.connect()

    async with db.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM inference_sessions")
    print(f"Total Sessions: {len(rows)}")
    for row in rows:
        print(dict(row))

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
