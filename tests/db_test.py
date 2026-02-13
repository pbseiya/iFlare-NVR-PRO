import asyncio
import os
import aioodbc
from dotenv import load_dotenv

load_dotenv()


async def test_conn():
    server = os.getenv("iFlare_NVR_SERVER")
    database = os.getenv("iFlare_NVR_DATABASE")
    username = os.getenv("iFlare_NVR_USER")
    password = os.getenv("iFlare_NVR_PASSWORD")
    driver = "{ODBC Driver 18 for SQL Server}"

    conn_str = f"DRIVER={driver};SERVER={server};DATABASE={database};UID={username};PWD={password};TrustServerCertificate=yes;LoginTimeout=30;"

    print(f"Connecting to {server}...")
    try:
        conn = await aioodbc.connect(dsn=conn_str)
        print("Connected!")
        async with conn.cursor() as cursor:
            await cursor.execute("SELECT 1")
            row = await cursor.fetchone()
            print(f"Result: {row[0]}")
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(test_conn())
