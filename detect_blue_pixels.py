import cv2
import numpy as np


def check_blue_boxes(image_path):
    img = cv2.imread(image_path)
    if img is None:
        print(f"Failed to load {image_path}")
        return

    # Convert to HSV for better color segmentation
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Define Blue range (OpenCV HSV: H=0-180, S=0-255, V=0-255)
    # Blue is around 120. (110-130)
    # Cyan is around 90. (80-100)

    # Check for Blue
    lower_blue = np.array([100, 150, 50])
    upper_blue = np.array([140, 255, 255])
    mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
    blue_pixels = cv2.countNonZero(mask_blue)

    # Check for Cyan (06b6d4 is roughly Cyan/Teal)
    lower_cyan = np.array([80, 150, 50])
    upper_cyan = np.array([100, 255, 255])
    mask_cyan = cv2.inRange(hsv, lower_cyan, upper_cyan)
    cyan_pixels = cv2.countNonZero(mask_cyan)

    # Check for Magenta (Deep Pink/Purple) - My Debug Color
    # Magenta is around 150
    lower_magenta = np.array([140, 150, 50])
    upper_magenta = np.array([170, 255, 255])
    mask_magenta = cv2.inRange(hsv, lower_magenta, upper_magenta)
    magenta_pixels = cv2.countNonZero(mask_magenta)

    print(f"Blue pixels: {blue_pixels}")
    print(f"Cyan pixels: {cyan_pixels}")
    print(f"Magenta pixels: {magenta_pixels}")

    total_pixels = img.shape[0] * img.shape[1]
    print(f"Total pixels: {total_pixels}")

    if blue_pixels > 500:
        print("DETECTED: Significant BLUE found.")
    if cyan_pixels > 500:
        print("DETECTED: Significant CYAN found.")
    if magenta_pixels > 500:
        print("DETECTED: Significant MAGENTA found.")


if __name__ == "__main__":
    check_blue_boxes("debug_frame_97.jpg")
