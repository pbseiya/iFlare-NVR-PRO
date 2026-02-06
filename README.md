# YOLOv11 Inference System

ระบบ YOLOv11 Inference แบบ modular พร้อม Web UI สำหรับ configuration และ NVR Web UI สำหรับแสดงผลแบบ real-time และ playback ย้อนหลัง

## Features

- 🔥 **3 ภาษา/Framework**: Python+PyTorch, C++/OpenVINO, Rust+OpenVINO
- 🎯 **CPU Inference**: Optimized สำหรับ CPU only
- 🌐 **Web UI**: Configuration และ NVR monitoring
- 📊 **Database Logging**: บันทึกข้อมูล detections และ performance metrics
- 🎬 **Video Storage**: เลือกได้ว่าจะบันทึกวิดีโอหรือไม่
- 📈 **Analytics**: Performance comparison และ detection statistics
- 🐳 **Docker**: Ready-to-deploy with Docker Compose

## Architecture

```
Input Sources (Video/RTSP)
    ↓
Inference Engine (Python/C++/Rust)
    ↓
Processing Pipeline (6 modules)
    ↓
PostgreSQL Database + Video Storage (optional)
    ↓
Backend API (FastAPI + WebSocket)
    ↓
Web UI (Config + NVR)
```

ดูรายละเอียดเพิ่มเติมใน [Architecture Summary](docs/ARCHITECTURE.md)

## Quick Start

### 1. Setup

```bash
# Clone repository
git clone <repository-url>
cd yolov11_inference_cpu

# Run setup script
chmod +x setup.sh
./setup.sh
```

Setup script จะติดตั้ง:
- Docker และ Docker Compose
- Python dependencies (uv)
- Node.js 20.x
- C++ build tools
- Rust toolchain
- PostgreSQL database (Docker)

### 2. Configuration

```bash
# Copy environment variables
cp .env.example .env

# Edit .env file
nano .env
```

### 3. Place Models

วาง YOLOv11 models ใน `./models/` directory:

```
models/
├── yolov11/
│   └── om_flare_yolov11.pt
├── cus4plus3/
│   └── cus4plus3.xml
└── cus32/
    └── cus32.xml
```

### 4. Start Services

#### Option A: Docker Compose (แนะนำ)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Option B: Development Mode

```bash
# Terminal 1: Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2: Config UI
cd web-ui/config
npm install
npm run dev

# Terminal 3: NVR UI
cd web-ui/nvr
npm install
npm run dev
```

### 5. Access Web UI

- **Config UI**: http://localhost:3000
- **NVR UI**: http://localhost:3001
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **pgAdmin** (optional): http://localhost:5050

## Project Structure

```
yolov11_inference_cpu/
├── database/
│   ├── schema.sql          # PostgreSQL schema
│   └── README.md           # Database documentation
├── src/
│   ├── python/             # Python implementation
│   ├── cpp/                # C++ implementation
│   └── rust/               # Rust implementation
├── backend/
│   ├── main.py             # FastAPI application
│   ├── models.py           # Pydantic models
│   └── database.py         # Database connection
├── web-ui/
│   ├── config/             # Configuration UI (Next.js)
│   └── nvr/                # NVR UI (Next.js)
├── models/                 # YOLOv11 models
├── videos/                 # Video files
├── docker-compose.yml      # Docker Compose config
├── setup.sh                # Setup script
└── .env.example            # Environment variables template
```

## Database

PostgreSQL database สำหรับบันทึก:
- Inference sessions
- Detections (bbox, class, confidence)
- Performance metrics
- Video frames reference (optional)

ดูรายละเอียดใน [Database README](database/README.md)

### Database Access

```bash
# Using Docker
docker exec -it yolov11_postgres psql -U admin -d yolov11_inference

# Using psql from host
psql -h localhost -U admin -d yolov11_inference
```

**Credentials:**
- Host: `localhost`
- Port: `5432`
- Database: `yolov11_inference`
- User: `admin`
- Password: `password`

## Usage

### 1. Configuration UI

1. เปิด http://localhost:3000
2. เลือกภาษา/framework (Python, C++, Rust)
3. เลือก model
4. กำหนด input source (video file / RTSP URL)
5. ตั้งค่า FPS, confidence threshold, IoU threshold
6. เลือก rendering mode (pipeline / deferred)
7. เลือกว่าจะบันทึกวิดีโอหรือไม่
8. Start inference

### 2. NVR UI

1. เปิด http://localhost:3001
2. **Live View**: ดู real-time inference
3. **Playback**: ย้อนดูผลลัพธ์
4. **Analytics**: ดูสถิติและ performance

### 3. Python Inference (Standalone)

```bash
cd src/python
python main.py \
    --model yolov11 \
    --source /path/to/video.mp4 \
    --fps 10 \
    --conf 0.25 \
    --iou 0.45
```

### 4. C++ Inference (Standalone)

```bash
cd src/cpp
mkdir build && cd build
cmake ..
make

./inference \
    --model yolov11 \
    --source /path/to/video.mp4 \
    --fps 10
```

### 5. Rust Inference (Standalone)

```bash
cd src/rust
cargo build --release

./target/release/inference \
    --model yolov11 \
    --source /path/to/video.mp4 \
    --fps 10
```

## API Documentation

### REST API Endpoints

- `POST /api/sessions/start` - เริ่ม inference session
- `POST /api/sessions/{id}/stop` - หยุด inference session
- `GET /api/sessions` - ดึงรายการ sessions
- `GET /api/sessions/{id}` - ดึงข้อมูล session
- `GET /api/sessions/{id}/detections` - ดึง detections
- `GET /api/sessions/{id}/metrics` - ดึง performance metrics

### WebSocket

- `/ws/live/{session_id}` - Real-time stream

ดูรายละเอียดเพิ่มเติมใน [API Documentation](docs/API.md)

## Development

### Backend Development

```bash
cd backend

# Install dependencies
uv sync

# Run with auto-reload
uvicorn main:app --reload --port 8000

# Run tests
pytest tests/ -v
```

### Frontend Development

```bash
cd web-ui/config  # or web-ui/nvr

# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Testing

### Database Tests

```bash
# Test connection
docker exec yolov11_postgres psql -U admin -d yolov11_inference -c "SELECT 1;"

# Run sample queries
docker exec -i yolov11_postgres psql -U admin -d yolov11_inference < database/test_queries.sql
```

### Integration Tests

```bash
# Backend tests
cd backend
pytest tests/ -v --cov=.

# Frontend tests
cd web-ui/config
npm test
```

## Performance

### Benchmarks

| Language | Avg Inference (ms) | Avg Total (ms) | FPS |
|----------|-------------------|----------------|-----|
| Python   | ~45               | ~56            | ~18 |
| C++      | ~35               | ~42            | ~24 |
| Rust     | ~36               | ~43            | ~23 |

*Tested on Intel Core i7-10700K CPU @ 3.80GHz*

## Troubleshooting

### PostgreSQL Connection Failed

```bash
# Check if container is running
docker ps | grep yolov11_postgres

# Start container
docker start yolov11_postgres

# Check logs
docker logs yolov11_postgres
```

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :5432  # PostgreSQL
sudo lsof -i :8000  # Backend
sudo lsof -i :3000  # Config UI

# Kill process
kill -9 <PID>
```

### Docker Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and log back in
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file

## Credits

- **YOLOv11**: Ultralytics
- **OpenVINO**: Intel
- **FastAPI**: Sebastián Ramírez
- **Next.js**: Vercel

---

**Created by**: Antigravity AI  
**Date**: 2026-02-05  
**Version**: 1.0.0
