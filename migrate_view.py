import asyncio
from backend.db.factory import get_database


async def main():
    db = get_database()
    await db.connect()

    view_query = """
    CREATE OR REPLACE VIEW session_summary AS
    SELECT
        s.id,
        s.name,
        s.model_name,
        s.language,
        s.source_type,
        s.source_path,
        s.fps_target,
        s.save_video,
        s.recording_mode,
        s.render_mode,
        s.status,
        s.conf_threshold,
        s.iou_threshold,
        s.video_output_path,
        s.created_at,
        s.ended_at,
        EXTRACT(
            EPOCH
            FROM (
                    COALESCE(s.ended_at, NOW()) - s.created_at
                )
        ) as duration_seconds,
        COUNT(DISTINCT d.frame_number) as total_frames,
        COUNT(d.id) as total_detections,
        COUNT(DISTINCT d.class_id) as unique_classes,
        AVG(d.confidence) as avg_confidence,
        AVG(m.total_ms) as avg_total_ms,
        AVG(m.inference_ms) as avg_inference_ms
    FROM
        inference_sessions s
        LEFT JOIN detections d ON s.id = d.session_id
        LEFT JOIN performance_metrics m ON s.id = m.session_id
    GROUP BY
        s.id;
    """

    try:
        print("Updating session_summary view...")
        async with db.pool.acquire() as conn:
            await conn.execute("DROP VIEW IF EXISTS session_summary CASCADE")
            await conn.execute(view_query)
        print("✓ View update successful")
    except Exception as e:
        print(f"❌ View update failed: {e}")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(migrate_view())
