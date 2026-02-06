"""
YOLOv11 Inference System - Python Core Modules
Inference Engine Module

Handles YOLOv11 model loading and inference using PyTorch.
"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, Union
from dataclasses import dataclass

try:
    from ultralytics import YOLO

    HAS_ULTRALYTICS = True
except ImportError:
    HAS_ULTRALYTICS = False
    print("Warning: ultralytics not installed. YOLOv11 inference will not work.")


@dataclass
class InferenceConfig:
    """Configuration for inference"""

    model_path: Union[str, Path]
    device: str = "cpu"  # 'cpu' or 'cuda'
    half: bool = False  # Use FP16
    verbose: bool = False


@dataclass
class InferenceResult:
    """Result of inference"""

    predictions: np.ndarray  # Raw predictions from model
    inference_time: float  # Inference time in milliseconds


class InferenceEngine:
    """
    Inference engine for YOLOv11 using PyTorch.

    Features:
    - CPU inference
    - Model loading and caching
    - Batch inference support
    - Performance timing
    """

    def __init__(self, config: InferenceConfig):
        self.config = config
        self.model: Optional[YOLO] = None
        self.device = torch.device(config.device)

    def load_model(self) -> bool:
        """
        Load YOLOv11 model.

        Returns:
            bool: True if successful, False otherwise
        """
        if not HAS_ULTRALYTICS:
            print("Error: ultralytics not installed")
            return False

        try:
            model_path = Path(self.config.model_path)
            if not model_path.exists():
                print(f"Error: Model not found: {model_path}")
                return False

            # Load model
            self.model = YOLO(str(model_path))

            # Move to device
            if self.config.device == "cuda" and torch.cuda.is_available():
                self.model.to("cuda")
            else:
                self.model.to("cpu")

            # Set to eval mode
            self.model.model.eval()

            if self.config.verbose:
                print(f"Model loaded: {model_path}")
                print(f"Device: {self.device}")

            return True

        except Exception as e:
            print(f"Error loading model: {e}")
            return False

    def infer(self, tensor: np.ndarray) -> InferenceResult:
        """
        Run inference on preprocessed tensor.

        Args:
            tensor: Preprocessed tensor (NCHW format, normalized)

        Returns:
            InferenceResult: Inference results
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        # Convert to torch tensor
        if isinstance(tensor, np.ndarray):
            tensor = torch.from_numpy(tensor).to(self.device)

        # Ensure float32
        if tensor.dtype != torch.float32:
            tensor = tensor.float()

        # Run inference with timing
        start_time = torch.cuda.Event(enable_timing=True) if self.config.device == "cuda" else None
        end_time = torch.cuda.Event(enable_timing=True) if self.config.device == "cuda" else None

        with torch.no_grad():
            if self.config.device == "cuda":
                start_time.record()
                predictions = self.model.model(tensor)
                end_time.record()
                torch.cuda.synchronize()
                inference_time = start_time.elapsed_time(end_time)
            else:
                import time

                start = time.perf_counter()
                predictions = self.model.model(tensor)
                end = time.perf_counter()
                inference_time = (end - start) * 1000  # Convert to ms

        # Convert predictions to numpy
        if isinstance(predictions, (list, tuple)):
            predictions = predictions[0]

        if isinstance(predictions, torch.Tensor):
            predictions = predictions.cpu().numpy()

        return InferenceResult(predictions=predictions, inference_time=inference_time)

    def infer_with_ultralytics(
        self, image: np.ndarray, conf: float = 0.25, iou: float = 0.45
    ) -> InferenceResult:
        """
        Run inference using Ultralytics high-level API.

        Args:
            image: Input image (BGR, HWC format)
            conf: Confidence threshold
            iou: IoU threshold for NMS

        Returns:
            InferenceResult: Inference results
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        import time

        start = time.perf_counter()

        # Run inference
        results = self.model.predict(
            image, conf=conf, iou=iou, verbose=self.config.verbose, device=self.config.device
        )

        end = time.perf_counter()
        inference_time = (end - start) * 1000

        # Extract predictions
        if results and len(results) > 0:
            result = results[0]
            # Convert to numpy array format: [x1, y1, x2, y2, conf, class]
            boxes = result.boxes
            if boxes is not None and len(boxes) > 0:
                predictions = (
                    torch.cat(
                        [
                            boxes.xyxy,  # x1, y1, x2, y2
                            boxes.conf.unsqueeze(1),  # confidence
                            boxes.cls.unsqueeze(1),  # class
                        ],
                        dim=1,
                    )
                    .cpu()
                    .numpy()
                )
            else:
                predictions = np.array([])
        else:
            predictions = np.array([])

        return InferenceResult(predictions=predictions, inference_time=inference_time)

    def get_model_info(self) -> dict:
        """
        Get model information.

        Returns:
            dict: Model information
        """
        if self.model is None:
            return {}

        return {
            "model_path": str(self.config.model_path),
            "device": str(self.device),
            "half": self.config.half,
            "num_classes": len(self.model.names) if hasattr(self.model, "names") else 0,
            "class_names": self.model.names if hasattr(self.model, "names") else [],
        }

    def __enter__(self):
        """Context manager entry"""
        if not self.load_model():
            raise RuntimeError("Failed to load model")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        # Cleanup
        if self.model is not None:
            del self.model
            self.model = None

        if self.config.device == "cuda":
            torch.cuda.empty_cache()


# Example usage
if __name__ == "__main__":
    # Example model path (update with actual path)
    model_path = Path.home() / "projects/flare_weights/weights/om_flare_yolov11.pt"

    if model_path.exists():
        # Create inference engine
        config = InferenceConfig(model_path=model_path, device="cpu", verbose=True)
        engine = InferenceEngine(config)

        # Load model
        if engine.load_model():
            print(f"Model info: {engine.get_model_info()}")

            # Create dummy input
            dummy_input = np.random.randn(1, 3, 640, 640).astype(np.float32)

            # Run inference
            result = engine.infer(dummy_input)
            print(f"Inference time: {result.inference_time:.2f} ms")
            print(f"Predictions shape: {result.predictions.shape}")
    else:
        print(f"Model not found: {model_path}")
