"""
YOLOv11 Inference System - Backend API
Pydantic Models for request/response validation.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ========================================
# Session Models
# ========================================


class SessionConfig(BaseModel):
    """Configuration for creating an inference session"""

    model_config = {"protected_namespaces": ()}

    name: Optional[str] = Field(None, description="Session name")
    model_name: str = Field(..., description="Model name (e.g., 'yolov11')")
    language: str = Field(
        ...,
        description="Implementation language",
        pattern="^(python\\+pytorch|python\\+openvino|cpp\\+openvino|rust\\+openvino)$",
    )
    source_type: str = Field(..., description="Source type", pattern="^(video|rtsp|webcam)$")
    source_path: str = Field(..., description="Path to video file, RTSP URL, or webcam index")
    fps_target: int = Field(10, ge=1, le=60, description="Target FPS for inference")
    conf_threshold: float = Field(0.25, ge=0.0, le=1.0, description="Confidence threshold")
    iou_threshold: float = Field(0.45, ge=0.0, le=1.0, description="IoU threshold for NMS")
    save_video: bool = Field(True, description="Legacy: whether to save output video")
    video_output_path: Optional[str] = Field(None, description="Output video path")
    recording_mode: str = Field(
        "clean", pattern="^(none|clean|annotated)$", description="Recording mode"
    )
    render_mode: str = Field(
        "pipeline", pattern="^(pipeline|deferred)$", description="Rendering mode"
    )


class SessionUpdate(BaseModel):
    """Configuration for updating a session"""

    name: Optional[str] = None
    model_name: Optional[str] = None
    language: Optional[str] = None
    source_type: Optional[str] = None
    source_path: Optional[str] = None
    fps_target: Optional[int] = Field(None, ge=1, le=60)
    conf_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    iou_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    save_video: Optional[bool] = None
    video_output_path: Optional[str] = None
    recording_mode: Optional[str] = Field(None, pattern="^(none|clean|annotated)$")
    render_mode: Optional[str] = Field(None, pattern="^(pipeline|deferred)$")


class SessionResponse(BaseModel):
    """Response after creating a session"""

    session_id: int
    status: str
    message: str
    created_at: datetime


class SessionInfo(BaseModel):
    """Detailed session information"""

    id: int
    name: Optional[str]
    model_name: str
    language: str
    source_type: str
    source_path: str
    fps_target: int
    conf_threshold: float
    iou_threshold: float
    save_video: bool
    video_output_path: Optional[str]
    recording_mode: Optional[str]
    render_mode: str
    created_at: datetime
    ended_at: Optional[datetime]
    status: str

    # Statistics (from view)
    duration_seconds: Optional[float] = None
    total_frames: Optional[int] = None
    total_detections: Optional[int] = None
    unique_classes: Optional[int] = None
    avg_confidence: Optional[float] = None
    avg_total_ms: Optional[float] = None
    avg_inference_ms: Optional[float] = None


class SessionListResponse(BaseModel):
    """List of sessions"""

    sessions: List[SessionInfo]
    total: int


# ========================================
# Detection Models
# ========================================


class Detection(BaseModel):
    """Single detection result"""

    id: Optional[int] = None
    session_id: int
    frame_number: int
    timestamp: datetime
    class_id: int
    class_name: str
    confidence: float
    bbox_x1: int
    bbox_y1: int
    bbox_x2: int
    bbox_y2: int


class DetectionListResponse(BaseModel):
    """List of detections"""

    detections: List[Detection]
    total: int


class DetectionFilter(BaseModel):
    """Filter parameters for detections"""

    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    class_id: Optional[int] = None
    min_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


# ========================================
# Performance Metrics Models
# ========================================


class PerformanceMetric(BaseModel):
    """Performance metrics for a frame"""

    id: Optional[int] = None
    session_id: int
    frame_number: int
    timestamp: datetime
    preprocess_ms: float
    inference_ms: float
    postprocess_ms: float
    render_ms: float
    total_ms: float


class PerformanceStats(BaseModel):
    """Aggregated performance statistics"""

    session_id: int
    frame_count: int
    avg_preprocess_ms: float
    avg_inference_ms: float
    avg_postprocess_ms: float
    avg_render_ms: float
    avg_total_ms: float
    max_total_ms: float
    min_total_ms: float
    stddev_total_ms: Optional[float]
    calculated_fps: float  # 1000 / avg_total_ms


class MetricsListResponse(BaseModel):
    """List of performance metrics"""

    metrics: List[PerformanceMetric]
    total: int


# ========================================
# WebSocket Models
# ========================================


class LiveFrame(BaseModel):
    """Live frame data for WebSocket streaming"""

    session_id: int
    frame_number: int
    timestamp: datetime
    detections: List[Detection]
    fps: float
    frame_base64: Optional[str] = None  # Base64 encoded JPEG


class LiveStatus(BaseModel):
    """Live status update"""

    session_id: int
    status: str
    message: str
    fps: Optional[float] = None
    total_frames: Optional[int] = None
    total_detections: Optional[int] = None


# ========================================
# Analytics Models
# ========================================


class DetectionStatsByClass(BaseModel):
    """Detection statistics grouped by class"""

    session_id: int
    class_id: int
    class_name: str
    detection_count: int
    avg_confidence: float
    min_confidence: float
    max_confidence: float


class TimeSeriesPoint(BaseModel):
    """Single point in time series data"""

    timestamp: datetime
    value: float


class AnalyticsResponse(BaseModel):
    """Analytics data response"""

    session_id: int
    stats_by_class: List[DetectionStatsByClass]
    fps_over_time: List[TimeSeriesPoint]
    detections_over_time: List[TimeSeriesPoint]


# ========================================
# Error Models
# ========================================


class ErrorResponse(BaseModel):
    """Error response"""

    error: str
    detail: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


# ========================================
# Health Check Models
# ========================================


class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    database: str
    timestamp: datetime
    version: str = "1.0.0"
