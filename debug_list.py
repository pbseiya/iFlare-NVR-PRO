import asyncio
import os
from dotenv import load_dotenv
from backend.db.factory import get_database
from backend.models import SessionInfo
from backend.utils import mask_rtsp_url


async def debug_list():
    load_dotenv()
    db = get_database()
    await db.connect()

    try:
        print("Fetching sessions from DB...")
        sessions = await db.list_sessions(limit=100, offset=0, status=None)
        print(f"Found {len(sessions)} sessions.")

        masked_sessions = []
        for i, s in enumerate(sessions):
            print(f"Processing session {i}...")
            sess_dict = dict(s)
            if sess_dict.get("source_type") == "rtsp":
                sess_dict["source_path"] = mask_rtsp_url(sess_dict["source_path"])

            # This is where it might fail or hang
            try:
                si = SessionInfo(**sess_dict)
                masked_sessions.append(si)
            except Exception as e:
                print(f"Error validating session {i}: {e}")
                print(f"Session data: {sess_dict}")

        print("Done.")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(debug_list())
