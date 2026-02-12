-- SQL Server Schema for YOLOv11 Inference System

-- App Settings
IF NOT EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'app_settings'
        AND xtype = 'U'
)
CREATE TABLE app_settings (
    [key] NVARCHAR (50) PRIMARY KEY,
    [value] NVARCHAR (MAX),
    [updated_at] DATETIME2 DEFAULT GETDATE ()
);

-- Inference Sessions
IF NOT EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'inference_sessions'
        AND xtype = 'U'
)
CREATE TABLE inference_sessions (
    id INT IDENTITY (1, 1) PRIMARY KEY,
    model_name NVARCHAR (255) NOT NULL,
    language NVARCHAR (50) NOT NULL,
    source_type NVARCHAR (50) NOT NULL,
    source_path NVARCHAR (MAX) NOT NULL,
    fps_target INT NOT NULL,
    conf_threshold FLOAT NOT NULL,
    iou_threshold FLOAT NOT NULL,
    save_video BIT DEFAULT 0,
    video_output_path NVARCHAR (MAX),
    render_mode NVARCHAR (50) DEFAULT 'pipeline',
    recording_mode NVARCHAR (50) DEFAULT 'none',
    name NVARCHAR (100),
    video_height INT,
    source_width INT,
    source_height INT,
    status NVARCHAR (20) DEFAULT 'running',
    created_at DATETIME2 DEFAULT GETDATE (),
    ended_at DATETIME2
);

-- Detections
IF NOT EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'detections'
        AND xtype = 'U'
)
CREATE TABLE detections (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    session_id INT NOT NULL,
    frame_number INT NOT NULL,
    timestamp DATETIME2 NOT NULL,
    class_id INT NOT NULL,
    class_name NVARCHAR (100),
    confidence FLOAT NOT NULL,
    bbox_x1 INT NOT NULL,
    bbox_y1 INT NOT NULL,
    bbox_x2 INT NOT NULL,
    bbox_y2 INT NOT NULL,
    CONSTRAINT FK_detections_session FOREIGN KEY (session_id) REFERENCES inference_sessions (id) ON DELETE CASCADE
);

CREATE INDEX idx_detections_session_id ON detections (session_id);

CREATE INDEX idx_detections_timestamp ON detections (timestamp);

-- Performance Metrics
IF NOT EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'performance_metrics'
        AND xtype = 'U'
)
CREATE TABLE performance_metrics (
    id BIGINT IDENTITY (1, 1) PRIMARY KEY,
    session_id INT NOT NULL,
    frame_number INT NOT NULL,
    timestamp DATETIME2 NOT NULL,
    total_ms FLOAT NOT NULL,
    inference_ms FLOAT NOT NULL,
    preprocess_ms FLOAT NOT NULL,
    postprocess_ms FLOAT NOT NULL,
    render_ms FLOAT NOT NULL,
    CONSTRAINT FK_metrics_session FOREIGN KEY (session_id) REFERENCES inference_sessions (id) ON DELETE CASCADE
);

CREATE INDEX idx_metrics_session_id ON performance_metrics (session_id);

-- Video Segments
IF NOT EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'video_segments'
        AND xtype = 'U'
)
CREATE TABLE video_segments (
    id INT IDENTITY (1, 1) PRIMARY KEY,
    session_id INT NOT NULL,
    file_path NVARCHAR (MAX) NOT NULL,
    start_time DATETIME2 NOT NULL,
    end_time DATETIME2,
    duration_seconds FLOAT,
    created_at DATETIME2 DEFAULT GETDATE (),
    status NVARCHAR (20) DEFAULT 'completed',
    CONSTRAINT FK_segments_session FOREIGN KEY (session_id) REFERENCES inference_sessions (id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_session_id ON video_segments (session_id);

-- Views (Simulated as Views in SQL Server)
IF EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'session_summary'
        AND xtype = 'V'
)
DROP VIEW session_summary;
GO

CREATE VIEW session_summary AS
SELECT
    s.*,
    (
        SELECT COUNT(*)
        FROM detections d
        WHERE
            d.session_id = s.id
    ) as detection_count,
    (
        SELECT AVG(total_ms)
        FROM performance_metrics m
        WHERE
            m.session_id = s.id
    ) as avg_latency_ms
FROM inference_sessions s;
GO

IF EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'performance_stats'
        AND xtype = 'V'
)
DROP VIEW performance_stats;
GO

CREATE VIEW performance_stats AS
SELECT
    session_id,
    COUNT(*) as total_frames,
    AVG(total_ms) as avg_total_ms,
    AVG(inference_ms) as avg_inference_ms,
    AVG(preprocess_ms) as avg_preprocess_ms,
    AVG(postprocess_ms) as avg_postprocess_ms,
    MIN(total_ms) as min_total_ms,
    MAX(total_ms) as max_total_ms
FROM performance_metrics
GROUP BY
    session_id;
GO

IF EXISTS (
    SELECT *
    FROM sysobjects
    WHERE
        name = 'detection_stats_by_class'
        AND xtype = 'V'
)
DROP VIEW detection_stats_by_class;
GO

CREATE VIEW detection_stats_by_class AS
SELECT
    session_id,
    class_name,
    COUNT(*) as detection_count,
    AVG(confidence) as avg_confidence
FROM detections
GROUP BY
    session_id,
    class_name;
GO