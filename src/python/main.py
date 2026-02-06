"""
YOLOv11 Inference System - Main Inference Script
Complete inference pipeline integrating all core modules.
"""

import argparse
import asyncio
import time
from pathlib import Path
from datetime import datetime
from typing import Optional
import cv2
import numpy as np

from core import (
    InputHandler,
    InputConfig,
    Preprocessor,
    PreprocessConfig,
    InferenceEngine,
    InferenceConfig,
    Postprocessor,
    PostprocessConfig,
    Renderer,
    RenderConfig,
    DataLogger,
    LoggerConfig,
    PerformanceMetrics,
)


class InferencePipeline:
    """
    Complete inference pipeline.

    Integrates all core modules:
    - Input Handler
    - Preprocessor
    - Inference Engine
    - Postprocessor
    - Renderer
    - Data Logger
    """

    def __init__(
        self,
        model_path: str,
        source: str,
        fps_target: int = 10,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        render_mode: str = "pipeline",
        save_video: bool = False,
        video_output_path: Optional[str] = None,
        database_url: Optional[str] = None,
        display: bool = True,
    ):
        # Configurations
        self.input_config = InputConfig.from_source(source, fps_target)
        self.preprocess_config = PreprocessConfig()
        self.inference_config = InferenceConfig(model_path=model_path, device="cpu")
        self.postprocess_config = PostprocessConfig(
            conf_threshold=conf_threshold, iou_threshold=iou_threshold
        )
        self.render_config = RenderConfig()

        # Modules
        self.input_handler = InputHandler(self.input_config)
        self.preprocessor = Preprocessor(self.preprocess_config)
        self.inference_engine = InferenceEngine(self.inference_config)
        self.postprocessor = Postprocessor(self.postprocess_config)
        self.renderer = Renderer(self.render_config)

        # Data logger (optional)
        self.data_logger: Optional[DataLogger] = None
        if database_url:
            logger_config = LoggerConfig(database_url=database_url)
            self.data_logger = DataLogger(logger_config)

        # Settings
        self.render_mode = render_mode
        self.save_video = save_video
        self.video_output_path = video_output_path
        self.display = display

        # State
        self.session_id: Optional[int] = None
        self.video_writer: Optional[cv2.VideoWriter] = None
        self.running = False

        # FPS tracking
        self.fps_start_time = time.perf_counter()
        self.fps_frame_count = 0
        self.current_fps = 0.0

    async def initialize(self) -> bool:
        """Initialize all modules"""
        # Load inference model
        if not self.inference_engine.load_model():
            print("Failed to load model")
            return False

        # Connect to database
        if self.data_logger:
            if not await self.data_logger.connect():
                print("Failed to connect to database")
                return False

            # Create session
            self.session_id = await self.data_logger.create_session(
                model_name=Path(self.inference_config.model_path).stem,
                language="python",
                source_type=self.input_config.source_type,
                source_path=str(self.input_config.source),
                fps_target=self.input_config.fps_target,
                conf_threshold=self.postprocess_config.conf_threshold,
                iou_threshold=self.postprocess_config.iou_threshold,
                save_video=self.save_video,
                video_output_path=self.video_output_path,
                render_mode=self.render_mode,
            )

            # Start auto-flush
            self.data_logger.start_auto_flush()

            print(f"Created session ID: {self.session_id}")

        return True

    async def cleanup(self):
        """Cleanup resources"""
        # Stop video writer
        if self.video_writer:
            self.video_writer.release()

        # End session and disconnect database
        if self.data_logger and self.session_id:
            await self.data_logger.end_session(self.session_id, status="completed")
            await self.data_logger.disconnect()

        # Close windows
        if self.display:
            cv2.destroyAllWindows()

    def update_fps(self):
        """Update FPS counter"""
        self.fps_frame_count += 1
        elapsed = time.perf_counter() - self.fps_start_time

        if elapsed >= 1.0:
            self.current_fps = self.fps_frame_count / elapsed
            self.fps_start_time = time.perf_counter()
            self.fps_frame_count = 0

    async def process_frame(self, frame_info) -> Optional[np.ndarray]:
        """
        Process a single frame through the pipeline.

        Returns:
            Rendered frame (if render_mode == 'pipeline')
        """
        frame = frame_info.frame
        frame_number = frame_info.frame_number
        timestamp = datetime.fromtimestamp(frame_info.timestamp)

        # Timing
        t_start = time.perf_counter()

        # 1. Preprocess
        t0 = time.perf_counter()
        preprocess_result = self.preprocessor.preprocess(frame)
        t1 = time.perf_counter()
        preprocess_ms = (t1 - t0) * 1000

        # 2. Inference
        t0 = time.perf_counter()
        inference_result = self.inference_engine.infer(preprocess_result.tensor)
        t1 = time.perf_counter()
        inference_ms = inference_result.inference_time

        # 3. Postprocess
        t0 = time.perf_counter()
        postprocess_result = self.postprocessor.postprocess(
            inference_result.predictions,
            input_shape=self.preprocess_config.input_size,
            original_shape=preprocess_result.original_shape,
            padding=preprocess_result.padding,
        )
        t1 = time.perf_counter()
        postprocess_ms = (t1 - t0) * 1000

        # 4. Render (if pipeline mode)
        rendered_frame = None
        t0 = time.perf_counter()
        if self.render_mode == "pipeline":
            rendered_frame = self.renderer.render_frame(
                frame,
                postprocess_result.detections,
                fps=self.current_fps,
                info={"Frame": frame_number, "Detections": postprocess_result.num_detections},
            )
        t1 = time.perf_counter()
        render_ms = (t1 - t0) * 1000

        # Total time
        t_end = time.perf_counter()
        total_ms = (t_end - t_start) * 1000

        # 5. Log data
        if self.data_logger and self.session_id:
            # Log detections
            self.data_logger.log_detections(
                self.session_id, frame_number, timestamp, postprocess_result.detections
            )

            # Log metrics
            metrics = PerformanceMetrics(
                frame_number=frame_number,
                timestamp=timestamp,
                preprocess_ms=preprocess_ms,
                inference_ms=inference_ms,
                postprocess_ms=postprocess_ms,
                render_ms=render_ms,
                total_ms=total_ms,
            )
            self.data_logger.log_metrics(self.session_id, metrics)

        # Update FPS
        self.update_fps()

        # Print progress
        if frame_number % 10 == 0:
            print(
                f"Frame {frame_number}: "
                f"Pre={preprocess_ms:.1f}ms, "
                f"Inf={inference_ms:.1f}ms, "
                f"Post={postprocess_ms:.1f}ms, "
                f"Render={render_ms:.1f}ms, "
                f"Total={total_ms:.1f}ms, "
                f"FPS={self.current_fps:.1f}, "
                f"Detections={postprocess_result.num_detections}"
            )

        return rendered_frame

    async def run(self):
        """Run the inference pipeline"""
        self.running = True

        try:
            # Initialize
            if not await self.initialize():
                return

            # Get source info
            source_info = self.input_handler.get_source_info()
            print(f"\nSource Info:")
            for key, value in source_info.items():
                print(f"  {key}: {value}")
            print()

            # Setup video writer if needed
            if self.save_video and self.video_output_path:
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                fps = self.input_config.fps_target
                width = source_info.get("width", 640)
                height = source_info.get("height", 480)

                self.video_writer = cv2.VideoWriter(
                    self.video_output_path, fourcc, fps, (width, height)
                )
                print(f"Saving video to: {self.video_output_path}")

            # Process frames
            for frame_info in self.input_handler.frames_generator():
                if not self.running:
                    break

                # Process frame
                rendered_frame = await self.process_frame(frame_info)

                # Display
                if self.display and rendered_frame is not None:
                    cv2.imshow("YOLOv11 Inference", rendered_frame)

                    # Check for quit
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord("q"):
                        print("\nStopping inference...")
                        break

                # Save video
                if self.video_writer and rendered_frame is not None:
                    self.video_writer.write(rendered_frame)

        finally:
            # Cleanup
            await self.cleanup()
            print("\nInference completed")

    def stop(self):
        """Stop the pipeline"""
        self.running = False


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="YOLOv11 Inference System")

    # Required arguments
    parser.add_argument("--model", type=str, required=True, help="Path to YOLOv11 model (.pt file)")
    parser.add_argument(
        "--source", type=str, required=True, help="Video file path, RTSP URL, or webcam index"
    )

    # Optional arguments
    parser.add_argument(
        "--fps", type=int, default=10, help="Target FPS for inference (default: 10)"
    )
    parser.add_argument(
        "--conf", type=float, default=0.25, help="Confidence threshold (default: 0.25)"
    )
    parser.add_argument(
        "--iou", type=float, default=0.45, help="IoU threshold for NMS (default: 0.45)"
    )
    parser.add_argument(
        "--render-mode",
        type=str,
        default="pipeline",
        choices=["pipeline", "deferred"],
        help="Rendering mode (default: pipeline)",
    )
    parser.add_argument("--save-video", action="store_true", help="Save output video")
    parser.add_argument(
        "--output", type=str, default="output.mp4", help="Output video path (default: output.mp4)"
    )
    parser.add_argument(
        "--database-url",
        type=str,
        default="postgresql://admin:password@localhost:5432/yolov11_inference",
        help="PostgreSQL database URL",
    )
    parser.add_argument("--no-display", action="store_true", help="Disable display window")
    parser.add_argument("--no-database", action="store_true", help="Disable database logging")

    args = parser.parse_args()

    # Create pipeline
    pipeline = InferencePipeline(
        model_path=args.model,
        source=args.source,
        fps_target=args.fps,
        conf_threshold=args.conf,
        iou_threshold=args.iou,
        render_mode=args.render_mode,
        save_video=args.save_video,
        video_output_path=args.output if args.save_video else None,
        database_url=None if args.no_database else args.database_url,
        display=not args.no_display,
    )

    # Run pipeline
    try:
        await pipeline.run()
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        pipeline.stop()


if __name__ == "__main__":
    asyncio.run(main())
