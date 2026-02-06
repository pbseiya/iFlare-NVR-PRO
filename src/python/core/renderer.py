"""
YOLOv11 Inference System - Python Core Modules
Renderer Module

Handles visualization of bounding boxes and labels.
"""

import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
from .postprocessor import Detection


@dataclass
class RenderConfig:
    """Configuration for rendering"""

    bbox_thickness: int = 2
    font_scale: float = 0.5
    font_thickness: int = 2
    show_confidence: bool = True
    show_fps: bool = True

    # Colors for each class (BGR format)
    class_colors: dict = None

    def __post_init__(self):
        if self.class_colors is None:
            # Default colors for fire detection classes
            self.class_colors = {
                0: (0, 0, 255),  # fire - red
                1: (128, 128, 128),  # smoke - gray
                2: (0, 165, 255),  # fire_smoke - orange
                3: (255, 255, 255),  # steam - white
            }


class Renderer:
    """
    Renderer for visualizing detection results.

    Features:
    - Draw bounding boxes
    - Draw labels with confidence
    - Draw FPS counter
    - Pipeline rendering (real-time)
    - Deferred rendering (post-processing)
    """

    def __init__(self, config: RenderConfig = RenderConfig()):
        self.config = config

    def draw_detection(self, image: np.ndarray, detection: Detection) -> np.ndarray:
        """
        Draw a single detection on the image.

        Args:
            image: Image to draw on (will be modified in-place)
            detection: Detection to draw

        Returns:
            Modified image
        """
        x1, y1, x2, y2 = detection.bbox
        color = self.config.class_colors.get(detection.class_id, (0, 255, 0))

        # Draw bounding box
        cv2.rectangle(image, (x1, y1), (x2, y2), color, self.config.bbox_thickness)

        # Prepare label
        if self.config.show_confidence:
            label = f"{detection.class_name}: {detection.confidence:.2f}"
        else:
            label = detection.class_name

        # Get label size
        (label_width, label_height), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, self.config.font_scale, self.config.font_thickness
        )

        # Draw label background
        cv2.rectangle(
            image,
            (x1, y1 - label_height - baseline - 5),
            (x1 + label_width, y1),
            color,
            -1,  # Filled
        )

        # Draw label text
        cv2.putText(
            image,
            label,
            (x1, y1 - baseline - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            self.config.font_scale,
            (255, 255, 255),  # White text
            self.config.font_thickness,
        )

        return image

    def draw_detections(self, image: np.ndarray, detections: List[Detection]) -> np.ndarray:
        """
        Draw multiple detections on the image.

        Args:
            image: Image to draw on (will be modified in-place)
            detections: List of detections to draw

        Returns:
            Modified image
        """
        for detection in detections:
            image = self.draw_detection(image, detection)

        return image

    def draw_fps(
        self, image: np.ndarray, fps: float, position: Tuple[int, int] = (10, 30)
    ) -> np.ndarray:
        """
        Draw FPS counter on the image.

        Args:
            image: Image to draw on
            fps: FPS value
            position: Position to draw (x, y)

        Returns:
            Modified image
        """
        if not self.config.show_fps:
            return image

        label = f"FPS: {fps:.1f}"

        # Draw with background
        (label_width, label_height), baseline = cv2.getTextSize(
            label,
            cv2.FONT_HERSHEY_SIMPLEX,
            self.config.font_scale * 1.5,
            self.config.font_thickness,
        )

        x, y = position

        # Draw background
        cv2.rectangle(
            image,
            (x - 5, y - label_height - baseline - 5),
            (x + label_width + 5, y + 5),
            (0, 0, 0),
            -1,
        )

        # Draw text
        cv2.putText(
            image,
            label,
            position,
            cv2.FONT_HERSHEY_SIMPLEX,
            self.config.font_scale * 1.5,
            (0, 255, 0),
            self.config.font_thickness,
        )

        return image

    def draw_info(
        self, image: np.ndarray, info: dict, position: Tuple[int, int] = (10, 60)
    ) -> np.ndarray:
        """
        Draw additional information on the image.

        Args:
            image: Image to draw on
            info: Dictionary of information to display
            position: Starting position (x, y)

        Returns:
            Modified image
        """
        x, y = position
        line_height = 25

        for key, value in info.items():
            label = f"{key}: {value}"
            cv2.putText(
                image,
                label,
                (x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                self.config.font_scale,
                (255, 255, 255),
                self.config.font_thickness,
            )
            y += line_height

        return image

    def render_frame(
        self,
        image: np.ndarray,
        detections: List[Detection],
        fps: Optional[float] = None,
        info: Optional[dict] = None,
    ) -> np.ndarray:
        """
        Complete rendering pipeline for a frame.

        Args:
            image: Input image
            detections: List of detections
            fps: FPS value (optional)
            info: Additional information to display (optional)

        Returns:
            Rendered image
        """
        # Make a copy to avoid modifying original
        rendered = image.copy()

        # Draw detections
        rendered = self.draw_detections(rendered, detections)

        # Draw FPS
        if fps is not None:
            rendered = self.draw_fps(rendered, fps)

        # Draw additional info
        if info is not None:
            rendered = self.draw_info(rendered, info)

        return rendered

    def create_detection_summary(
        self, detections: List[Detection], image_shape: Tuple[int, int]
    ) -> np.ndarray:
        """
        Create a summary visualization of detections.

        Args:
            detections: List of detections
            image_shape: Shape of the image (height, width)

        Returns:
            Summary image
        """
        height, width = image_shape[:2]
        summary = np.zeros((height, 300, 3), dtype=np.uint8)

        # Title
        cv2.putText(
            summary, "Detections", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2
        )

        # Count by class
        class_counts = {}
        for det in detections:
            class_counts[det.class_name] = class_counts.get(det.class_name, 0) + 1

        y = 60
        for class_name, count in class_counts.items():
            # Find class_id for color
            class_id = next(
                (
                    k
                    for k, v in self.config.class_colors.items()
                    if detections[0].class_name == class_name
                ),
                0,
            )
            color = self.config.class_colors.get(class_id, (255, 255, 255))

            # Draw colored box
            cv2.rectangle(summary, (10, y - 15), (30, y), color, -1)

            # Draw text
            cv2.putText(
                summary,
                f"{class_name}: {count}",
                (40, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
            )
            y += 25

        return summary


# Example usage
if __name__ == "__main__":
    # Create sample image
    image = np.zeros((480, 640, 3), dtype=np.uint8)

    # Create sample detections
    detections = [
        Detection(bbox=(100, 100, 200, 200), confidence=0.95, class_id=0, class_name="fire"),
        Detection(bbox=(300, 300, 400, 400), confidence=0.85, class_id=1, class_name="smoke"),
    ]

    # Create renderer
    renderer = Renderer()

    # Render
    rendered = renderer.render_frame(
        image, detections, fps=25.5, info={"Model": "YOLOv11", "Detections": len(detections)}
    )

    # Display
    cv2.imshow("Rendered", rendered)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
