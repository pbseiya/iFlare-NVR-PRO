import asyncio
import os
import cv2
import numpy as np
import time
from datetime import datetime
from typing import Dict, Optional, List
from .db.base import DatabaseInterface
from .video_converter import VideoConverter
from ultralytics import YOLO
import torch


class VideoSegmentManager:
    def __init__(
        self,
        db: DatabaseInterface,
        session_id: int,
        base_dir: str,
        width: int,
        height: int,
        fps: float,
        camera_id: str = "default",
        interval_seconds: int = 60,
        converter: Optional[VideoConverter] = None,
    ):
        self.db = db
        self.session_id = session_id
        self.base_dir = base_dir
        self.width = width
        self.height = height
        self.fps = fps
        self.camera_id = camera_id
        self.interval_seconds = interval_seconds
        self.converter = converter

        self.current_writer = None
        self.current_segment_id = None
        self.segment_start_time = None
        self.current_file_path = None
        self.current_temp_path = None  # For M4V temp file

    async def write_frame(self, frame):
        now = datetime.now()

        # Check if we need to rotate (or start first segment)
        if (
            self.current_writer is None
            or (now - self.segment_start_time).total_seconds() >= self.interval_seconds
        ):
            await self._rotate_segment(now)

        # Write frame (thread-safe wrapper for blocking cv2 I/O)
        if self.current_writer:
            await asyncio.to_thread(self.current_writer.write, frame)

    async def _rotate_segment(self, now: datetime):
        # Close existing (Blocking I/O)
        if self.current_writer:
            await asyncio.to_thread(self.current_writer.release)
            duration = (now - self.segment_start_time).total_seconds()

            # Enqueue for H.264 conversion if converter is available
            if self.converter:
                await self.converter.enqueue(
                    self.current_segment_id, self.current_temp_path, self.session_id
                )
                print(
                    f"📦 Segment closed, queued for conversion: {self.current_file_path} ({duration:.1f}s)"
                )
            else:
                # No converter, mark as ready immediately
                await self.db.update_video_segment(self.current_segment_id, now, duration, "ready")
                print(f"📦 Segment closed: {self.current_file_path} ({duration:.1f}s)")

        # Start new
        self.segment_start_time = now

        # Generate hierarchical path: YYYY/MM/DD/HH/camera_id/
        year = now.strftime("%Y")
        month = now.strftime("%m")
        day = now.strftime("%d")
        hour = now.strftime("%H")

        segment_dir = os.path.join(self.base_dir, year, month, day, hour, self.camera_id)
        os.makedirs(segment_dir, exist_ok=True)

        # Filename: segment_HH-MM-SS.m4v (temp file for M4V capture)
        filename = f"segment_{now.strftime('%H-%M-%S')}.m4v"
        self.current_temp_path = os.path.join(segment_dir, filename)
        self.current_file_path = self.current_temp_path  # Will be updated after conversion

        # Use mp4v codec for M4V capture (fast, low CPU)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")

        # Blocking Warning: VideoWriter init can be slow
        self.current_writer = await asyncio.to_thread(
            cv2.VideoWriter, self.current_temp_path, fourcc, self.fps, (self.width, self.height)
        )

        # Register in DB with 'recording' status
        self.current_segment_id = await self.db.create_video_segment(
            self.session_id, self.current_temp_path, now
        )
        print(f"🎬 New segment started: {self.current_temp_path}")

    async def close(self):
        if self.current_writer:
            await asyncio.to_thread(self.current_writer.release)
            now = datetime.now()
            duration = (
                (now - self.segment_start_time).total_seconds() if self.segment_start_time else 0
            )

            # Enqueue for H.264 conversion if converter is available
            if self.converter and self.current_temp_path and os.path.exists(self.current_temp_path):
                await self.converter.enqueue(
                    self.current_segment_id, self.current_temp_path, self.session_id
                )
                print(
                    f"📦 Final segment closed, queued for conversion: {self.current_file_path} ({duration:.1f}s)"
                )
                # Do NOT set status to 'stopped' here, let the converter set it to 'processing' -> 'ready'
                # But we should update duration/end_time in DB?
                # The converter usually updates status. If we don't update anything, it stays 'recording'.
                # The worker picks it up and sets 'processing'.
                # We SHOULD update duration though.
                await self.db.update_video_segment(
                    self.current_segment_id, now, duration, "recording"
                )
            else:
                # No converter, just mark as stopped/ready (still M4V)
                await self.db.update_video_segment(
                    self.current_segment_id, now, duration, "stopped"
                )

            self.current_writer = None


