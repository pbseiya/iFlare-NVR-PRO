from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager


class DatabaseInterface(ABC):
    """Abstract Base Class for Database Implementations"""

    @abstractmethod
    def __init__(self, connection_string: str):
        pass

    @abstractmethod
    async def connect(self):
        """Establish connection to the database"""
        pass

    @abstractmethod
    async def disconnect(self):
        """Close connection to the database"""
        pass

    @abstractmethod
    @asynccontextmanager
    async def acquire(self):
        """Acquire a connection from the pool"""
        pass

    # ========================================
    # Session Queries
    # ========================================

    @abstractmethod
    async def create_session(
        self,
        model_name: str,
        language: str,
        source_type: str,
        source_path: str,
        fps_target: int,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        save_video: bool = False,
        video_output_path: Optional[str] = None,
        render_mode: str = "pipeline",
        recording_mode: str = "none",
        name: Optional[str] = None,
        video_height: Optional[int] = None,
        source_width: Optional[int] = None,
        source_height: Optional[int] = None,
    ) -> int:
        pass

    @abstractmethod
    async def update_session(self, session_id: int, updates: Dict[str, Any]):
        pass

    @abstractmethod
    async def get_session(self, session_id: int) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def list_sessions(
        self, limit: int = 100, offset: int = 0, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def update_session_status(self, session_id: int, status: str):
        pass

    # ========================================
    # Detection Queries
    # ========================================

    @abstractmethod
    async def get_detections(
        self,
        session_id: int,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        class_id: Optional[int] = None,
        min_confidence: Optional[float] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def count_detections(
        self,
        session_id: int,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        class_id: Optional[int] = None,
        min_confidence: Optional[float] = None,
    ) -> int:
        pass

    # ========================================
    # Performance Metrics Queries
    # ========================================

    @abstractmethod
    async def get_metrics(
        self, session_id: int, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_performance_stats(self, session_id: int) -> Optional[Dict[str, Any]]:
        pass

    # ========================================
    # Analytics Queries
    # ========================================

    @abstractmethod
    async def get_detection_stats_by_class(self, session_id: int) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_fps_over_time(
        self, session_id: int, interval_seconds: int = 60
    ) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_detections_over_time(
        self, session_id: int, interval_seconds: int = 60
    ) -> List[Dict[str, Any]]:
        pass

    # ========================================
    # Health Check & Video Segments
    # ========================================

    @abstractmethod
    async def health_check(self) -> bool:
        pass

    @abstractmethod
    async def create_video_segment(
        self, session_id: int, file_path: str, start_time: datetime
    ) -> int:
        pass

    @abstractmethod
    async def update_video_segment(
        self, segment_id: int, end_time: datetime, duration: float, status: str = "completed"
    ):
        pass

    @abstractmethod
    async def get_session_segments(self, session_id: int) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def get_stuck_segments(self) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def mark_segment_recovered(
        self, segment_id: int, new_path: str, duration: float, status: str
    ):
        pass

    # ========================================
    # App Settings
    # ========================================

    @abstractmethod
    async def get_app_setting(self, key: str, default: Any = None) -> Any:
        pass

    @abstractmethod
    async def set_app_setting(self, key: str, value: Any):
        pass
