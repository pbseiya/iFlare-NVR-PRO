# Database Schema Documentation

## Overview

PostgreSQL database schema สำหรับระบบ YOLOv11 Inference ประกอบด้วย 4 tables หลัก:

1. **inference_sessions** - บันทึก session ของการ inference
2. **detections** - บันทึกผลการ detect objects
3. **performance_metrics** - บันทึก performance ของแต่ละ frame
4. **video_frames** - บันทึก reference ไปยัง video frames (optional)

---

## Tables

### 1. inference_sessions

บันทึกข้อมูล session ของการ inference แต่ละครั้ง

**Columns:**
- `id` (SERIAL) - Primary key
- `model_name` (VARCHAR) - ชื่อโมเดล (e.g., 'yolov11', 'cus4plus3')
- `language` (VARCHAR) - ภาษาที่ใช้ ('python', 'cpp', 'rust')
- `source_type` (VARCHAR) - ประเภท source ('video', 'rtsp', 'webcam')
- `source_path` (TEXT) - path หรือ URL ของ source
- `fps_target` (INTEGER) - target FPS สำหรับ inference
- `conf_threshold` (FLOAT) - confidence threshold (0-1)
- `iou_threshold` (FLOAT) - IoU threshold สำหรับ NMS (0-1)
- `save_video` (BOOLEAN) - บันทึกวิดีโอหรือไม่
- `video_output_path` (TEXT) - path ของวิดีโอที่บันทึก
- `render_mode` (VARCHAR) - โหมด rendering ('pipeline', 'deferred')
- `created_at` (TIMESTAMP) - เวลาเริ่มต้น
- `ended_at` (TIMESTAMP) - เวลาสิ้นสุด
- `status` (VARCHAR) - สถานะ ('running', 'completed', 'failed', 'stopped')

**Example:**
```sql
INSERT INTO inference_sessions (
    model_name, language, source_type, source_path, fps_target
) VALUES (
    'yolov11', 'python', 'video', '/videos/test.mp4', 10
);
```

---

### 2. detections

บันทึกผลการ detect objects ในแต่ละ frame

**Columns:**
- `id` (BIGSERIAL) - Primary key
- `session_id` (INTEGER) - Foreign key → inference_sessions
- `frame_number` (INTEGER) - หมายเลข frame
- `timestamp` (TIMESTAMP) - เวลาที่ detect
- `class_id` (INTEGER) - ID ของ class (0-3)
- `class_name` (VARCHAR) - ชื่อ class ('fire', 'smoke', 'fire_smoke', 'steam')
- `confidence` (FLOAT) - confidence score (0-1)
- `bbox_x1`, `bbox_y1` (INTEGER) - top-left corner
- `bbox_x2`, `bbox_y2` (INTEGER) - bottom-right corner

**Bounding Box Format:**
- OpenCV format: (x1, y1) = top-left, (x2, y2) = bottom-right
- ใช้ได้กับ `cv2.rectangle()` โดยตรง

**Example:**
```sql
INSERT INTO detections (
    session_id, frame_number, timestamp, 
    class_id, class_name, confidence,
    bbox_x1, bbox_y1, bbox_x2, bbox_y2
) VALUES (
    1, 42, NOW(), 
    0, 'fire', 0.87,
    100, 150, 250, 300
);
```

---

### 3. performance_metrics

บันทึก performance metrics ของแต่ละ frame

**Columns:**
- `id` (BIGSERIAL) - Primary key
- `session_id` (INTEGER) - Foreign key → inference_sessions
- `frame_number` (INTEGER) - หมายเลข frame
- `timestamp` (TIMESTAMP) - เวลา
- `preprocess_ms` (FLOAT) - เวลา pre-processing (ms)
- `inference_ms` (FLOAT) - เวลา inference (ms)
- `postprocess_ms` (FLOAT) - เวลา post-processing (ms)
- `render_ms` (FLOAT) - เวลา rendering (ms)
- `total_ms` (FLOAT) - เวลารวม (ms)

**Example:**
```sql
INSERT INTO performance_metrics (
    session_id, frame_number, timestamp,
    preprocess_ms, inference_ms, postprocess_ms, render_ms, total_ms
) VALUES (
    1, 42, NOW(),
    5.2, 45.8, 3.1, 2.5, 56.6
);
```

---

## Views

### session_summary

สรุปข้อมูล session พร้อมสถิติ

```sql
SELECT * FROM session_summary WHERE id = 1;
```

