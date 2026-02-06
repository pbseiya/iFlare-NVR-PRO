"""
YOLOv11 Inference System - Python Core Modules
Pre-processor Module

Handles image preprocessing for YOLOv11 inference.
"""

import cv2
import numpy as np
from typing import Tuple, Optional
from dataclasses import dataclass


@dataclass
class PreprocessConfig:
    """Configuration for preprocessing"""

    input_size: Tuple[int, int] = (640, 640)  # (height, width)
    normalize: bool = True
    bgr_to_rgb: bool = True
    hwc_to_chw: bool = True
    add_batch_dim: bool = True


@dataclass
class PreprocessResult:
    """Result of preprocessing"""

    tensor: np.ndarray  # Preprocessed tensor
    scale: Tuple[float, float]  # (scale_x, scale_y)
    padding: Tuple[float, float]  # (pad_x, pad_y)
    original_shape: Tuple[int, int]  # (height, width)


class Preprocessor:
    """
    Preprocessor for YOLOv11 inference.

    Features:
    - Letterbox resizing (maintains aspect ratio)
    - BGR to RGB conversion
    - Normalization (0-255 -> 0-1)
    - HWC to CHW format conversion
    - Batch dimension addition
    """

    def __init__(self, config: PreprocessConfig = PreprocessConfig()):
        self.config = config

    def letterbox(
        self,
        image: np.ndarray,
        new_shape: Tuple[int, int],
        color: Tuple[int, int, int] = (114, 114, 114),
        auto: bool = False,
        scale_fill: bool = False,
        scaleup: bool = True,
    ) -> Tuple[np.ndarray, Tuple[float, float], Tuple[float, float]]:
        """
        Resize and pad image while maintaining aspect ratio.

        Args:
            image: Input image (HWC format)
            new_shape: Target shape (height, width)
            color: Padding color
            auto: Minimum rectangle
            scale_fill: Stretch to fill
            scaleup: Allow scaling up

        Returns:
            Tuple of (resized_image, scale, padding)
        """
        shape = image.shape[:2]  # current shape [height, width]

        if isinstance(new_shape, int):
            new_shape = (new_shape, new_shape)

        # Scale ratio (new / old)
        r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
        if not scaleup:  # only scale down, do not scale up (for better test mAP)
            r = min(r, 1.0)

        # Compute padding
        new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
        dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]  # wh padding

        if auto:  # minimum rectangle
            dw, dh = np.mod(dw, 32), np.mod(dh, 32)  # wh padding
        elif scale_fill:  # stretch
            dw, dh = 0.0, 0.0
            new_unpad = (new_shape[1], new_shape[0])
            r = new_shape[1] / shape[1], new_shape[0] / shape[0]  # width, height ratios

        dw /= 2  # divide padding into 2 sides
        dh /= 2

        if shape[::-1] != new_unpad:  # resize
            image = cv2.resize(image, new_unpad, interpolation=cv2.INTER_LINEAR)

        top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
        left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
        image = cv2.copyMakeBorder(
            image, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color
        )

        return image, (r, r), (dw, dh)

    def preprocess(self, image: np.ndarray) -> PreprocessResult:
        """
        Preprocess image for inference.

        Args:
            image: Input image (BGR, HWC format)

        Returns:
            PreprocessResult: Preprocessed tensor and metadata
        """
        original_shape = image.shape[:2]  # (height, width)

        # 1. Letterbox resize
        img, scale, padding = self.letterbox(image, new_shape=self.config.input_size, auto=False)

        # 2. BGR to RGB
        if self.config.bgr_to_rgb:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # 3. HWC to CHW
        if self.config.hwc_to_chw:
            img = img.transpose((2, 0, 1))  # HWC to CHW

        # 4. Normalize
        if self.config.normalize:
            img = img.astype(np.float32) / 255.0
        else:
            img = img.astype(np.float32)

        # 5. Add batch dimension
        if self.config.add_batch_dim:
            img = np.expand_dims(img, axis=0)  # Add batch dimension

        # Ensure contiguous array
        img = np.ascontiguousarray(img)

        return PreprocessResult(
            tensor=img, scale=scale, padding=padding, original_shape=original_shape
        )

    def batch_preprocess(self, images: list[np.ndarray]) -> PreprocessResult:
        """
        Preprocess multiple images for batch inference.

        Args:
            images: List of input images

        Returns:
            PreprocessResult: Batched preprocessed tensor
        """
        if not images:
            raise ValueError("Empty image list")

        # Preprocess each image
        results = [self.preprocess(img) for img in images]

        # Stack tensors
        if self.config.add_batch_dim:
            # Remove individual batch dims and stack
            tensors = [r.tensor.squeeze(0) for r in results]
            batched_tensor = np.stack(tensors, axis=0)
        else:
            batched_tensor = np.stack([r.tensor for r in results], axis=0)

        # Return first result's metadata (assuming all images have same original shape)
        return PreprocessResult(
            tensor=batched_tensor,
            scale=results[0].scale,
            padding=results[0].padding,
            original_shape=results[0].original_shape,
        )


# Example usage
if __name__ == "__main__":
    # Create sample image
    image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

    # Create preprocessor
    preprocessor = Preprocessor()

    # Preprocess
    result = preprocessor.preprocess(image)

    print(f"Original shape: {result.original_shape}")
    print(f"Preprocessed tensor shape: {result.tensor.shape}")
    print(f"Scale: {result.scale}")
    print(f"Padding: {result.padding}")
    print(f"Tensor dtype: {result.tensor.dtype}")
    print(f"Tensor range: [{result.tensor.min():.3f}, {result.tensor.max():.3f}]")
