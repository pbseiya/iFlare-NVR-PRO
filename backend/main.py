"""
YOLOv11 Inference System - Backend API
FastAPI application with REST endpoints and WebSocket support.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .models import (
    SessionConfig,
    SessionUpdate,
    SessionResponse,
    SessionInfo,
    SessionListResponse,
    DetectionListResponse,
    DetectionFilter,
    MetricsListResponse,
    PerformanceStats,
    AnalyticsResponse,
    DetectionStatsByClass,
    TimeSeriesPoint,
    ErrorResponse,
    HealthResponse,
    SourceAnalysisRequest,
    SourceAnalysisResponse,
)
import cv2
from .db.factory import get_database
from .db.base import DatabaseInterface
from .inference_engine import InferenceEngine
from .video_converter import VideoConverter
from .recovery import VideoRecoveryService
from .utils import mask_rtsp_url


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    # Initialize Database via Factory (reads DB_PROVIDER from env)
    app.state.db = get_database()
    await app.state.db.connect()
    print(f"✓ Connected to database")

    # Initialize Inference Engine
    app.state.inference_engine = InferenceEngine(app.state.db)
    print(f"✓ Inference Engine initialized")

    # Initialize Video Converter Service
    app.state.video_converter = VideoConverter(app.state.db, max_concurrent=2)
    await app.state.video_converter.start()
    app.state.inference_engine.converter = app.state.video_converter
    print(f"✓ Video Converter Service started")

    # Check Auto-Resume Setting
    auto_resume_val = await app.state.db.get_app_setting("auto_resume", default="false")
    auto_resume = str(auto_resume_val).lower() == "true"
    print(f"⚙️ Auto-Resume System: {'ENABLED' if auto_resume else 'DISABLED'}")

    # Handle Stale Sessions
    async with app.state.db.acquire() as conn:
        # Find sessions that were running when server died
        running_sessions = await conn.fetch(
            "SELECT * FROM inference_sessions WHERE status = 'running'"
        )

        if running_sessions:
            print(f"Found {len(running_sessions)} sessions that were left running.")

            if auto_resume:
                # Resume them
                for session_row in running_sessions:
                    session = dict(session_row)
                    session_id = session["id"]
                    print(f"🔄 Auto-Resuming Session #{session_id} ({session.get('name')})...")

                    try:
                        # Get last frame
                        last_frame = await conn.fetchval(
                            "SELECT MAX(frame_number) FROM detections WHERE session_id = $1",
                            session_id,
                        )
                        last_frame = last_frame if last_frame is not None else -1

                        # Clear ended_at because we are continuing
                        await conn.execute(
                            "UPDATE inference_sessions SET ended_at = NULL WHERE id = $1",
                            session_id,
                        )

                        # Construct config
                        config_dict = {
                            "model_name": session.get("model_name"),
                            "language": session.get("language"),
                            "source_type": session.get("source_type"),
                            "source_path": session.get("source_path"),
                            "fps_target": session.get("fps_target"),
                            "conf_threshold": session.get("conf_threshold"),
                            "iou_threshold": session.get("iou_threshold"),
                            "save_video": session.get("save_video"),
                            "video_output_path": session.get("video_output_path"),
                            "render_mode": session.get("render_mode"),
                            "recording_mode": session.get("recording_mode"),
                        }

                        # Start Inference
                        await app.state.inference_engine.start_session(
                            session_id, config_dict, start_frame=last_frame + 1
                        )
                    except Exception as e:
                        print(f"❌ Failed to auto-resume session {session_id}: {e}")
                        # Mark as failed if resume fails
                        await app.state.db.update_session_status(session_id, "failed")
            else:
                # Mark as stopped (Default behavior)
                await conn.execute(
                    "UPDATE inference_sessions SET status = 'stopped', ended_at = $1 WHERE status = 'running'",
                    datetime.now(),
                )
                print(f"✓ Cleaned up stale sessions (Marked as stopped)")

    # Run Video Recovery (for crashed segments) in background
    recovery_service = VideoRecoveryService(app.state.db)
    print(f"⏳ Backgrounding video recovery scan...")
    # Backgrounding this so API can start immediately
    asyncio.create_task(recovery_service.scan_and_recover())

    yield

    # Shutdown

    # Check if we need to preserve session states for auto-resume
    try:
        auto_resume_val = await app.state.db.get_app_setting("auto_resume", default="false")
        auto_resume = str(auto_resume_val).lower() == "true"
        if auto_resume:
            print("🛑 Shutdown: Auto-Resume is ENABLED. Preserving session states in DB.")
            app.state.inference_engine.shutdown_preserve_state = True
    except Exception as e:
        print(f"⚠️ Error checking auto-resume setting during shutdown: {e}")

    # Stop all active sessions
    await app.state.inference_engine.stop_all_sessions()

    # Stop Video Converter Service
    await app.state.video_converter.stop()
    print("✓ Video Converter Service stopped")

    await app.state.db.disconnect()
    print("✓ Disconnected from database")


# ========================================
# FastAPI Application
# ========================================

app = FastAPI(
    title="YOLOv11 Inference API",
    description="Backend API for YOLOv11 Inference System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================================
# System Settings Endpoints
# ========================================


@app.get("/api/settings")
async def get_system_settings():
    """Get all system settings"""
    try:
        # Currently we only have auto_resume
        auto_resume = await app.state.db.get_app_setting("auto_resume", False)
        return {"auto_resume": auto_resume}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings")
async def update_system_settings(settings: dict):
    """Update system settings"""
    try:
        if "auto_resume" in settings:
            await app.state.db.set_app_setting("auto_resume", settings["auto_resume"])
        return {"status": "updated", "settings": settings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health Check Endpoint"""
    return {
        "status": "ok",
        "database": os.getenv("DB_PROVIDER", "postgres"),
        "timestamp": datetime.now(),
    }


