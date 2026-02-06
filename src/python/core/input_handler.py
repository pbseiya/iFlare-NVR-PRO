"""
YOLOv11 Inference System - Python Core Modules
Input Handler Module

Handles video file and RTSP stream input with precise FPS control.
"""

import cv2
import time
from pathlib import Path
from typing import Optional, Tuple, Generator
from dataclasses import dataclass
import numpy as np


@dataclass
class InputConfig:
    """Configuration for input source"""
    source: str  # Path to video file, RTSP URL, or webcam index
    source_type: str  # 'video', 'rtsp', or 'webcam'
    fps_target: int  # Target FPS for inference
    
    @classmethod
    def from_source(cls, source: str, fps_target: int = 10) -> 'InputConfig':
        """Create InputConfig from source string"""
        # Determine source type
        if source.isdigit():
            source_type = 'webcam'
            source = int(source)
        elif source.startswith('rtsp://') or source.startswith('http://'):
            source_type = 'rtsp'
        else:
            source_type = 'video'
            
        return cls(source=source, source_type=source_type, fps_target=fps_target)


@dataclass
class FrameInfo:
    """Information about a frame"""
    frame: np.ndarray
    frame_number: int
    timestamp: float  # Unix timestamp
    source_fps: float  # Actual FPS of the source


class InputHandler:
    """
    Handles video/RTSP input with precise FPS control.
    
    Features:
    - Video file input
    - RTSP stream input
    - Webcam input
    - Precise FPS control with frame skipping
    - Accurate timing using perf_counter
    """
    
    def __init__(self, config: InputConfig):
        self.config = config
        self.cap: Optional[cv2.VideoCapture] = None
        self.source_fps: float = 0.0
        self.frame_number: int = 0
        self.start_time: float = 0.0
        self.target_frame_interval: float = 1.0 / config.fps_target
        
    def open(self) -> bool:
        """
        Open the input source.
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Open video capture
            if isinstance(self.config.source, int):
                self.cap = cv2.VideoCapture(self.config.source)
            else:
                self.cap = cv2.VideoCapture(str(self.config.source))
            
            if not self.cap.isOpened():
                return False
            
            # Get source FPS
            self.source_fps = self.cap.get(cv2.CAP_PROP_FPS)
            if self.source_fps == 0:
                # Fallback for RTSP streams
                self.source_fps = 30.0
            
            # Initialize timing
            self.start_time = time.perf_counter()
            self.frame_number = 0
            
            return True
            
        except Exception as e:
            print(f"Error opening source: {e}")
            return False
    
    def read_frame(self) -> Optional[FrameInfo]:
        """
        Read a single frame from the source.
        
        Returns:
            FrameInfo: Frame information, or None if no frame available
        """
        if self.cap is None or not self.cap.isOpened():
            return None
        
        ret, frame = self.cap.read()
        if not ret or frame is None:
            return None
        
        self.frame_number += 1
        timestamp = time.time()
        
        return FrameInfo(
            frame=frame,
            frame_number=self.frame_number,
            timestamp=timestamp,
            source_fps=self.source_fps
        )
    
    def frames_generator(self) -> Generator[FrameInfo, None, None]:
        """
        Generate frames with FPS control.
        
        Yields:
            FrameInfo: Frame information
        """
        if not self.open():
            raise RuntimeError(f"Failed to open source: {self.config.source}")
        
        last_inference_time = time.perf_counter()
        frames_processed = 0
        
        try:
            while True:
                current_time = time.perf_counter()
                elapsed = current_time - last_inference_time
                
                # Check if it's time for next inference
                if elapsed >= self.target_frame_interval:
                    frame_info = self.read_frame()
                    
                    if frame_info is None:
                        break
                    
                    yield frame_info
                    
                    # Update timing
                    last_inference_time = current_time
                    frames_processed += 1
                else:
                    # Skip frame to maintain target FPS
                    ret, _ = self.cap.read()
                    if not ret:
                        break
                    self.frame_number += 1
                    
        finally:
            self.close()
    
    def get_actual_fps(self) -> float:
        """
        Calculate actual FPS based on elapsed time.
        
        Returns:
            float: Actual FPS
        """
        if self.frame_number == 0:
            return 0.0
        
        elapsed = time.perf_counter() - self.start_time
        if elapsed == 0:
            return 0.0
        
        return self.frame_number / elapsed
    
    def close(self):
        """Close the input source"""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
    
    def __enter__(self):
        """Context manager entry"""
        if not self.open():
            raise RuntimeError(f"Failed to open source: {self.config.source}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
    
    def get_source_info(self) -> dict:
        """
        Get information about the source.
        
        Returns:
            dict: Source information
        """
        if self.cap is None or not self.cap.isOpened():
            return {}
        
        return {
            'source': str(self.config.source),
            'source_type': self.config.source_type,
            'source_fps': self.source_fps,
            'target_fps': self.config.fps_target,
            'width': int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            'height': int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            'total_frames': int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)) if self.config.source_type == 'video' else -1,
        }


# Example usage
if __name__ == "__main__":
    # Example 1: Video file
    config = InputConfig.from_source("test.mp4", fps_target=10)
    handler = InputHandler(config)
    
    print(f"Source info: {handler.get_source_info()}")
    
    # Process frames
    for frame_info in handler.frames_generator():
        print(f"Frame {frame_info.frame_number}: {frame_info.frame.shape}, FPS: {handler.get_actual_fps():.2f}")
        
        # Display frame (optional)
        cv2.imshow("Frame", frame_info.frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cv2.destroyAllWindows()