**Columns:**
- ข้อมูลพื้นฐานจาก `inference_sessions`
- `duration_seconds` - ระยะเวลาทั้งหมด (วินาที)
- `total_frames` - จำนวน frames ทั้งหมด
- `total_detections` - จำนวน detections ทั้งหมด
- `unique_classes` - จำนวน classes ที่พบ
- `avg_confidence` - confidence เฉลี่ย
- `avg_total_ms` - เวลาเฉลี่ยต่อ frame (ms)
- `avg_inference_ms` - เวลา inference เฉลี่ย (ms)

---

### detection_stats_by_class

สถิติ detections แยกตาม class

```sql
SELECT * FROM detection_stats_by_class WHERE session_id = 1;
```

**Columns:**
- `session_id`, `class_id`, `class_name`
- `detection_count` - จำนวน detections
- `avg_confidence`, `min_confidence`, `max_confidence`

---

### performance_stats

สถิติ performance

```sql
SELECT * FROM performance_stats WHERE session_id = 1;
```

**Columns:**
- `frame_count` - จำนวน frames
- `avg_preprocess_ms`, `avg_inference_ms`, `avg_postprocess_ms`, `avg_render_ms`, `avg_total_ms`
- `max_total_ms`, `min_total_ms`, `stddev_total_ms`

---

## Functions

### calculate_fps(session_id)

คำนวณ FPS จาก performance metrics

```sql
SELECT calculate_fps(1);
-- Returns: 17.7 (FPS)
```

---

### get_detections_by_time_range(session_id, start_time, end_time)

ดึง detections ในช่วงเวลาที่กำหนด

```sql
SELECT * FROM get_detections_by_time_range(
    1,
    '2026-02-05 10:00:00',
    '2026-02-05 10:05:00'
);
```

---

## Indexes

สร้าง indexes เพื่อเพิ่มประสิทธิภาพการ query:

- `idx_detections_session_frame` - Query detections by session + frame
- `idx_detections_timestamp` - Query detections by time
- `idx_detections_class` - Filter by class
- `idx_metrics_session_frame` - Query metrics by session + frame
- และอื่นๆ

---

## Setup

### 1. สร้าง Database

```bash
# เข้าสู่ PostgreSQL container
docker exec -it yolov11_postgres psql -U admin -d yolov11_inference

# หรือใช้ psql จาก host
psql -h localhost -U admin -d yolov11_inference
```

### 2. Run Schema

```bash
# Schema จะถูก run อัตโนมัติเมื่อ container start ครั้งแรก
# หรือ run manual:
psql -h localhost -U admin -d yolov11_inference -f database/schema.sql
```

### 3. Verify

```sql
-- ตรวจสอบ tables
\dt

-- ตรวจสอบ views
\dv

-- ตรวจสอบ functions
\df
```

---

## Common Queries

### ดึงข้อมูล session ล่าสุด

```sql
SELECT * FROM session_summary 
ORDER BY created_at DESC 
LIMIT 10;
```

### ดึง detections ของ session

```sql
SELECT 
    frame_number,
    class_name,
    confidence,
    bbox_x1, bbox_y1, bbox_x2, bbox_y2
FROM detections
WHERE session_id = 1
ORDER BY frame_number, confidence DESC;
```

### คำนวณ average FPS

```sql
SELECT 
    id,
    model_name,
    calculate_fps(id) as fps
FROM inference_sessions
WHERE status = 'completed';
```

### หา frames ที่มี fire detection

```sql
SELECT DISTINCT frame_number
FROM detections
WHERE session_id = 1 AND class_name = 'fire'
ORDER BY frame_number;
```

### Performance comparison ระหว่างภาษา

```sql
SELECT 
    s.language,
    AVG(m.inference_ms) as avg_inference_ms,
    AVG(m.total_ms) as avg_total_ms,
    calculate_fps(s.id) as avg_fps
FROM inference_sessions s
JOIN performance_metrics m ON s.id = m.session_id
WHERE s.status = 'completed'
GROUP BY s.language, s.id;
```

---

## Maintenance

### Cleanup old sessions

```sql
-- ลบ sessions ที่เก่ากว่า 30 วัน
DELETE FROM inference_sessions
WHERE created_at < NOW() - INTERVAL '30 days';
```

### Vacuum และ Analyze

```sql
-- Optimize database
VACUUM ANALYZE;
```

### Backup

```bash
# Backup database
docker exec yolov11_postgres pg_dump -U admin yolov11_inference > backup.sql

# Restore
docker exec -i yolov11_postgres psql -U admin yolov11_inference < backup.sql
```
