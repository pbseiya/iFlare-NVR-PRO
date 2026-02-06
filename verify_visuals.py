import cv2
import numpy as np
import argparse
import time
import sys


def letterbox(img, new_shape=(640, 640), color=(114, 114, 114)):
    shape = img.shape[:2]  # current shape [height, width]
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    r = min(r, 1.0)

    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    # dw, dh = np.mod(dw, 32), np.mod(dh, 32) # disable for fixed size

    dw /= 2
    dh /= 2

    if shape[::-1] != new_unpad:
        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, r, (dw, dh)


def run_openvino(args, cap):
    from openvino.runtime import Core

    print("--- OpenVINO Execution ---")
    core = Core()
    model = core.read_model(args.model)
    compiled_model = core.compile_model(model, "CPU")
    infer_request = compiled_model.create_infer_request()

    classes = ["fire", "smoke", "fire_smoke", "steam"]
    colors = [(0, 0, 255), (200, 200, 200), (0, 165, 255), (255, 255, 255)]

    run_loop(args, cap, lambda frame: infer_openvino(frame, infer_request, classes, colors))


def infer_openvino(frame, infer_request, classes, colors):
    img, ratio, (dw, dh) = letterbox(frame, new_shape=(640, 640))
    input_data = img.transpose((2, 0, 1))[::-1]
    input_data = np.ascontiguousarray(input_data)
    input_data = input_data.astype(np.float32) / 255.0
    input_data = np.expand_dims(input_data, 0)

    results = infer_request.infer(input_data)
    output = list(results.values())[0]
    output = np.transpose(output, (0, 2, 1))
    pred = output[0]

    boxes = []
    confidences = []
    class_ids = []

    for row in pred:
        bbox = row[:4]
        scores = row[4:]
        class_id = np.argmax(scores)
        confidence = scores[class_id]

        if confidence > 0.25:
            cx, cy, bw, bh = bbox
            cx = (cx - dw) / ratio
            cy = (cy - dh) / ratio
            bw /= ratio
            bh /= ratio

            left = int(cx - bw / 2)
            top = int(cy - bh / 2)
            width = int(bw)
            height = int(bh)

            boxes.append([left, top, width, height])
            confidences.append(float(confidence))
            class_ids.append(int(class_id))

    indices = cv2.dnn.NMSBoxes(boxes, confidences, 0.25, 0.45)

    # Draw
    if len(indices) > 0:
        for i in indices.flatten():
            box = boxes[i]
            x, y, w, h = box
            cls_id = class_ids[i]
            conf = confidences[i]
            label = f"{classes[cls_id] if cls_id < len(classes) else cls_id} {conf:.2f}"
            color = colors[cls_id] if cls_id < len(classes) else (0, 255, 0)
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            cv2.putText(frame, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    return frame


def run_pytorch(args, cap):
    from ultralytics import YOLO

    print("--- PyTorch (Ultralytics) Execution ---")
    model = YOLO(args.model)

    run_loop(args, cap, lambda frame: infer_pytorch(frame, model))


def infer_pytorch(frame, model):
    results = model(frame, verbose=False, conf=0.25)
    return results[0].plot()


def run_loop(args, cap, infer_func):
    start_time = time.time()
    last_frame_time = time.time()
    frame_interval = 1.0 / args.fps if args.fps > 0 else 0
    frame_count = 0

    while (time.time() - start_time) < args.duration:
        now = time.time()
        if args.fps > 0 and (now - last_frame_time) < frame_interval:
            time.sleep(0.001)
            continue

        last_frame_time = now
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        annotated_frame = infer_func(frame)

        # Show
        cv2.imshow("Python Verification", annotated_frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, required=True)
    parser.add_argument("--source", type=str, required=True)
    parser.add_argument("--fps", type=float, default=10.0)
    parser.add_argument("--duration", type=float, default=10.0)
    parser.add_argument("--backend", type=str, choices=["openvino", "pytorch"], required=True)
    args = parser.parse_args()

    try:
        source = int(args.source)
    except ValueError:
        source = args.source

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"Failed to open {source}")
        return

    if args.backend == "openvino":
        run_openvino(args, cap)
    else:
        run_pytorch(args, cap)

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
