
#!/bin/bash

# Define Models
MODEL_OV="models/yolov11/om_flare_yolov11.xml"
MODEL_PT="models/om_flare_yolov11.pt"
SOURCE="/home/pongsak/projects/iflare4sale/original/media/DSCF0008.AVI"
DURATION="10s"

echo "=================================================="
echo "Starting Visual Verification (4 STEPS / 10s each)"
echo "Source: $SOURCE"
echo "=================================================="

# 1. Python PyTorch
echo ""
echo "[1/4] Running Python + PyTorch (Ultralytics)..."
echo "Model: $MODEL_PT"
if [ -f "$MODEL_PT" ]; then
    uv run python verify_visuals.py --model "$MODEL_PT" --source "$SOURCE" --duration 10 --backend pytorch
else
    echo "Error: PyTorch model not found at $MODEL_PT"
fi
echo "PyTorch done."
sleep 1

# 2. Python OpenVINO
echo ""
echo "[2/4] Running Python + OpenVINO..."
echo "Model: $MODEL_OV"
uv run python verify_visuals.py --model "$MODEL_OV" --source "$SOURCE" --duration 10 --backend openvino
echo "Python OpenVINO done."
sleep 1

# 3. C++
echo ""
echo "[3/4] Running C++ (OpenVINO)..."
timeout --preserve-status "$DURATION" ./src/cpp/build/yolov11_inference_cpp --model "$MODEL_OV" --source "$SOURCE"
echo "C++ done."
sleep 1

# 4. Rust
echo ""
echo "[4/4] Running Rust (OpenVINO)..."
timeout --preserve-status "$DURATION" ./src/rust/target/release/yolov11_inference_rust --model "$MODEL_OV" --source "$SOURCE"
echo "Rust done."

echo ""
echo "=================================================="
echo "Verification Complete!"
echo "=================================================="
