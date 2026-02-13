import asyncio
import os
import shutil
import json
from datetime import datetime
from backend.db.writer import AsyncDatabaseWriter
from backend.db.base import DatabaseInterface


# --- Mock DB ---
class MockDB(DatabaseInterface):
    def __init__(self):
        self.detections = []
        self.metrics = []

    def acquire(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def executemany(self, query, args):
        print(f"MOCK DB: Executing batch insert ({len(args)} rows)")
        if "detections" in query:
            self.detections.extend(args)
        elif "performance_metrics" in query:
            self.metrics.extend(args)

    # Implement abstract methods
    async def connect(self):
        pass

    async def disconnect(self):
        pass

    async def fetch(self, query, *args):
        return []

    async def fetchrow(self, query, *args):
        return None

    async def execute(self, query, *args):
        pass

    async def create_tables(self):
        pass

    async def create_session(self, *args):
        return 1

    async def update_session_status(self, *args):
        pass

    async def create_video_segment(self, *args):
        return 1

    async def update_video_segment(self, *args):
        pass

    async def get_session_segments(self, *args):
        return []

    async def count_detections(self, *args):
        return 0

    async def get_app_setting(self, *args):
        return None

    async def get_detection_stats_by_class(self, *args):
        return []

    async def get_detections(self, *args):
        return []

    async def get_detections_over_time(self, *args):
        return []

    async def get_fps_over_time(self, *args):
        return []

    async def get_metrics(self, *args):
        return []

    async def get_performance_stats(self, *args):
        return {}

    async def get_session(self, *args):
        return {}

    async def get_stuck_segments(self, *args):
        return []

    async def health_check(self, *args):
        return True

    async def list_sessions(self, *args):
        return []

    async def mark_segment_recovered(self, *args):
        pass

    async def set_app_setting(self, *args):
        pass

    async def update_session(self, *args):
        pass


async def test_writer():
    print("--- Testing AsyncDatabaseWriter ---")

    # 1. Setup
    db = MockDB()
    wal_path = "tests/test_wal.log"
    if os.path.exists(wal_path):
        os.remove(wal_path)

    writer = AsyncDatabaseWriter(db, batch_size=5, flush_interval=0.5, wal_path=wal_path)

    # 2. Test WAL and Batching
    print("Step 2: Starting writer...")
    await writer.start()

    # Add 3 detections (less than batch_size=5)
    print("Enqueueing 3 items...")
    for i in range(3):
        item = (1, i, datetime.now(), 0, "person", 0.9, 10, 10, 100, 100)
        await writer.enqueue_detection(item)

    # Verify WAL exists and has content
    assert os.path.exists(wal_path), "WAL file should be created"
    with open(wal_path, "r") as f:
        lines = f.readlines()
        assert len(lines) == 3, f"WAL should have 3 lines, got {len(lines)}"
        print("✅ WAL written correctly.")

    # Wait for flush interval (0.5s)
    print("Waiting for flush interval (0.8s)...")
    await asyncio.sleep(0.8)

    # Verify DB
    assert len(db.detections) == 3, f"DB should have 3 detections, got {len(db.detections)}"
    print("✅ Batch flush verified.")

    # Verify WAL cleared
    with open(wal_path, "r") as f:
        content = f.read()
        assert content == "", "WAL should be cleared after flush"
        print("✅ WAL cleared after flush.")

    # 3. Test Recovery
    print("\n--- Testing Recovery ---")
    await writer.stop()

    # Manually create a WAL file
    print("Simulating crash: Creating WAL file with pending data...")
    pending_item = (1, 99, datetime.now().isoformat(), 0, "recovery_test", 0.5, 0, 0, 50, 50)
    line = json.dumps({"type": "detection", "data": pending_item})
    with open(wal_path, "w") as f:
        f.write(line + "\n")

    # Start new writer
    db_recovered = MockDB()
    writer_recovered = AsyncDatabaseWriter(
        db_recovered, batch_size=5, flush_interval=0.5, wal_path=wal_path
    )

    print("Starting recovered writer...")
    await writer_recovered.start()

    # Wait for flush (recovery puts into queue -> worker flushes)
    await asyncio.sleep(0.8)

    assert (
        len(db_recovered.detections) == 1
    ), f"Should recover 1 detection, got {len(db_recovered.detections)}"
    assert db_recovered.detections[0][4] == "recovery_test", "Recovered data mismatch"
    print("✅ Recovery verified.")

    await writer_recovered.stop()
    if os.path.exists(wal_path):
        os.remove(wal_path)

    print("\n🎉 All Tests Passed!")


if __name__ == "__main__":
    asyncio.run(test_writer())