class InferenceEngine:
    def __init__(self, db: DatabaseInterface):
        self.db = db
        self.active_sessions: Dict[int, asyncio.Task] = {}
        self.models = {}
        # session_id -> list of queues
        self.frame_queues: Dict[int, List[asyncio.Queue]] = {}
        # Video converter service
        self.converter: Optional[VideoConverter] = None

        # Flag to preserve 'running' state in DB during shutdown (for auto-resume)
        self.shutdown_preserve_state = False

    def add_subscriber(self, session_id: int) -> asyncio.Queue:
        """Add a subscriber for live frame updates"""
        if session_id not in self.frame_queues:
            self.frame_queues[session_id] = []
        queue = asyncio.Queue(maxsize=30)  # buffer size
        self.frame_queues[session_id].append(queue)
        return queue

    def remove_subscriber(self, session_id: int, queue: asyncio.Queue):
        """Remove a subscriber"""
        if session_id in self.frame_queues:
            if queue in self.frame_queues[session_id]:
                self.frame_queues[session_id].remove(queue)
            if not self.frame_queues[session_id]:
                del self.frame_queues[session_id]

    async def _broadcast_frame(self, session_id: int, frame, detections: list):
        """Broadcast raw frame + detections to all subscribers"""
        if session_id not in self.frame_queues:
            return

        queues = self.frame_queues[session_id]
        if not queues:
            return

        try:
            # Encode RAW frame to JPEG (No drawing)
            ret, buffer = cv2.imencode(".jpg", frame)
            if not ret:
                return

            import base64

            jpg_as_text = base64.b64encode(buffer).decode("utf-8")

            # Format detections for frontend
            # d structure: (session_id, frame_num, timestamp, cls_id, cls_name, conf, x1, y1, x2, y2)
            frontend_detections = []
            for d in detections:
                frontend_detections.append(
                    {
                        "bbox": [d[6], d[7], d[8], d[9]],  # x1, y1, x2, y2
                        "class": d[4],
                        "conf": d[5],
                    }
                )

            # Prepare message
            message = {
                "type": "frame",
                "session_id": session_id,
                "frame": jpg_as_text,
                "detections": frontend_detections,
                "timestamp": datetime.now().isoformat(),
            }

            # Broadcast
            queues = self.frame_queues.get(session_id, [])
            for q in queues:
                try:
                    if q.full():
                        q.get_nowait()  # Drop old frame
                    q.put_nowait(message)
                except Exception:
                    pass
        except Exception as e:
            print(f"Error broadcasting frame: {e}")

    async def start_session(self, session_id: int, config: dict, start_frame: int = 0):
        """Start an inference session as an asyncio task"""
        if session_id in self.active_sessions:
            print(f"Session {session_id} is already running.")
            return

        print(
            f"Attempting to start session {session_id} with config: {config}, start_frame: {start_frame}"
        )

        # Create task
        try:
            task = asyncio.create_task(self._inference_loop(session_id, config, start_frame))
            self.active_sessions[session_id] = task
            print(f"🚀 Session {session_id} task created")
            # Force immediate context switch to ensure the task starts running essentially "now"
            # or at least gets scheduled visible to logs immediately if event loop allows.
            await asyncio.sleep(0)
        except Exception as e:
            print(f"❌ Failed to start session {session_id} task: {e}")
            import traceback

            traceback.print_exc()

    async def stop_session(self, session_id: int):
        """Stop an inference session"""
        if session_id in self.active_sessions:
            task = self.active_sessions[session_id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            del self.active_sessions[session_id]
            print(f"🛑 Session {session_id} stopped")

    async def stop_all_sessions(self):
        """Stop all active sessions gracefully"""
        print(f"🛑 Stopping all {len(self.active_sessions)} active sessions...")
        session_ids = list(self.active_sessions.keys())
        for sid in session_ids:
            await self.stop_session(sid)
        print("✅ All sessions stopped.")

    async def _inference_loop(self, session_id: int, config: dict, start_frame: int = 0):
        """Main inference loop"""
        print(
            f"🔄 Inference loop started for session {session_id}, starting from frame {start_frame}"
        )
        cap = None
        segment_manager = None  # Ensure it is in scope for finally

        try:
            # Load Model (Lazy loading)
            raw_model_name = config.get("model_name")
            if not raw_model_name:
                raise ValueError("Model name must be provided in configuration")
            model_name = os.path.expanduser(raw_model_name)
            language = config.get("language", "python+pytorch")

            if language in ["cpp+openvino", "rust+openvino"]:
                await self._run_subprocess(session_id, config, start_frame)
                return

            if language == "python+openvino":
                await self._run_python_openvino(session_id, config, start_frame)
                return

            # Default: python+pytorch
            # We need to pass segment_manager reference out?
            # Actually, _run_python_pytorch creates its own segment_manager.
            # We should refactor to handle cleanup here or ensure _run_python_pytorch handles it.
            # _run_python_pytorch HAS a finally block? No, it catches Exception but the loop might exit.
            # Let's verify _run_python_pytorch structure.
            # It has a main loop. If cancelled, it cleans up.
            await self._run_python_pytorch(session_id, config, start_frame)

        except Exception as e:
            print(f"❌ Session {session_id} error: {e}")
            import traceback

            traceback.print_exc()
        finally:
            print(f"👋 Session {session_id} loop ended")

            # Note: _run_python_pytorch handles its own cleanup internally for cap and segment_manager
            # BUT if _run_python_pytorch raises an unhandled exception before cleaning up, we might leak.
            # However, segment_manager is local to that method.
            # We can't close it from here easily unless we return it.
            # For now, let's assume _run_python_pytorch handles it, I will check that method next.

            try:
                # Check if we should preserve state (for auto-resume on server restart)
                if self.shutdown_preserve_state:
                    print(f"⚠️ Preserving session {session_id} state (running) for auto-resume.")
                else:
                    await self.db.update_session_status(session_id, "stopped")
            except Exception as e:
                print(f"❌ Failed to update session status: {e}")

    async def _run_subprocess(self, session_id: int, config: dict, start_frame: int = 0):
        """Run inference using external binary (C++ / Rust)"""
        language = config.get("language")
        model_path = os.path.expanduser(config.get("model_name"))
        source = config.get("source_path")
        fps = str(config.get("fps_target", 10.0))
        conf = str(config.get("conf_threshold", 0.25))

        # Determine binary path
        cwd = os.getcwd()
        if language == "cpp+openvino":
            binary = os.path.join(cwd, "src/cpp/build/yolov11_inference_cpp")
        elif language == "rust+openvino":
            binary = os.path.join(cwd, "src/rust/target/release/yolov11_inference_rust")
        else:
            raise ValueError(f"Unknown subprocess language: {language}")

        cmd = [
            binary,
            "--model",
            model_path,
            "--source",
            source,
            "--fps",
            fps,
            "--conf",
            conf,
            "--json",
            "--headless",
        ]

        print(f"🚀 Session {session_id}: Starting subprocess: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        try:
            import json

            # Read stdout line by line
            while True:
                if asyncio.current_task().cancelled():
                    process.terminate()
                    break

                line = await process.stdout.readline()
                if not line:
                    break

                line_str = line.decode().strip()
                if not line_str:
                    continue

                # Parse JSON
                try:
                    data = json.loads(line_str)
                    # { "frame": 1, "detections": [...] }
                    frame_number = data.get("frame", 0)
                    detections = data.get("detections", [])
                    timestamp = datetime.now()

                    db_detections = []
                    for d in detections:
                        db_detections.append(
                            (
                                session_id,
                                frame_number,
                                timestamp,
                                d.get("class_id"),
                                d.get("class_name"),
                                d.get("confidence"),
                                int(d.get("bbox")[0]),
                                int(d.get("bbox")[1]),
                                int(d.get("bbox")[2]),  # width
                                int(d.get("bbox")[3]),  # height
                            )
                        )
                        # Note: C++/Rust JSON bbox is [x, y, w, h]. DB Schema expects [x1, y1, x2, y2]?
                        # Let's check schema/insert query.
                        # Query says: bbox_x1, bbox_y1, bbox_x2, bbox_y2.
                        # Python logic was: xyz output is xyxy? No, `box.xyxy`.
                        # C++ JSON output: `box.width`, `box.height`.
                        # So I need to convert xywh to xyxy for DB?
                        # Or DB columns are x1, y1, x2, y2.
                        # x2 = x + w, y2 = y + h.

                    if db_detections:
                        # Convert xywh to xyxy
                        final_detections = []
                        for item in db_detections:
                            # unpack
                            # 6: x, 7: y, 8: w, 9: h
                            x, y, w, h = item[6], item[7], item[8], item[9]
                            x2 = x + w
                            y2 = y + h
                            # Reconstruct tuple with x2, y2
                            new_item = item[:8] + (x2, y2)
                            final_detections.append(new_item)

                        async with self.db.acquire() as conn:
                            await conn.executemany(
                                """
                                INSERT INTO detections (
                                    session_id, frame_number, timestamp, class_id, 
                                    class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                """,
                                final_detections,
                            )

                        # Note: Subprocess doesn't stream images back yet, so no _broadcast_frame here
                        # unless we implement reading encoded frames from stdio.

                except json.JSONDecodeError:
                    # Log non-JSON output (maybe headers/debug)
                    if "Frame" not in line_str:  # ignore splash
                        print(f"Session {session_id} [STD]: {line_str}")
        finally:
            if process.returncode is None:
                process.terminate()
                await process.wait()

    async def _run_python_pytorch(self, session_id: int, config: dict, start_frame: int = 0):
        """Run Python+PyTorch Inference with Reconnection & Metrics"""
        import queue
        import threading
        from typing import Dict, Any
        from datetime import datetime
        import time
        import os
        import cv2
        import numpy as np
        from ultralytics import YOLO

        # --- Helper Classes ---
        class BufferlessVideoCapture:
            def __init__(self, name):
                self.cap = cv2.VideoCapture(name)
                self.q = queue.Queue()
                self.reading = True
                self.t = threading.Thread(target=self._reader)
                self.t.daemon = True
                self.t.start()

            def get(self, propId):
                return self.cap.get(propId)

            def _reader(self):
                while self.reading:
                    ret, frame = (
                        self.cap.read()
                    )  # This is already in a separate thread, no need for asyncio.to_thread here.
                    if not ret:
                        break
                    if not self.q.empty():
                        try:
                            self.q.get_nowait()  # discard previous (old) frame
                        except queue.Empty:
                            pass
                    self.q.put(frame)

            def read(self):
                try:
                    return True, self.q.get(timeout=5.0)  # wait briefly for new frame
                except queue.Empty:
                    return False, None

            def isOpened(self):
                return self.cap.isOpened()

            def release(self):
                self.reading = False
                self.t.join(timeout=1.0)
                self.cap.release()

        # --- Setup ---
        model_name = os.path.expanduser(config.get("model_name"))
        if model_name not in self.models:
            print(f"📦 Loading model {model_name}...")
            self.models[model_name] = await asyncio.to_thread(YOLO, model_name)
        model = self.models[model_name]

        source = config.get("source_path")
        source_type = config.get("source_type", "video")
        session_name = config.get("session_name", "")  # Extract session name from config

        if isinstance(source, str):
            source = os.path.expanduser(source)
            if source_type == "webcam":
                try:
                    source = int(source)
                except:
                    pass

        fps_target = config.get("fps_target", 1)
        frame_interval = 1.0 / fps_target if fps_target > 0 else 0
        conf_thresh = float(config.get("conf_threshold", 0.25))
        iou_thresh = float(config.get("iou_threshold", 0.45))

        # Prepare Video Manager
        # Robustly determine recording mode: handle None, missing key, or string 'none'
        raw_mode = config.get("recording_mode")
        recording_mode = (
            str(raw_mode).lower() if raw_mode is not None else "clean"
        )  # Default to CLEAN as per models.py

        if config.get("save_video", False) and recording_mode == "none":
            # Only override if explicit 'none' was passed but save_video is True (legacy case)
            # But if it was None/missing, we defaulted to "clean" above.
            pass

        print(f"Session {session_id} (Pytorch): recording_mode='{recording_mode}'")

        should_record = recording_mode in ["clean", "annotated"]
        segment_manager = None
        base_video_dir = os.path.join(os.getcwd(), "videos", "output")

        # --- Main Reconnection Loop (Infinite for Anti-Stale) ---
        try:
            while True:
                cap = None
                try:
                    if asyncio.current_task().cancelled():
                        break

                    print(f"🔌 Connecting to source: {source}")

                    is_live = source_type in ["rtsp", "webcam"]

                    if is_live:
                        cap = await asyncio.to_thread(BufferlessVideoCapture, source)
                    else:
                        cap = await asyncio.to_thread(cv2.VideoCapture, source)

                    if not cap.isOpened():
                        print(f"⚠️ Failed to open source {source}. Retrying in 5s...")
                        if is_live:
                            await asyncio.sleep(5)
                            continue
                        else:
                            break  # File not found, stop.

                    if not is_live and start_frame > 0:
                        await asyncio.to_thread(cap.set, cv2.CAP_PROP_POS_FRAMES, start_frame)

                    # Get Source FPS for File Processing
                    source_fps = cap.get(cv2.CAP_PROP_FPS)
                    if source_fps <= 0:
                        source_fps = 30.0  # Fallback

                    # Calculate frame stride for Fast File Processing (Offline Mode)
                    frame_stride = 1
                    if (
                        not is_live and fps_target > 0
                    ):  # Only skip frames if target FPS is set (and valid)
                        frame_stride = int(source_fps / fps_target)
                        if frame_stride < 1:
                            frame_stride = 1

                    last_frame_time = 0
                    processed_frames_count = 0

                    # --- Inference Loop ---
                    while True:
                        if asyncio.current_task().cancelled():
                            raise asyncio.CancelledError()

                        now = time.time()

                        # [Modified] Throttling Logic: Always sleep to enforce Real-Time Simulation
                        # User Requirement: "Simulate RTSP behavior... must wait for time"
                        if now - last_frame_time < frame_interval:
                            await asyncio.sleep(0.01)
                            continue

                        # Performance Timers
                        t0 = time.perf_counter()

                        # Read Frame
                        if not is_live and frame_stride > 1:
                            # [New] Fast Forward: Skip frames using grab()
                            for _ in range(frame_stride - 1):
                                await asyncio.to_thread(cap.grab)

                        ret, frame = await asyncio.to_thread(cap.read)

                        if not ret or frame is None:
                            if not is_live and source_type == "video":
                                # Video ended - loop back to start by re-opening (more robust than seek)
                                print(
                                    f"🔄 Video ended (is_live={is_live}, source_type={source_type}). Looping back to start (Re-opening)..."
                                )
                                cap.release()
                                cap = await asyncio.to_thread(cv2.VideoCapture, source)
                                frame_num = 0
                                continue
                            else:
                                # Live stream ended or other source
                                print(
                                    f"⚠️ Frame read failed/ended (is_live={is_live}, source_type={source_type}). Reconnecting..."
                                    if is_live
                                    else f"🎉 Stream ended (is_live={is_live}, source_type={source_type})."
                                )
                                break  # Break inner loop -> Reconnect or Finish

                        t1 = time.perf_counter()

                        # Initialize Video Scaling & Segment Manager
                        h, w = frame.shape[:2]

                        # Determine efficient storage resolution
                        target_h_param = config.get("video_height")
                        scale_factor = 1.0
                        store_w, store_h = w, h

                        if target_h_param and target_h_param < h:
                            scale_factor = target_h_param / h
                            store_h = target_h_param
                            store_w = int(w * scale_factor)
                            # Align to 2 for video encoding safety
                            if store_w % 2 != 0:
                                store_w -= 1
                            if store_h % 2 != 0:
                                store_h -= 1

                        if should_record and segment_manager is None:
                            # Generate camera_id from session name or source path
                            camera_id = session_name if session_name else f"session_{session_id}"
                            # Sanitize camera_id for filesystem
                            camera_id = camera_id.replace("/", "_").replace(" ", "_")

                            segment_manager = VideoSegmentManager(
                                self.db,
                                session_id,
                                base_video_dir,
                                store_w,
                                store_h,
                                fps_target if fps_target > 0 else 10,
                                camera_id=camera_id,
                                interval_seconds=60,
                                converter=self.converter,  # Pass converter instance
                            )

                        # Inference
                        results = await asyncio.to_thread(
                            model.predict, frame, conf=conf_thresh, iou=iou_thresh, verbose=False
                        )

                        t2 = time.perf_counter()

                        # Postprocess
                        last_frame_time = now
                        detections_list = []
                        broadcast_detections_list = []

                        # [Modified] Timestamp Logic
                        if not is_live:
                            # Use Video Timestamp for Files (Offline Mode)
                            # frame_num is updated by cap.get
                            frame_num = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
                            video_pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
                            # Calculate datetime based on start time + video position
                            # Or just use current time? Using current time for 'Run Now' semantics is usually fine,
                            # BUT for accurate playback speed simulation in recorded file, we rely on the fps_target passed to VideoWriter.
                            frame_timestamp = datetime.now()
                        else:
                            frame_num = 0
                            frame_timestamp = datetime.now()

                        if results:
                            r = results[0]
                            annotated_frame = r.plot()

                            for box in r.boxes:
                                xyxy = box.xyxy[0].cpu().numpy()
                                conf_val = float(box.conf[0].cpu().numpy())
                                cls_id = int(box.cls[0].cpu().numpy())
                                class_name = (
                                    model.names[cls_id] if hasattr(model, "names") else str(cls_id)
                                )

                                # Scale Coordinates to match Stored Video
                                x1 = int(xyxy[0] * scale_factor)
                                y1 = int(xyxy[1] * scale_factor)
                                x2 = int(xyxy[2] * scale_factor)
                                y2 = int(xyxy[3] * scale_factor)

                                detection_tuple = (
                                    session_id,
                                    frame_num,
                                    frame_timestamp,
                                    cls_id,
                                    class_name,
                                    conf_val,
                                    x1,  # Scaled for DB
                                    y1,
                                    x2,
                                    y2,
                                )
                                detections_list.append(detection_tuple)

                                # Original Coordinates for Broadcast (Live View)
                                broadcast_detections_list.append(
                                    (
                                        session_id,
                                        frame_num,
                                        frame_timestamp,
                                        cls_id,
                                        class_name,
                                        conf_val,
                                        int(xyxy[0]),  # Original X1
                                        int(xyxy[1]),  # Original Y1
                                        int(xyxy[2]),  # Original X2
                                        int(xyxy[3]),  # Original Y2
                                    )
                                )

                            if detections_list:
                                async with self.db.acquire() as conn:
                                    await conn.executemany(
                                        "INSERT INTO detections (session_id, frame_number, timestamp, class_id, class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                                        detections_list,
                                    )
                        else:
                            annotated_frame = frame

                        if should_record and segment_manager:
                            frame_to_write = frame if recording_mode == "clean" else annotated_frame

                            # Resize if necessary
                            if scale_factor != 1.0:
                                frame_to_write = cv2.resize(
                                    frame_to_write, (store_w, store_h), interpolation=cv2.INTER_AREA
                                )

                            await segment_manager.write_frame(frame_to_write)

                        t3 = time.perf_counter()

                        # Broadcast
                        await self._broadcast_frame(session_id, frame, broadcast_detections_list)

                        # Metrics
                        total_ms = (t3 - t0) * 1000
                        infer_ms = (t2 - t1) * 1000
                        pre_ms = (t1 - t0) * 1000
                        post_ms = (t3 - t2) * 1000

                        try:
                            async with self.db.acquire() as conn:
                                await conn.execute(
                                    "INSERT INTO performance_metrics (session_id, frame_number, timestamp, total_ms, inference_ms, preprocess_ms, postprocess_ms, render_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, 0.0)",
                                    session_id,
                                    frame_num,
                                    datetime.now(),
                                    total_ms,
                                    infer_ms,
                                    pre_ms,
                                    post_ms,
                                )
                        except Exception as e:
                            print(f"❌ Metrics Error: {e}")

                    # End of Inner Loop
                    if cap:
                        await asyncio.to_thread(cap.release)

                    # For video files, the loop will restart from the outer reconnection loop
                    # Video looping is handled at line 533-541 by re-opening the file
                    # No need to break here - let it reconnect/loop

                    # RTSP Reconnect Delay (also applies to video loop restart)
                    if is_live:
                        print(f"🔄 RTSP Stream ended/failed. Reconnecting in 1s...")
                        await asyncio.sleep(1)
                    else:
                        # Small delay before restarting video loop
                        await asyncio.sleep(0.1)

                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    print(f"❌ Error in session loop: {e}")
                    # Ensure release if crash
                    if cap:
                        try:
                            await asyncio.to_thread(cap.release)
                        except:
                            pass
                    await asyncio.sleep(5)
        finally:
            # Ensure segment manager is closed on ANY exit (normal, error, cancel)
            if segment_manager:
                print(f"🧹 Closing session {session_id} segment manager...")
                await segment_manager.close()

            if cap:
                try:
                    await asyncio.to_thread(cap.release)
                except:
                    pass

        # End of Main Loop

    async def _run_python_openvino(self, session_id: int, config: dict, start_frame: int = 0):
        """Run Python OpenVINO Inference"""
        from openvino.runtime import Core

        # Similar logic to native script, but async loop...
        # For simplicity, let's just use subprocess to verify_visuals.py --headless?
        # But verify_visuals.py doesn't print JSON.
        # I'll implement in-process for speed.

        model_path = os.path.expanduser(config.get("model_name"))
        source = config.get("source_path")
        fps_target = config.get("fps_target", 10.0)
        conf_target = float(config.get("conf_threshold", 0.25))

        core = Core()
        model_ov = core.read_model(model_path)
        compiled_model = core.compile_model(model_ov, "CPU")
        infer_request = compiled_model.create_infer_request()

        if config.get("source_type") == "webcam":
            try:
                source = int(source)
            except:
                pass
        else:
            source = os.path.expanduser(source)

        cap = await asyncio.to_thread(cv2.VideoCapture, source)

        # Classes (Manual for now or load from yaml/metadata? metadata.yaml exists!)
        classes = ["fire", "smoke", "fire_smoke", "steam"]  # Hardcoded for demo stability

        frame_interval = 1.0 / fps_target if fps_target > 0 else 0
        last_frame_time = 0

        frame_count = 0

        while True:
            if asyncio.current_task().cancelled():
                break

            now = time.time()
            if now - last_frame_time < frame_interval:
                await asyncio.sleep(0.01)
                continue

            ret, frame = await asyncio.to_thread(cap.read)
            if not ret:
                break

            last_frame_time = now
            frame_count += 1

            # Preprocess
            # (Re-implement letterbox here or use util? I'll inline for robust standalone file)
            shape = frame.shape[:2]
            new_shape = (640, 640)
            r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
            new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
            dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
            dw /= 2
            dh /= 2

            if shape[::-1] != new_unpad:
                img = cv2.resize(frame, new_unpad, interpolation=cv2.INTER_LINEAR)
            else:
                img = frame

            top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
            left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
            img = cv2.copyMakeBorder(
                img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114)
            )

            input_data = img.transpose((2, 0, 1))[::-1]
            input_data = np.ascontiguousarray(input_data).astype(np.float32) / 255.0
            input_data = np.expand_dims(input_data, 0)

            # Infer
            results = await asyncio.to_thread(infer_request.infer, input_data)
            output = list(results.values())[0]
            output = np.transpose(output, (0, 2, 1))
            pred = output[0]

            boxes = []
            confidences = []
            class_ids = []

            for row in pred:
                bbox = row[:4]
                scores = row[4:]
                cls_id = np.argmax(scores)
                conf = scores[cls_id]
                if conf > conf_target:
                    cx, cy, bw, bh = bbox
                    cx = (cx - dw) / r
                    cy = (cy - dh) / r
                    bw /= r
                    bh /= r
                    # xywh -> xyxy? No, db wants xyxy
                    x1 = int(cx - bw / 2)
                    y1 = int(cy - bh / 2)
                    x2 = int(cx + bw / 2)
                    y2 = int(cy + bh / 2)

                    boxes.append([x1, y1, x2 - x1, y2 - y1])  # for NMS (xywh)
                    confidences.append(float(conf))
                    class_ids.append(int(cls_id))

            indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_target, 0.45)

            db_detections = []
            if len(indices) > 0:
                for i in indices.flatten():
                    box = boxes[i]
                    x, y, w, h = box
                    cls_id = class_ids[i]
                    conf = confidences[i]

                    db_detections.append(
                        (
                            session_id,
                            frame_count,  # Use actual frame number
                            datetime.now(),
                            cls_id,
                            classes[cls_id] if cls_id < len(classes) else str(cls_id),
                            conf,
                            x,
                            y,
                            x + w,
                            y + h,
                        )
                    )

            if db_detections:
                async with self.db.acquire() as conn:
                    await conn.executemany(
                        """
                        INSERT INTO detections (
                            session_id, frame_number, timestamp, class_id, 
                            class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        """,
                        db_detections,
                    )
        cap.release()
