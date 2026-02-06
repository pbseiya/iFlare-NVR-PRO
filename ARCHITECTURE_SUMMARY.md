สถาปัตยกรรมระบบ YOLOv11 Inference
ภาพรวมระบบ
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT SOURCES                             │
│  ┌──────────────┐              ┌──────────────┐                 │
│  │ Video Files  │              │ RTSP Streams │                 │
│  └──────┬───────┘              └──────┬───────┘                 │
└─────────┼──────────────────────────────┼──────────────────────────┘
          │                              │
          └──────────────┬───────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   INFERENCE ENGINE LAYER                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Python    │  │     C++     │  │    Rust     │             │
│  │  + PyTorch  │  │  + OpenVINO │  │  + OpenVINO │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          │                 │                 │
          └────────┬────────┴────────┬────────┘
                   ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING PIPELINE                           │
│                                                                  │
│  1. Input Handler    → อ่าน video/RTSP, ควบคุม FPS             │
│  2. Pre-processor    → Letterbox, normalize, HWC→CHW            │
│  3. Inference Core   → YOLOv11 detection                        │
│  4. Post-processor   → NMS, coordinate scaling                  │
│  5. Renderer         → Draw bbox (pipeline/deferred)            │
│  6. Data Logger      → บันทึกลง PostgreSQL                      │
└─────────────────────────────────────────────────────────────────┘
                   │                 │
                   ▼                 ▼
┌──────────────────────┐    ┌──────────────────────┐
│   PostgreSQL DB      │    │  Video Storage       │
│   (Docker)           │    │  (Optional)          │
│                      │    │                      │
│  • Sessions          │    │  • Original frames   │
│  • Detections        │    │  • Rendered videos   │
│  • Metrics           │    └──────────────────────┘
│  • Video frames ref  │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API (FastAPI)                       │
│                                                                  │
│  REST API:                    WebSocket:                         │
│  • POST /sessions/start       • /ws/live/{id}                   │
│  • POST /sessions/{id}/stop   • Real-time stream                │
│  • GET /sessions              • Live detections                 │
│  • GET /detections                                              │
└─────────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌────────────────────────┐    ┌────────────────────────┐
│   Config Web UI        │    │    NVR Web UI          │
│   (Next.js)            │    │    (Next.js)           │
│   Port: 3000           │    │    Port: 3001          │
│                        │    │                        │
│  • เลือก language      │    │  • Live monitoring     │
│  • เลือก model         │    │  • Playback ย้อนหลัง   │
│  • Setup source        │    │  • Analytics           │
│  • กำหนด FPS           │    │  • Export data         │
│  • เลือกบันทึกวิดีโอ   │    │                        │
└────────────────────────┘    └────────────────────────┘
Component Details
1. Input Handler
หน้าที่:

รองรับ video file และ RTSP stream
อ่าน source FPS จริง
ควบคุม target inference FPS (frame skipping)
Timing แม่นยำด้วย high-resolution timer
Implementation:

Python: time.perf_counter()
C++: std::chrono::high_resolution_clock
Rust: std::time::Instant
2. Pre-processor
หน้าที่:

Letterbox resize (maintain aspect ratio)
BGR → RGB conversion
Normalize (0-255 → 0-1)
HWC → CHW format
Batch preparation
Output: Tensor พร้อมสำหรับ inference

3. Inference Engine
3 Implementations:

Language	Framework	Device
Python	PyTorch	CPU
C++	OpenVINO	CPU
Rust	OpenVINO	CPU
หน้าที่:

Load model
Run inference
Return raw predictions
4. Post-processor
หน้าที่:

Non-Maximum Suppression (NMS)
Confidence filtering
Coordinate scaling (model → original image)
Class probability calculation
Output: List of detections (bbox, class, confidence)

5. Renderer
2 Modes:

Pipeline Mode (Real-time):

Render bbox ทันทีหลัง inference
แสดงผลใน window หรือ stream ออกไป
เหมาะสำหรับ live monitoring
Deferred Mode:

บันทึก bbox ลง database ก่อน
Render ภายหลังเมื่อต้องการ
ประหยัด resources
6. Data Logger
บันทึกข้อมูล:

Timestamp (ISO 8601)
Bounding boxes (x1, y1, x2, y2)
Class labels
Confidence scores
Performance metrics:
Pre-processing time
Inference time
Post-processing time
Render time
Total time
Optimization:

Batch insert (buffer 100 frames)
Async I/O (ไม่กระทบ FPS)
Database Schema
-- Sessions table
CREATE TABLE inference_sessions (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100),
    language VARCHAR(20),
    source_type VARCHAR(20),
    source_path TEXT,
    fps_target INT,
    save_video BOOLEAN DEFAULT FALSE,
    video_output_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);
-- Detections table
CREATE TABLE detections (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES inference_sessions(id),
    frame_number INT,
    timestamp TIMESTAMP,
    class_id INT,
    class_name VARCHAR(50),
    confidence FLOAT,
    bbox_x1 INT,
    bbox_y1 INT,
    bbox_x2 INT,
    bbox_y2 INT
);
-- Performance metrics table
CREATE TABLE performance_metrics (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES inference_sessions(id),
    frame_number INT,
    preprocess_ms FLOAT,
    inference_ms FLOAT,
    postprocess_ms FLOAT,
    render_ms FLOAT,
    total_ms FLOAT
);
-- Video frames reference (optional)

Data Flow
Real-time Inference Flow
1. User กำหนด config ใน Config UI
   ↓
2. Config UI ส่ง request ไป Backend API
   ↓
3. Backend API เริ่ม Inference Engine process
   ↓
4. Inference Engine:
   Input Handler → Pre-processor → Inference → Post-processor
   ↓
5. Data Logger บันทึกลง PostgreSQL (async)
   ↓
6. Renderer:
   - Pipeline mode: Render + stream ไป NVR UI
   - Deferred mode: Skip rendering
   ↓
7. WebSocket ส่ง real-time data ไป NVR UI
   ↓
8. NVR UI แสดงผล live stream + bbox
Playback Flow
1. User เลือก session และ time range ใน NVR UI
   ↓
2. NVR UI query Backend API
   ↓
3. Backend API query PostgreSQL:
   - ดึง detections
   - ดึง video frames reference (ถ้ามี)
   ↓
4. NVR UI:
   Mode 1: เล่นวิดีโอที่บันทึกไว้ (ถ้ามี)
   Mode 2: Reconstruct จาก original video + bbox data
   ↓
5. แสดงผล timeline พร้อม bbox overlay
Docker Deployment
Services
postgres - PostgreSQL database
backend - FastAPI server
config_ui - Configuration web UI
nvr_ui - NVR web UI
Volumes
postgres_data - Database persistence
./models - Model files
./videos - Video storage (optional)
Network
yolov11_network - Bridge network สำหรับ inter-service communication
Port Mapping
Service	Port	Description
PostgreSQL	5432	Database
Backend API	8000	REST + WebSocket
Config UI	3000	Configuration interface
NVR UI	3001	Monitoring interface
Video Storage Strategy
Option 1: บันทึกวิดีโอ (save_video = true)
ข้อดี:

Playback ได้ทันที ไม่ต้อง reconstruct
Quality เท่าเดิม
เล่นได้ด้วย video player ทั่วไป
ข้อเสีย:

ใช้ storage มาก
ซ้ำซ้อนกับวิดีโอต้นฉบับ
Option 2: ไม่บันทึกวิดีโอ (save_video = false)
ข้อดี:

ประหยัด storage
ไม่ซ้ำซ้อน
ข้อเสีย:

Playback ต้อง reconstruct (ใช้ CPU)
ต้องมีวิดีโอต้นฉบับอยู่
แนะนำ: ใช้ Option 2 แล้วเก็บแค่ bbox data ใน database