# ========================================
# Session Endpoints
# ========================================


@app.post("/api/sessions/start", response_model=SessionResponse)
async def start_session(config: SessionConfig):
    """Start a new inference session"""
    try:
        session_id = await app.state.db.create_session(
            model_name=config.model_name,
            language=config.language,
            source_type=config.source_type,
            source_path=config.source_path,
            fps_target=config.fps_target,
            conf_threshold=config.conf_threshold,
            iou_threshold=config.iou_threshold,
            save_video=config.save_video,
            video_output_path=config.video_output_path,
            render_mode=config.render_mode,
            recording_mode=config.recording_mode,
            name=config.name,
            video_height=config.video_height,
            source_width=config.source_width,
            source_height=config.source_height,
        )

        # Auto-generate video path if not provided but save_video is True
        if config.save_video and not config.video_output_path:
            # Ensure videos/output directory exists
            output_dir = os.path.join(os.getcwd(), "videos", "output")
            os.makedirs(output_dir, exist_ok=True)

            # Generate path: videos/output/session_{id}.webm
            generated_path = os.path.join(output_dir, f"session_{session_id}.webm")

            # Update DB and Config
            await app.state.db.update_session(session_id, {"video_output_path": generated_path})
            config.video_output_path = generated_path
            print(f"🎥 Auto-generated video path: {generated_path}")

        # Start Inference Task
        await app.state.inference_engine.start_session(session_id, config.dict())

        return SessionResponse(
            session_id=session_id,
            status="running",
            message="Session created and started successfully",
            created_at=datetime.now(),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/live/{session_id}")
async def websocket_live_stream(websocket: WebSocket, session_id: int):
    """WebSocket for live video streaming of a session"""
    await websocket.accept()
    queue = app.state.inference_engine.add_subscriber(session_id)
    try:
        while True:
            # Wait for frame
            data = await queue.get()
            # Send to client
            await websocket.send_json(data)
    except WebSocketDisconnect:
        # Client disconnected
        pass
    except Exception as e:
        print(f"WS Error session {session_id}: {e}")
    finally:
        app.state.inference_engine.remove_subscriber(session_id, queue)
        try:
            await websocket.close()
        except:
            pass


@app.get("/api/sessions/{session_id}/segments")
async def get_session_segments(session_id: int):
    """Get list of video segments for a session"""
    try:
        # Check if DB has the method (it was added)
        segments = await app.state.db.get_session_segments(session_id)
        return segments
    except Exception as e:
        print(f"Error fetching segments: {e}")
        return []


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: int, status: str = "completed"):
    """Stop an inference session"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Stop Inference Task
        await app.state.inference_engine.stop_session(session_id)

        # Update status
        await app.state.db.update_session_status(session_id, status)

        return {"message": f"Session {session_id} stopped", "status": status}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/sessions/{session_id}")
async def update_session(session_id: int, updates: SessionUpdate):
    """Update a session configuration"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Filter out None values
        update_data = {k: v for k, v in updates.dict().items() if v is not None}

        # Security: If source_path contains '***', it means the user didn't change the masked password.
        # We must prevent overwriting the real password in the DB with '***'.
        if "source_path" in update_data and ":***@" in update_data["source_path"]:
            print(
                f"🔒 update_session: Masked password detected in source_path, ignoring this field update."
            )
            del update_data["source_path"]

        if not update_data:
            return {"message": "No updates provided", "session_id": session_id}

        # Update Database
        await app.state.db.update_session(session_id, update_data)

        # Check if critical fields changed that require restart
        critical_fields = [
            "model_name",
            "language",
            "source_type",
            "source_path",
            "fps_target",
            "conf_threshold",
            "iou_threshold",
            "save_video",
            "video_output_path",
            "recording_mode",
            "video_height",  # Resolution changes require restart
        ]

        needs_restart = any(field in update_data for field in critical_fields)

        if needs_restart and session.get("status") == "running":
            print(f"🔄 Restarting session {session_id} due to config change...")
            # Stop
            await app.state.inference_engine.stop_session(session_id)

            # Get updated session data
            updated_session = await app.state.db.get_session(session_id)

            # Restart config
            config_dict = {
                "model_name": updated_session.get("model_name"),
                "language": updated_session.get("language"),
                "source_type": updated_session.get("source_type"),
                "source_path": updated_session.get("source_path"),
                "fps_target": updated_session.get("fps_target"),
                "conf_threshold": updated_session.get("conf_threshold"),
                "iou_threshold": updated_session.get("iou_threshold"),
                "save_video": updated_session.get("save_video"),
                "video_output_path": updated_session.get("video_output_path"),
                "render_mode": updated_session.get("render_mode"),
                "recording_mode": updated_session.get("recording_mode"),
                "video_height": updated_session.get("video_height"),
                "session_name": updated_session.get("name"),  # For camera_id generation
            }

            last_frame = -1
            if session.get("source_path") == updated_session.get("source_path"):
                # Get the last processed frame number
                async with app.state.db.acquire() as conn:
                    result = await conn.fetchrow(
                        "SELECT MAX(frame_number) as last_frame FROM detections WHERE session_id = $1",
                        session_id,
                    )
                    last_frame = (
                        result["last_frame"] if result and result["last_frame"] is not None else -1
                    )

            # Update status back to running
            await app.state.db.update_session_status(session_id, "running")
            await app.state.inference_engine.start_session(
                session_id, config_dict, start_frame=last_frame + 1
            )

            return {"message": "Session updated and restarted", "session_id": session_id}

        return {"message": "Session updated", "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int):
    """Delete an inference session and all associated data"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if session.get("status") == "running":
            print(f"🛑 Stopping session {session_id} before deletion...")
            try:
                import asyncio

                await asyncio.wait_for(
                    app.state.inference_engine.stop_session(session_id), timeout=5.0
                )
            except asyncio.TimeoutError:
                print(f"⚠️ Timed out waiting for session {session_id} to stop. Forcing deletion.")
            except Exception as e:
                print(f"⚠️ Error stopping session {session_id}: {e}")

        # Clean up video files from hierarchical structure
        try:
            import shutil
            from pathlib import Path

            # Query all video segments to get actual file paths
            async with app.state.db.acquire() as conn:
                segments = await conn.fetch(
                    "SELECT file_path FROM video_segments WHERE session_id = $1 AND file_path IS NOT NULL",
                    session_id,
                )

            deleted_files = 0
            deleted_dirs = set()

            for segment in segments:
                file_path = segment["file_path"]
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        deleted_files += 1
                        print(f"🗑️ Deleted video file: {file_path}")

                        # Track parent directory for cleanup
                        parent_dir = os.path.dirname(file_path)
                        deleted_dirs.add(parent_dir)
                    except Exception as e:
                        print(f"⚠️ Error deleting file {file_path}: {e}")

            # Clean up empty directories (session folder and parent date/time folders if empty)
            for dir_path in sorted(deleted_dirs, reverse=True):  # Start from deepest
                try:
                    if os.path.exists(dir_path) and not os.listdir(dir_path):
                        os.rmdir(dir_path)
                        print(f"🗑️ Deleted empty directory: {dir_path}")

                        # Try to clean up parent directories if they're also empty
                        parent = os.path.dirname(dir_path)
                        while parent and parent.startswith(
                            os.path.join(os.getcwd(), "videos", "output")
                        ):
                            if os.path.exists(parent) and not os.listdir(parent):
                                os.rmdir(parent)
                                print(f"🗑️ Deleted empty parent directory: {parent}")
                                parent = os.path.dirname(parent)
                            else:
                                break
                except Exception as e:
                    print(f"⚠️ Error cleaning up directory {dir_path}: {e}")

            print(f"✅ Deleted {deleted_files} video files for session {session_id}")

            # Legacy cleanup: Check for old-style session directory (for backward compatibility)
            legacy_session_dir = os.path.join(
                os.getcwd(), "videos", "output", f"session_{session_id}"
            )
            if os.path.exists(legacy_session_dir):
                shutil.rmtree(legacy_session_dir)
                print(f"🗑️ Deleted legacy session directory: {legacy_session_dir}")

            # Check for single video output (Legacy or non-segment mode)
            video_path = session.get("video_output_path")
            if video_path and isinstance(video_path, str) and os.path.exists(video_path):
                os.remove(video_path)
                print(f"🗑️ Deleted legacy video file: {video_path}")

        except Exception as e:
            print(f"⚠️ Error cleaning up files for session {session_id}: {e}")

        # Delete from database (Manually delete children first to be safe)
        async with app.state.db.acquire() as conn:
            await conn.execute("DELETE FROM video_segments WHERE session_id = $1", session_id)
            await conn.execute("DELETE FROM detections WHERE session_id = $1", session_id)
            await conn.execute("DELETE FROM performance_metrics WHERE session_id = $1", session_id)
            await conn.execute("DELETE FROM inference_sessions WHERE id = $1", session_id)

        return {"message": f"Session {session_id} deleted successfully", "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sessions/{session_id}/resume")
async def resume_session(session_id: int):
    """Resume a stopped inference session from where it left off"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check if session is stopped
        if session.get("status") != "stopped":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot resume session with status '{session.get('status')}'. Only stopped sessions can be resumed.",
            )

        # Get the last processed frame number
        async with app.state.db.acquire() as conn:
            result = await conn.fetchrow(
                "SELECT MAX(frame_number) as last_frame FROM detections WHERE session_id = $1",
                session_id,
            )
            last_frame = result["last_frame"] if result and result["last_frame"] is not None else -1

        # Update session status to running and clear ended_at
        await app.state.db.update_session_status(session_id, "running")
        async with app.state.db.acquire() as conn:
            await conn.execute(
                "UPDATE inference_sessions SET ended_at = NULL WHERE id = $1", session_id
            )

        # Auto-generate video path if missing but save_video is True (for legacy sessions)
        if session.get("save_video") and not session.get("video_output_path"):
            # Ensure videos/output directory exists
            output_dir = os.path.join(os.getcwd(), "videos", "output")
            os.makedirs(output_dir, exist_ok=True)

            # Generate path: videos/output/session_{id}.webm
            generated_path = os.path.join(output_dir, f"session_{session_id}.webm")

            # Update DB
            await app.state.db.update_session(session_id, {"video_output_path": generated_path})

            # Update local session dict for config
            session["video_output_path"] = generated_path
            print(f"🎥 Auto-generated video path for resumed session: {generated_path}")

        # Restart the inference task from the last frame
        config_dict = {
            "model_name": session.get("model_name"),
            "language": session.get("language"),
            "source_type": session.get("source_type"),
            "source_path": session.get("source_path"),
            "fps_target": session.get("fps_target"),
            "conf_threshold": session.get("conf_threshold"),
            "iou_threshold": session.get("iou_threshold"),
            "save_video": session.get("save_video"),
            "video_output_path": session.get("video_output_path"),
            "recording_mode": session.get("recording_mode"),
            "render_mode": session.get("render_mode"),
            "video_height": session.get("video_height"),
            "session_name": session.get("name"),
        }

        await app.state.inference_engine.start_session(
            session_id, config_dict, start_frame=last_frame + 1  # Continue from next frame
        )

        return {
            "message": f"Session {session_id} resumed successfully",
            "session_id": session_id,
            "resumed_from_frame": last_frame + 1,
            "status": "running",
        }
    except Exception as e:
        import traceback

        traceback.print_exc()
        print(f"CRITICAL ERROR in resume_session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions", response_model=SessionListResponse)
