YOLOv11 Inference System with Web UI & NVR
ภาพรวมโปรเจกต์
สร้างระบบ YOLOv11 Inference แบบ modular พร้อม Web UI สำหรับ configuration และ NVR Web UI สำหรับแสดงผลแบบ real-time และ playback ย้อนหลัง โดยรองรับ 3 ภาษา/framework:

Python + PyTorch (CPU only)
C++ + OpenVINO (CPU only)
Rust + OpenVINO (CPU only)
ระบบจะแยกส่วนประกอบอย่างชัดเจน (input handling, pre-processing, inference, post-processing, rendering, data logging) และบันทึกข้อมูลลง database เพื่อใช้ในการแสดงผลย้อนหลัง

User Review Required
IMPORTANT

การออกแบบสถาปัตยกรรม

ระบบจะแยกเป็น 3 ส่วนหลัก:
Inference Engine (Python/C++/Rust) - รันแยกเป็น standalone processes
Configuration Web UI (React/Next.js) - สำหรับตั้งค่า inference
NVR Web UI (React/Next.js) - สำหรับแสดงผล real-time และ playback
ใช้ PostgreSQL เป็น database หลักสำหรับบันทึกข้อมูล detection
ใช้ FastAPI เป็น backend API สำหรับเชื่อมต่อระหว่าง Web UI กับ Inference Engine
WARNING

ข้อจำกัดที่สำคัญ

ระบบรองรับ CPU only ตามที่กำหนด (ไม่ใช้ GPU)
การ render แบบ pipeline (real-time) อาจมีผลกระทบต่อ FPS ของ inference
RTSP streaming สำหรับ NVR จะใช้ MediaMTX หรือ FFmpeg ในการ re-stream
NOTE

ข้อมูลจากผู้ใช้

Database: PostgreSQL on Docker (user: admin, password: password)
Web Framework: Next.js
Video Storage: เลือกได้ว่าจะบันทึกหรือไม่ (optional) - ถ้าเลือกแสดง bbox ใน NVR UI ก็ไม่ต้องบันทึกซ้ำ
Deployment: Docker with CI/CD (single machine deployment)
สถาปัตยกรรมระบบ
Web UI
Database
Backend API
Processing Pipeline
Inference Engine Layer
Input Sources
implements
implements
implements
Video File
RTSP Stream
Python + PyTorch
C++ + OpenVINO
Rust + OpenVINO
Input Handler
Pre-processor
Inference Core
Post-processor
Renderer
Data Logger
FastAPI Server
WebSocket Handler
PostgreSQL
Config UI
NVR UI
Proposed Changes
Component 1: Database Schema
[NEW] 
schema.sql
สร้าง PostgreSQL schema สำหรับบันทึกข้อมูล:

Tables:

inference_sessions - บันทึก session ของการ inference แต่ละครั้ง

id, model_name, language, source_type, source_path, fps_target, save_video, video_output_path, created_at, ended_at
detections - บันทึกผลการ detect แต่ละ frame

id, session_id, frame_number, timestamp, class_id, class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2
performance_metrics - บันทึก performance ของแต่ละ frame

id, session_id, frame_number, preprocess_ms, inference_ms, postprocess_ms, render_ms, total_ms
video_frames (optional) - บันทึก reference ไปยัง video frames ที่บันทึกไว้

id, session_id, frame_number, timestamp, frame_path
Indexes:

idx_detections_session_frame on 
(session_id, frame_number)
idx_detections_timestamp on timestamp
idx_detections_class on class_id
idx_video_frames_session on session_id
Connection:

Host: localhost (Docker port mapping)
Port: 5432
Database: 
yolov11_inference
User: admin
Password: password
Component 2: Core Inference Modules (Shared Structure)
ทั้ง 3 ภาษาจะมีโครงสร้างเหมือนกัน แต่ implement ด้วยภาษาต่างกัน

[NEW] 
src/core/input_handler.py
[NEW] 
src/core/input_handler.cpp
[NEW] 
src/core/input_handler.rs
Input Handler Module:

รองรับ video file และ RTSP stream
อ่าน source FPS และคำนวณ frame timing
ควบคุม target FPS สำหรับ inference (frame skipping)
ใช้ time.perf_counter() (Python) / std::chrono (C++) / std::time::Instant (Rust) สำหรับ timing ที่แม่นยำ
[NEW] 
src/core/preprocessor.py
[NEW] 
src/core/preprocessor.cpp
[NEW] 
src/core/preprocessor.rs
Pre-processor Module:

Letterbox resizing (maintain aspect ratio)
Color space conversion (BGR → RGB)
Normalization (0-255 → 0-1)
HWC → CHW conversion
Batch preparation
[NEW] 
src/core/inference_engine.py
[NEW] 
src/core/inference_engine.cpp
[NEW] 
src/core/inference_engine.rs
Inference Engine Module:

