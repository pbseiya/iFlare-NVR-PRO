-- YOLOv11 Inference System Database Schema
-- PostgreSQL 15+
-- Created: 2026-02-05

-- ========================================
-- 1. Inference Sessions Table
-- ========================================
CREATE TABLE IF NOT EXISTS inference_sessions (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    language VARCHAR(20) NOT NULL CHECK (
        language IN ('python', 'cpp', 'rust')
    ),
    source_type VARCHAR(20) NOT NULL CHECK (
        source_type IN ('video', 'rtsp', 'webcam')
    ),
    source_path TEXT NOT NULL,
    fps_target INTEGER NOT NULL CHECK (fps_target > 0),
    conf_threshold FLOAT NOT NULL DEFAULT 0.25 CHECK (
        conf_threshold >= 0
        AND conf_threshold <= 1
    ),
    iou_threshold FLOAT NOT NULL DEFAULT 0.45 CHECK (
        iou_threshold >= 0
        AND iou_threshold <= 1
    ),
    save_video BOOLEAN DEFAULT FALSE,
    video_output_path TEXT,
    render_mode VARCHAR(20) DEFAULT 'pipeline' CHECK (
        render_mode IN ('pipeline', 'deferred')
    ),
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'running' CHECK (
        status IN (
            'running',
            'completed',
            'failed',
            'stopped'
        )
    )
);

