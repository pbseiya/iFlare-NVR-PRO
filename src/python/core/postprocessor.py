"""
YOLOv11 Inference System - Python Core Modules
Post-processor Module

Handles NMS, coordinate scaling, and confidence filtering.
"""

import cv2
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class PostprocessConfig:
    """Configuration for post-processing"""

    conf_threshold: float = 0.25
    iou_threshold: float = 0.45
    max_detections: int = 300


@dataclass
class Detection:
    """Single detection result"""

    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    confidence: float
    class_id: int
    class_name: str


@dataclass
class PostprocessResult:
    """Result of post-processing"""

    detections: List[Detection]
    num_detections: int


class Postprocessor:
    """
    Post-processor for YOLOv11 inference results.

    Features:
    - Non-Maximum Suppression (NMS)
    - Coordinate scaling to original image size
    - Confidence filtering
    - Class name mapping
    """

    # Default class names for fire detection
    DEFAULT_CLASS_NAMES = {0: "fire", 1: "smoke", 2: "fire_smoke", 3: "steam"}

    def __init__(
        self, config: PostprocessConfig = PostprocessConfig(), class_names: Optional[dict] = None
    ):
        self.config = config
        self.class_names = class_names or self.DEFAULT_CLASS_NAMES

    def xywh2xyxy(self, x: np.ndarray) -> np.ndarray:
        """
        Convert bounding boxes from [x_center, y_center, width, height] to [x1, y1, x2, y2].

        Args:
            x: Bounding boxes in xywh format

        Returns:
            Bounding boxes in xyxy format
        """
        y = np.copy(x)
        y[..., 0] = x[..., 0] - x[..., 2] / 2  # x1
        y[..., 1] = x[..., 1] - x[..., 3] / 2  # y1
        y[..., 2] = x[..., 0] + x[..., 2] / 2  # x2
        y[..., 3] = x[..., 1] + x[..., 3] / 2  # y2
        return y

    def nms(
        self,
        predictions: np.ndarray,
        conf_threshold: Optional[float] = None,
        iou_threshold: Optional[float] = None,
    ) -> np.ndarray:
        """
        Apply Non-Maximum Suppression.

        Args:
            predictions: Raw predictions from model
            conf_threshold: Confidence threshold (overrides config)
            iou_threshold: IoU threshold (overrides config)

        Returns:
            Filtered detections [x1, y1, x2, y2, conf, class]
        """
        conf_threshold = conf_threshold or self.config.conf_threshold
        iou_threshold = iou_threshold or self.config.iou_threshold

        # Handle different prediction formats
        if isinstance(predictions, (list, tuple)):
            predictions = predictions[0]

        # Ensure predictions is 2D or 3D
        if predictions.ndim == 3:
            # Batch dimension exists, take first batch
            predictions = predictions[0]

        if predictions.ndim != 2:
            return np.array([])

        # Extract boxes and scores
        if predictions.shape[1] >= 6:
            # Format: [x1, y1, x2, y2, conf, class] or similar
            boxes = predictions[:, :4]
            confidences = predictions[:, 4]
            class_ids = (
                predictions[:, 5].astype(int)
                if predictions.shape[1] > 5
                else np.zeros(len(predictions), dtype=int)
            )
        elif predictions.shape[1] >= 5:
            # Format: [x_center, y_center, w, h, conf, class1, class2, ...]
            # Convert xywh to xyxy
            boxes = self.xywh2xyxy(predictions[:, :4])

            # Get confidence and class
            if predictions.shape[1] > 5:
                # Multiple class scores
                class_scores = predictions[:, 5:]
                class_ids = class_scores.argmax(axis=1)
                confidences = predictions[:, 4] * class_scores.max(axis=1)
            else:
                confidences = predictions[:, 4]
                class_ids = np.zeros(len(predictions), dtype=int)
        else:
            return np.array([])

        # Filter by confidence
        mask = confidences > conf_threshold
        boxes = boxes[mask]
        confidences = confidences[mask]
        class_ids = class_ids[mask]

        if len(boxes) == 0:
            return np.array([])

        # Apply NMS per class
        keep_indices = []
        for class_id in np.unique(class_ids):
            class_mask = class_ids == class_id
            class_boxes = boxes[class_mask]
            class_confidences = confidences[class_mask]
            class_indices = np.where(class_mask)[0]

            # Convert to format for cv2.dnn.NMSBoxes
            x1, y1, x2, y2 = class_boxes.T
            w, h = x2 - x1, y2 - y1
            rects = np.stack([x1, y1, w, h], axis=1)

            # Apply NMS
            indices = cv2.dnn.NMSBoxes(
                rects.tolist(), class_confidences.tolist(), conf_threshold, iou_threshold
            )

            if len(indices) > 0:
                keep_indices.extend(class_indices[indices.flatten()])

        if len(keep_indices) == 0:
            return np.array([])

        # Combine results
        keep_indices = np.array(keep_indices)
        detections = np.concatenate(
            [boxes[keep_indices], confidences[keep_indices, None], class_ids[keep_indices, None]],
            axis=1,
        )

        # Limit max detections
        if len(detections) > self.config.max_detections:
            # Sort by confidence and keep top N
            sorted_indices = np.argsort(detections[:, 4])[::-1]
            detections = detections[sorted_indices[: self.config.max_detections]]

        return detections

    def scale_coords(
        self,
        coords: np.ndarray,
        input_shape: Tuple[int, int],
        original_shape: Tuple[int, int],
        padding: Tuple[float, float] = (0, 0),
    ) -> np.ndarray:
        """
        Scale coordinates from input size to original image size.

        Args:
            coords: Coordinates to scale [x1, y1, x2, y2]
            input_shape: Input image shape (height, width)
            original_shape: Original image shape (height, width)
            padding: Padding applied (pad_x, pad_y)

        Returns:
            Scaled coordinates
        """
        # Calculate scale
        gain = min(input_shape[0] / original_shape[0], input_shape[1] / original_shape[1])
        pad_x, pad_y = padding

        # Remove padding
        coords[:, [0, 2]] -= pad_x  # x coords
        coords[:, [1, 3]] -= pad_y  # y coords

        # Scale to original size
        coords[:, :4] /= gain

        # Clip to image bounds
        coords[:, [0, 2]] = coords[:, [0, 2]].clip(0, original_shape[1])  # x coords
        coords[:, [1, 3]] = coords[:, [1, 3]].clip(0, original_shape[0])  # y coords

        return coords

    def postprocess(
        self,
        predictions: np.ndarray,
        input_shape: Tuple[int, int],
        original_shape: Tuple[int, int],
        padding: Tuple[float, float] = (0, 0),
    ) -> PostprocessResult:
        """
        Complete post-processing pipeline.

        Args:
            predictions: Raw predictions from model
            input_shape: Input image shape (height, width)
            original_shape: Original image shape (height, width)
            padding: Padding applied (pad_x, pad_y)

        Returns:
            PostprocessResult: Processed detections
        """
        # Apply NMS
        detections = self.nms(predictions)

        if len(detections) == 0:
            return PostprocessResult(detections=[], num_detections=0)

        # Scale coordinates
        detections = self.scale_coords(detections.copy(), input_shape, original_shape, padding)

        # Convert to Detection objects
        detection_objects = []
        for det in detections:
            x1, y1, x2, y2, conf, cls = det
            class_id = int(cls)

            detection_objects.append(
                Detection(
                    bbox=(int(x1), int(y1), int(x2), int(y2)),
                    confidence=float(conf),
                    class_id=class_id,
                    class_name=self.class_names.get(class_id, f"class_{class_id}"),
                )
            )

        return PostprocessResult(
            detections=detection_objects, num_detections=len(detection_objects)
        )


# Example usage
if __name__ == "__main__":
    # Create sample predictions (format: [x1, y1, x2, y2, conf, class])
    predictions = np.array(
        [
            [100, 100, 200, 200, 0.9, 0],  # fire
            [150, 150, 250, 250, 0.8, 0],  # fire (overlapping, should be filtered by NMS)
            [300, 300, 400, 400, 0.7, 1],  # smoke
        ]
    )

    # Create postprocessor
    postprocessor = Postprocessor()

    # Process
    result = postprocessor.postprocess(
        predictions, input_shape=(640, 640), original_shape=(480, 640), padding=(0, 80)
    )

    print(f"Number of detections: {result.num_detections}")
    for det in result.detections:
        print(f"  {det.class_name}: {det.confidence:.2f} @ {det.bbox}")