async def list_sessions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, pattern="^(running|completed|failed|stopped)$"),
):
    """List all inference sessions"""
    try:
        sessions = await app.state.db.list_sessions(limit, offset, status)

        # Security: Mask passwords in RTSP URLs
        masked_sessions = []
        for s in sessions:
            sess_dict = dict(s)
            if sess_dict.get("source_type") == "rtsp":
                sess_dict["source_path"] = mask_rtsp_url(sess_dict["source_path"])
            masked_sessions.append(SessionInfo(**sess_dict))

        return SessionListResponse(sessions=masked_sessions, total=len(sessions))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}", response_model=SessionInfo)
async def get_session(session_id: int):
    """Get session details"""
    try:
        session = await app.state.db.get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Security: Mask passwords in RTSP URLs
        sess_dict = dict(session)
        if sess_dict.get("source_type") == "rtsp":
            sess_dict["source_path"] = mask_rtsp_url(sess_dict["source_path"])

        return SessionInfo(**sess_dict)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================
# Detection Endpoints
# ========================================


@app.get("/api/sessions/{session_id}/detections", response_model=DetectionListResponse)
async def get_detections(
    session_id: int,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    class_id: Optional[int] = None,
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0),
    limit: int = Query(100, ge=1, le=100000),
    offset: int = Query(0, ge=0),
):
    """Get detections for a session"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get detections
        detections = await app.state.db.get_detections(
            session_id, start_time, end_time, class_id, min_confidence, limit, offset
        )

        # Get total count
        total = await app.state.db.count_detections(
            session_id, start_time, end_time, class_id, min_confidence
        )

        return DetectionListResponse(detections=detections, total=total)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================
# Performance Metrics Endpoints
# ========================================


@app.get("/api/sessions/{session_id}/metrics", response_model=MetricsListResponse)
async def get_metrics(
    session_id: int, limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0)
):
    """Get performance metrics for a session"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get metrics
        metrics = await app.state.db.get_metrics(session_id, limit, offset)

        return MetricsListResponse(metrics=metrics, total=len(metrics))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}/metrics/stats", response_model=PerformanceStats)