Python: PyTorch CPU inference
C++: OpenVINO CPU inference
Rust: OpenVINO Rust bindings CPU inference
Model loading และ configuration
Thread-safe inference (สำหรับ multi-stream)
[NEW] 
src/core/postprocessor.py
[NEW] 
src/core/postprocessor.cpp
[NEW] 
src/core/postprocessor.rs
Post-processor Module:

Non-Maximum Suppression (NMS)
Coordinate scaling (model space → original image space)
Confidence filtering
Class probability calculation
[NEW] 
src/core/renderer.py
[NEW] 
src/core/renderer.cpp
[NEW] 
src/core/renderer.rs
Renderer Module:

Pipeline Mode: Render bounding boxes ทันทีพร้อม inference (real-time display)
Deferred Mode: บันทึก bbox ลง database ก่อน, render ภายหลัง
Draw bounding boxes, labels, confidence scores
FPS overlay
[NEW] 
src/core/data_logger.py
[NEW] 
src/core/data_logger.cpp
[NEW] 
src/core/data_logger.rs
Data Logger Module:

บันทึกข้อมูลลง PostgreSQL:
Timestamp (ISO 8601 format)
Bounding boxes (x1, y1, x2, y2 format สำหรับ OpenCV)
Class labels
Confidence scores
Performance metrics (pre-processing, inference, post-processing, render, total time)
Batch insert สำหรับ performance (buffer 100 frames)
Async I/O สำหรับไม่ให้กระทบ inference FPS
Component 3: Backend API (FastAPI)
[NEW] 
backend/main.py
FastAPI Server:

REST API endpoints:
POST /api/sessions/start - เริ่ม inference session
POST /api/sessions/{id}/stop - หยุด inference session
GET /api/sessions - ดึงรายการ sessions
GET /api/sessions/{id}/detections - ดึงข้อมูล detections
GET /api/sessions/{id}/metrics - ดึงข้อมูล performance metrics
WebSocket endpoint:
/ws/live/{session_id} - Stream real-time detections และ frames
[NEW] 
backend/models.py
Pydantic Models:

SessionConfig - configuration สำหรับ inference session
รวม save_video: bool สำหรับเลือกว่าจะบันทึกวิดีโอหรือไม่
Detection
 - detection result model
PerformanceMetric - performance metric model
[NEW] 
backend/database.py
Database Connection:

SQLAlchemy async engine
Connection pooling
Query helpers
Component 4: Configuration Web UI
[NEW] 
web-ui/config/
Next.js Application:

หน้า Configuration สำหรับตั้งค่า:
เลือกภาษา/framework (Python+PyTorch, C++/OpenVINO, Rust+OpenVINO)
เลือก model (YOLOv11, custom models)
เลือก input source (video file upload / RTSP URL)
กำหนด inference FPS
กำหนด confidence threshold
กำหนด IoU threshold
เลือก rendering mode (pipeline / deferred)
เลือกว่าจะบันทึกวิดีโอต้นฉบับหรือไม่ (checkbox)
Real-time status monitoring
Start/Stop inference sessions
Pages:

/ - Dashboard
/config - Configuration page
/sessions - Session management
Tech Stack:

Next.js 14 (App Router)
TypeScript
TailwindCSS
shadcn/ui components
Component 5: NVR Web UI
[NEW] 
web-ui/nvr/
Next.js Application:

Real-time View:

WebSocket connection สำหรับ live stream
แสดง bounding boxes real-time (overlay บน canvas)
FPS และ performance metrics overlay
Playback View:

Timeline navigation (date/time picker)
2 modes:
Video Playback Mode: เล่นวิดีโอที่บันทึกไว้ (ถ้ามี)
Frame Reconstruction Mode: ดึง bbox จาก database แล้ว render บนวิดีโอต้นฉบับ (ถ้าไม่ได้บันทึกวิดีโอ)
Filter by class, confidence threshold
Export detection data (CSV/JSON)
Analytics View:

Detection statistics (count by class, time distribution)
Performance charts (FPS, latency)
Heatmap visualization
Pages:

/live - Real-time monitoring
/playback - Historical playback
/analytics - Analytics dashboard
Tech Stack:

Next.js 14 (App Router)
TypeScript
TailwindCSS
Canvas API สำหรับ bbox rendering
Chart.js / Recharts สำหรับ analytics
Component 6: Docker & Deployment
[NEW] 
docker-compose.yml
Docker Compose Configuration:

version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: yolov11_postgres
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
      POSTGRES_DB: yolov11_inference
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    networks:
      - yolov11_network
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: yolov11_backend
    environment:
      DATABASE_URL: postgresql://admin:password@postgres:5432/yolov11_inference
    ports:
      - "8000:8000"
    depends_on:
      - postgres
    volumes:
      - ./models:/app/models
      - ./videos:/app/videos
    networks:
      - yolov11_network
  config_ui:
    build:
      context: ./web-ui/config
      dockerfile: Dockerfile
    container_name: yolov11_config_ui
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    networks:
      - yolov11_network
  nvr_ui:
    build:
      context: ./web-ui/nvr
      dockerfile: Dockerfile
    container_name: yolov11_nvr_ui
    ports:
      - "3001:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    networks:
      - yolov11_network
volumes:
  postgres_data:
networks:
  yolov11_network:
    driver: bridge
[NEW] 
setup.sh
Setup Script:

#!/bin/bash
# ติดตั้ง dependencies ด้วย uv add
echo "Seiya010" | sudo -S apt-get update
# Python dependencies
uv add torch torchvision --index-url https://download.pytorch.org/whl/cpu
uv add ultralytics opencv-python numpy
uv add fastapi uvicorn websockets
uv add sqlalchemy asyncpg psycopg2-binary
uv add pydantic python-dotenv
# C++ dependencies (OpenVINO, OpenCV)
echo "Seiya010" | sudo -S apt-get install -y cmake build-essential
# ... (OpenVINO installation)
# Rust dependencies
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# ... (Cargo dependencies)
# Docker (ถ้ายังไม่มี)
echo "Seiya010" | sudo -S apt-get install -y docker.io docker-compose
echo "Seiya010" | sudo -S usermod -aG docker $USER
# Node.js for Web UI development
curl -fsSL https://deb.nodesource.com/setup_20.x | echo "Seiya010" | sudo -S -E bash -
echo "Seiya010" | sudo -S apt-get install -y nodejs
[NEW] 
pyproject.toml
Python Project Configuration:

Dependencies list
uv configuration
Project metadata
[NEW] 
Cargo.toml
Rust Project Configuration:

Dependencies (openvino-rs, opencv-rs)
Workspace configuration
[NEW] 
CMakeLists.txt
C++ Build Configuration:

OpenVINO linking
OpenCV linking
Compiler flags
Component 7: Documentation
[NEW] 
README.md
Project Documentation:

ภาพรวมโปรเจกต์
Architecture diagram
Installation guide
Usage examples
API documentation
[NEW] 
docs/ARCHITECTURE.md
Architecture Documentation:

System design
Component interactions
Data flow diagrams
Database schema
[NEW] 
docs/API.md
API Documentation:

REST API endpoints
WebSocket protocol
Request/Response examples
โครงสร้างไฟล์โปรเจกต์
yolov11_inference_cpu/
├── database/
│   ├── schema.sql
│   └── migrations/
├── src/
│   ├── python/
│   │   └── core/
│   │       ├── input_handler.py
│   │       ├── preprocessor.py
│   │       ├── inference_engine.py
│   │       ├── postprocessor.py
│   │       ├── renderer.py
│   │       └── data_logger.py
│   ├── cpp/
│   │   ├── core/
│   │   │   ├── input_handler.cpp
│   │   │   ├── preprocessor.cpp
│   │   │   ├── inference_engine.cpp
│   │   │   ├── postprocessor.cpp
│   │   │   ├── renderer.cpp
│   │   │   └── data_logger.cpp
│   │   └── CMakeLists.txt
│   └── rust/
│       ├── src/
│       │   ├── core/
│       │   │   ├── input_handler.rs
│       │   │   ├── preprocessor.rs
│       │   │   ├── inference_engine.rs
│       │   │   ├── postprocessor.rs
│       │   │   ├── renderer.rs
│       │   │   └── data_logger.rs
│       │   └── main.rs
│       └── Cargo.toml
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   └── requirements.txt
├── web-ui/
│   ├── config/
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   └── nvr/
│       ├── src/
│       ├── public/
│       └── package.json
├── models/
│   ├── yolov11/
│   ├── custom_models/
│   └── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEPLOYMENT.md
├── setup.sh
├── pyproject.toml
├── README.md
└── .env.example
Verification Plan
Automated Tests
1. Unit Tests - Python Modules
# ติดตั้ง pytest
uv add pytest pytest-asyncio pytest-cov
# รัน unit tests
cd src/python
pytest tests/ -v --cov=core
Test Coverage:

test_input_handler.py - ทดสอบ video/RTSP input, FPS control
test_preprocessor.py - ทดสอบ letterbox, normalization
test_postprocessor.py - ทดสอบ NMS, coordinate scaling
test_data_logger.py - ทดสอบ database logging
2. Integration Tests - Backend API
# ติดตั้ง httpx สำหรับ async testing
uv add httpx
# รัน integration tests
cd backend
pytest tests/test_api.py -v
Test Coverage:

ทดสอบ REST API endpoints
ทดสอบ WebSocket connections
ทดสอบ database operations
3. C++ Unit Tests
# Build with tests
cd src/cpp/build
cmake -DBUILD_TESTS=ON ..
make
ctest --verbose
4. Rust Unit Tests
cd src/rust
cargo test --verbose
Manual Verification
1. End-to-End Inference Test (Python)
# 1. เริ่ม PostgreSQL
echo "Seiya010" | sudo -S systemctl start postgresql
# 2. สร้าง database
psql -U postgres -c "CREATE DATABASE yolov11_inference;"
psql -U postgres -d yolov11_inference -f database/schema.sql
# 3. เริ่ม FastAPI backend
cd backend
uvicorn main:app --reload --port 8000
# 4. เริ่ม Config Web UI (terminal ใหม่)
cd web-ui/config
npm run dev
# 5. เริ่ม NVR Web UI (terminal ใหม่)
cd web-ui/nvr
npm run dev
# 6. ทดสอบผ่าน Web UI:
#    - เปิด http://localhost:3000 (Config UI)
#    - เลือก Python+PyTorch
#    - Upload video file หรือใส่ RTSP URL
#    - กำหนด FPS = 10
#    - Start inference
#    - เปิด http://localhost:3001 (NVR UI)
#    - ตรวจสอบ real-time stream
#    - ตรวจสอบ bbox แสดงผลถูกต้อง
#    - Stop inference
#    - ทดสอบ playback ย้อนหลัง
Expected Results:

✅ Video stream แสดงผลใน NVR UI
✅ Bounding boxes แสดงผลถูกต้อง
✅ FPS ประมาณ 10 FPS (ตามที่ตั้งค่า)
✅ ข้อมูลบันทึกลง database
✅ Playback ย้อนหลังทำงานได้
2. Performance Comparison Test
# ทดสอบทั้ง 3 implementations กับ video เดียวกัน
# Python
python src/python/main.py --model yolov11 --source test.mp4 --fps 10
# C++
./src/cpp/build/inference --model yolov11 --source test.mp4 --fps 10
# Rust
./src/rust/target/release/inference --model yolov11 --source test.mp4 --fps 10
# เปรียบเทียบ performance metrics จาก database
psql -U postgres -d yolov11_inference -c "
SELECT 
    language,
    AVG(preprocess_ms) as avg_preprocess,
    AVG(inference_ms) as avg_inference,
    AVG(postprocess_ms) as avg_postprocess,
    AVG(total_ms) as avg_total
FROM performance_metrics
GROUP BY language;
"
Expected Results:

✅ C++ และ Rust ควรเร็วกว่า Python
✅ Total time ต่อ frame < 100ms (สำหรับ 10 FPS)
3. RTSP Stream Test
# 1. เริ่ม MediaMTX server (ถ้ามี)
./mediamtx
# 2. Stream video ไป RTSP
ffmpeg -re -i test.mp4 -c copy -f rtsp rtsp://localhost:8554/test
# 3. Run inference กับ RTSP
python src/python/main.py --model yolov11 --source rtsp://localhost:8554/test --fps 5
# 4. ตรวจสอบใน NVR UI
Expected Results:

✅ RTSP stream เชื่อมต่อสำเร็จ
✅ Inference ทำงานได้ real-time
✅ ไม่มี frame drops
Timeline Estimate
Phase	Duration	Tasks
Phase 1	1 day	Database schema, setup scripts
Phase 2	3 days	Python core modules
Phase 3	3 days	C++ core modules
Phase 4	3 days	Rust core modules
Phase 5	2 days	Backend API (FastAPI)
Phase 6	3 days	Config Web UI
Phase 7	4 days	NVR Web UI
Phase 8	2 days	Integration & Testing
Phase 9	1 day	Documentation
Total	22 days	
Dependencies
Python:

torch (CPU)
ultralytics
opencv-python
numpy
fastapi
uvicorn
websockets
sqlalchemy
asyncpg
pydantic
C++:

OpenVINO Runtime
OpenCV
PostgreSQL C++ client (libpqxx)
CMake
Rust:

openvino-rs
opencv-rs
tokio-postgres
serde
Web UI:

Next.js 14
React 18
TailwindCSS
WebSocket API
Chart.js (สำหรับ analytics)
Notes
ระบบออกแบบให้ modular สามารถ scale ได้ในอนาคต
แต่ละภาษามี implementation แยกกัน แต่ใช้ database เดียวกัน
Web UI สามารถควบคุมทั้ง 3 implementations ได้
Performance metrics จะช่วยในการเปรียบเทียบประสิทธิภาพ

Comment
Ctrl+Alt+M