-- ========================================
-- 2. Detections Table
-- ========================================
CREATE TABLE IF NOT EXISTS detections (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES inference_sessions (id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    class_id INTEGER NOT NULL CHECK (
        class_id >= 0
        AND class_id <= 3
    ),
    class_name VARCHAR(50) NOT NULL CHECK (
        class_name IN (
            'fire',
            'smoke',
            'fire_smoke',
            'steam'
        )
    ),
    confidence FLOAT NOT NULL CHECK (
        confidence >= 0
        AND confidence <= 1
    ),
    -- Bounding box coordinates (OpenCV format: top-left and bottom-right)
    bbox_x1 INTEGER NOT NULL,
    bbox_y1 INTEGER NOT NULL,
    bbox_x2 INTEGER NOT NULL,
    bbox_y2 INTEGER NOT NULL,
    -- Validation: x2 > x1 and y2 > y1
    CONSTRAINT valid_bbox CHECK (
        bbox_x2 > bbox_x1
        AND bbox_y2 > bbox_y1
    )
);

-- ========================================
-- 3. Performance Metrics Table
-- ========================================
CREATE TABLE IF NOT EXISTS performance_metrics (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES inference_sessions (id) ON DELETE CASCADE,
    frame_number INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    -- Time measurements in milliseconds
    preprocess_ms FLOAT NOT NULL CHECK (preprocess_ms >= 0),
    inference_ms FLOAT NOT NULL CHECK (inference_ms >= 0),
    postprocess_ms FLOAT NOT NULL CHECK (postprocess_ms >= 0),
    render_ms FLOAT NOT NULL CHECK (render_ms >= 0),
    total_ms FLOAT NOT NULL CHECK (total_ms >= 0),
    -- Validation: total should be sum of components
    CONSTRAINT valid_total_time CHECK (
        total_ms >= (
            preprocess_ms + inference_ms + postprocess_ms + render_ms
        )
    )
);

-- ========================================
-- 4.
-- ========================================

-- ========================================
-- Indexes for Performance
-- ========================================

-- Detections indexes
CREATE INDEX IF NOT EXISTS idx_detections_session_frame ON detections (session_id, frame_number);

CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections (timestamp);

CREATE INDEX IF NOT EXISTS idx_detections_class ON detections (class_id);

CREATE INDEX IF NOT EXISTS idx_detections_session_timestamp ON detections (session_id, timestamp);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_metrics_session_frame ON performance_metrics (session_id, frame_number);

CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON performance_metrics (timestamp);

-- Video frames indexes
CREATE INDEX IF NOT EXISTS idx_video_frames_session ON video_frames (session_id);

CREATE INDEX IF NOT EXISTS idx_video_frames_timestamp ON video_frames (timestamp);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON inference_sessions (created_at);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON inference_sessions (status);

-- ========================================
-- Views for Common Queries
-- ========================================

-- View: Session summary with detection counts
CREATE OR REPLACE VIEW session_summary AS
SELECT
    s.id,
    s.model_name,
    s.language,
    s.source_type,
    s.source_path,
    s.fps_target,
    s.save_video,
    s.render_mode,
    s.status,
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

-- View: Detection statistics by class
CREATE OR REPLACE VIEW detection_stats_by_class AS
SELECT
    session_id,
    class_id,
    class_name,
    COUNT(*) as detection_count,
    AVG(confidence) as avg_confidence,
    MIN(confidence) as min_confidence,
    MAX(confidence) as max_confidence
FROM detections
GROUP BY
    session_id,
    class_id,
    class_name;

-- View: Performance statistics
CREATE OR REPLACE VIEW performance_stats AS
SELECT
    session_id,
    COUNT(*) as frame_count,
    AVG(preprocess_ms) as avg_preprocess_ms,
    AVG(inference_ms) as avg_inference_ms,
    AVG(postprocess_ms) as avg_postprocess_ms,
    AVG(render_ms) as avg_render_ms,
    AVG(total_ms) as avg_total_ms,
    MAX(total_ms) as max_total_ms,
    MIN(total_ms) as min_total_ms,
    STDDEV(total_ms) as stddev_total_ms
FROM performance_metrics
GROUP BY
    session_id;

-- ========================================
-- Functions
-- ========================================

-- Function: Calculate FPS from performance metrics
CREATE OR REPLACE FUNCTION calculate_fps(session_id_param INTEGER)
RETURNS FLOAT AS $$
DECLARE
    avg_frame_time FLOAT;
BEGIN
    SELECT AVG(total_ms) INTO avg_frame_time
    FROM performance_metrics
    WHERE session_id = session_id_param;
    
    IF avg_frame_time IS NULL OR avg_frame_time = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN 1000.0 / avg_frame_time;
END;
$$ LANGUAGE plpgsql;

-- Function: Get detections for a specific time range
CREATE OR REPLACE FUNCTION get_detections_by_time_range(
    session_id_param INTEGER,
    start_time TIMESTAMP,
    end_time TIMESTAMP
)
RETURNS TABLE (
    frame_number INTEGER,
    timestamp TIMESTAMP,
    class_name VARCHAR(50),
    confidence FLOAT,
    bbox_x1 INTEGER,
    bbox_y1 INTEGER,
    bbox_x2 INTEGER,
    bbox_y2 INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.frame_number,
        d.timestamp,
        d.class_name,
        d.confidence,
        d.bbox_x1,
        d.bbox_y1,
        d.bbox_x2,
        d.bbox_y2
    FROM detections d
    WHERE d.session_id = session_id_param
        AND d.timestamp >= start_time
        AND d.timestamp <= end_time
    ORDER BY d.timestamp, d.frame_number;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Sample Data (for testing)
-- ========================================

-- Insert sample session
-- INSERT INTO inference_sessions (model_name, language, source_type, source_path, fps_target)
-- VALUES ('yolov11', 'python', 'video', '/path/to/video.mp4', 10);

-- ========================================
-- Cleanup (Optional - for development)
-- ========================================

-- DROP VIEW IF EXISTS session_summary CASCADE;
-- DROP VIEW IF EXISTS detection_stats_by_class CASCADE;
-- DROP VIEW IF EXISTS performance_stats CASCADE;
-- DROP FUNCTION IF EXISTS calculate_fps(INTEGER);
-- DROP FUNCTION IF EXISTS get_detections_by_time_range(INTEGER, TIMESTAMP, TIMESTAMP);
-- DROP TABLE IF EXISTS video_frames CASCADE;
-- DROP TABLE IF EXISTS performance_metrics CASCADE;
-- DROP TABLE IF EXISTS detections CASCADE;
-- DROP TABLE IF EXISTS inference_sessions CASCADE;