async def get_performance_stats(session_id: int):
    """Get aggregated performance statistics"""
    try:
        stats = await app.state.db.get_performance_stats(session_id)

        if not stats:
            raise HTTPException(status_code=404, detail="No metrics found for session")

        # Calculate FPS
        stats["calculated_fps"] = 1000.0 / stats["avg_total_ms"] if stats["avg_total_ms"] > 0 else 0

        return PerformanceStats(**stats)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================
# Analytics Endpoints
# ========================================


@app.get("/api/sessions/{session_id}/analytics", response_model=AnalyticsResponse)
async def get_analytics(session_id: int):
    """Get analytics data for a session"""
    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get stats by class
        stats_by_class = await app.state.db.get_detection_stats_by_class(session_id)

        # Get FPS over time
        fps_data = await app.state.db.get_fps_over_time(session_id)
        fps_over_time = [
            TimeSeriesPoint(timestamp=row["timestamp"], value=row["fps"]) for row in fps_data
        ]

        # Get detections over time
        det_data = await app.state.db.get_detections_over_time(session_id)
        detections_over_time = [
            TimeSeriesPoint(timestamp=row["timestamp"], value=row["count"]) for row in det_data
        ]

        return AnalyticsResponse(
            session_id=session_id,
            stats_by_class=[DetectionStatsByClass(**s) for s in stats_by_class],
            fps_over_time=fps_over_time,
            detections_over_time=detections_over_time,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================
# WebSocket Endpoint
# ========================================


@app.websocket("/ws/live/{session_id}")
async def websocket_live(websocket: WebSocket, session_id: int):
    """WebSocket endpoint for live streaming"""
    await websocket.accept()

    try:
        # Check if session exists
        session = await app.state.db.get_session(session_id)
        if not session:
            await websocket.send_json({"error": "Session not found"})
            await websocket.close()
            return

        # Send initial status
        await websocket.send_json(
            {
                "type": "status",
                "session_id": session_id,
                "status": "connected",
                "message": "WebSocket connected",
            }
        )

        # Keep connection alive and handle messages
        # Subscribe to inference engine frames
        queue = app.state.engine.add_subscriber(session_id)

        try:
            while True:
                # Receive message from client (keep alive/ping)
                # We use asyncio.wait to handle both incoming messages and outgoing queue
                receive_task = asyncio.create_task(websocket.receive_json())
                queue_task = asyncio.create_task(queue.get())

                done, pending = await asyncio.wait(
                    [receive_task, queue_task], return_when=asyncio.FIRST_COMPLETED
                )

                if receive_task in done:
                    data = receive_task.result()
                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                else:
                    receive_task.cancel()

                if queue_task in done:
                    message = queue_task.result()
                    await websocket.send_json(message)
                else:
                    queue_task.cancel()

        except WebSocketDisconnect:
            pass

        finally:
            app.state.engine.remove_subscriber(session_id, queue)

    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()


# ========================================
# Error Handler
# ========================================


# ========================================
# NVR Endpoints
# ========================================


@app.get("/api/sessions/{session_id}/detections")
async def get_session_detections(session_id: int):
    """Get all detections for a session"""
    try:
        async with app.state.db.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT frame_number, class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2, timestamp
                FROM detections
                WHERE session_id = $1
                ORDER BY frame_number ASC
                """,
                session_id,
            )
            data = []
            for r in records:
                d = dict(r)
                if d["timestamp"]:
                    d["timestamp"] = d["timestamp"].isoformat()
                data.append(d)
            return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.api_route("/api/video/stream", methods=["GET", "HEAD"])
async def video_stream(path: str = Query(...), range: str = Header(None)):
    """Stream video file with Range support"""
    video_path = os.path.expanduser(path)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    file_size = os.path.getsize(video_path)
    start, end = 0, file_size - 1

    if range:
        try:
            start, end = range.replace("bytes=", "").split("-")
            start = int(start)
            end = int(end) if end else file_size - 1
        except ValueError:
            pass

    if start >= file_size or start < 0 or end >= file_size or end < start:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    chunk_size = end - start + 1

    def iterfile():
        with open(video_path, "rb") as video:
            video.seek(start)
            # Read in chunks
            bytes_read = 0
            while bytes_read < chunk_size:
                data = video.read(min(32 * 1024, chunk_size - bytes_read))
                if not data:
                    break
                bytes_read += len(data)
                yield data

    # Guess mime type
    import mimetypes

    mime_type, _ = mimetypes.guess_type(video_path)
    if not mime_type:
        mime_type = "video/webm"

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
        "Content-Type": mime_type,
    }

    return StreamingResponse(iterfile(), status_code=206, headers=headers)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(error="Internal Server Error", detail=str(exc)).dict(),
    )


# ========================================
# Run Application
# ========================================


# ========================================
# Analysis Endpoints
# ========================================


@app.post("/api/sessions/analyze-source", response_model=SourceAnalysisResponse)
async def analyze_source(request: SourceAnalysisRequest):
    """Analyze source media to get resolution, FPS, and estimated bitrate."""
    source_path = request.source_path
    source_type = request.source_type

    if source_type == "video":
        source_path = os.path.expanduser(source_path)
        if not os.path.exists(source_path):
            raise HTTPException(status_code=404, detail=f"File not found: {source_path}")

    try:
        cap = cv2.VideoCapture(source_path)
        if not cap.isOpened():
            # Security: Mask password in error message
            masked_path = mask_rtsp_url(source_path)
            raise HTTPException(status_code=400, detail=f"Could not open source: {masked_path}")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)

        # Estimate Bitrate
        estimated_bitrate = None
        duration = None

        if source_type == "video":
            # flexible duration logic
            try:
                duration = frame_count / fps if fps > 0 else 0
                file_size = os.path.getsize(source_path)
                if duration > 0:
                    estimated_bitrate = (file_size * 8) / duration  # bits per second
            except Exception as e:
                print(f"Error calculating file bitrate: {e}")

        cap.release()

        return SourceAnalysisResponse(
            width=width,
            height=height,
            fps=fps,
            estimated_bitrate_bps=estimated_bitrate,
            duration_sec=duration,
        )

    except Exception as e:
        print(f"Analyze source error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
