import cv2
import numpy as np
from PIL import Image, ImageSequence
import sys


def convert_webp_to_mp4(webp_path, output_path, fps=10):
    try:
        # Open the WebP image
        print(f"Opening {webp_path}...")
        im = Image.open(webp_path)

        if not getattr(im, "is_animated", False):
            print("Image is not animated.")
            return

        print(f"Frame count: {im.n_frames}")

        # Get dimensions from first frame
        width, height = im.size
        print(f"Video dimensions: {width}x{height}")

        # Initialize VideoWriter
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")  # Be sure to use lower case
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        frame_count = 0
        for frame in ImageSequence.Iterator(im):
            # Convert PIL image to OpenCV format (RGB -> BGR)
            frame = frame.convert("RGB")
            opencv_image = np.array(frame)
            opencv_image = cv2.cvtColor(opencv_image, cv2.COLOR_RGB2BGR)

            out.write(opencv_image)
            frame_count += 1
            if frame_count % 50 == 0:
                print(f"Processed {frame_count} frames...")

        out.release()
        print(f"Successfully saved {output_path}")

    except Exception as e:
        print(f"Error converting video: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 convert_webp_to_mp4.py <input_webp> <output_mp4>")
        sys.exit(1)

    convert_webp_to_mp4(sys.argv[1], sys.argv[2])
