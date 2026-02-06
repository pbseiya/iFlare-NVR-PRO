
#include "inference_engine.hpp"
#include <iostream>
#include <algorithm>

namespace yolov11 {

InferenceEngine::InferenceEngine() {
    // Constructor
}

InferenceEngine::~InferenceEngine() {
    // Destructor
}

void InferenceEngine::load_model(const std::string& model_path, const std::string& device_name) {
    try {
        std::cout << "Loading model: " << model_path << " on " << device_name << std::endl;
        
        // 1. Read Model
        model = core.read_model(model_path);
        
        // 2. Preprocessing (Basic setup via OpenVINO PPP could be done here, but we'll do manual for clarity/control)
        // Check input/output shapes
        if (model->inputs().size() != 1) {
            throw std::runtime_error("Model must have exactly one input.");
        }
        
        input_name = model->input().get_any_name();
        input_shape = model->input().get_shape();
        
        // Handle dynamic shapes if necessary (assuming fixed for standard YOLO export, e.g. [1,3,640,640])
        // If dynamic, we might need to reshape or stick to a target size.
        
        // 3. Compile Model
        compiled_model = core.compile_model(model, device_name);
        infer_request = compiled_model.create_infer_request();
        
        std::cout << "Model loaded successfully." << std::endl;
        std::cout << "Input Shape: " << input_shape << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Error loading model: " << e.what() << std::endl;
        throw;
    }
}

cv::Mat InferenceEngine::preprocess(const cv::Mat& frame) {
    // 1. Resize to model input size (e.g., 640x640)
    // Assuming input_shape is [1, 3, H, W]
    int w = input_shape[3];
    int h = input_shape[2];
    
    cv::Mat resized;
    // Use letterbox if strict aspect ratio is needed, but simple resize for MVP if ok.
    // YOLOv11 usually expects letterbox (pad to square) for best accuracy.
    // Let's implement basic resize for now, improve to letterbox if requested.
    cv::resize(frame, resized, cv::Size(w, h));
    
    // 2. Convert Color (BGR -> RGB)
    cv::cvtColor(resized, resized, cv::COLOR_BGR2RGB);
    
    return resized;
}

std::vector<Detection> InferenceEngine::infer(const cv::Mat& frame, float conf_threshold, float iou_threshold) {
    // Basic Timing
    auto start = std::chrono::high_resolution_clock::now();

    // 1. Preprocess
    cv::Mat resized_img = preprocess(frame);
    
    // 2. Set Input Tensor
    // OpenVINO expects NCHW, OpenCV is NHWC (HWC actually).
    // We need to permute.
    // Or we can wrap existing Mat if we used PPP.
    
    // Get input tensor from request
    ov::Tensor input_tensor = infer_request.get_input_tensor();
    
    // Copy data and change layout (HWC -> NCHW)
    // shape: [1, 3, 640, 640]
    float* input_data = input_tensor.data<float>();
    
    int H = input_shape[2];
    int W = input_shape[3];
    int C = input_shape[1];
    
    // Normalize 0-255 -> 0.0-1.0
    for (int h = 0; h < H; h++) {
        for (int w = 0; w < W; w++) {
            cv::Vec3b pixel = resized_img.at<cv::Vec3b>(h, w);
            input_data[0*H*W + h*W + w] = pixel[0] / 255.0f; // R
            input_data[1*H*W + h*W + w] = pixel[1] / 255.0f; // G
            input_data[2*H*W + h*W + w] = pixel[2] / 255.0f; // B
        }
    }
    
    // 3. Infer
    infer_request.infer();
    
    // 4. Postprocess
    const ov::Tensor& output_tensor = infer_request.get_output_tensor();
    const float* output_buffer = output_tensor.data<const float>();
    
    // Output shape for YOLO usually [1, 84, 8400] (for 80 classes + 4 bbox coords)
    // 84 = 4 coord + 80 classes
    // We need to verify the output shape handling.
    
    auto end = std::chrono::high_resolution_clock::now();
    // std::cout << "Inference time: " << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count() << "ms" << std::endl;

    return postprocess(output_buffer, frame.size(), conf_threshold, iou_threshold);
}

std::vector<Detection> InferenceEngine::postprocess(const float* output_data, const cv::Size& original_size, float conf_threshold, float iou_threshold) {
    std::vector<Detection> detections;
    std::vector<int> class_ids;
    std::vector<float> confidences;
    std::vector<cv::Rect> boxes;
    
    // YOLOv11 / v8 Output Format: [Batch, Channels, Anchors] -> [1, 4 + NumClasses, NumProposals]
    // e.g. [1, 84, 8400]
    
    // We assume the shape is available.
    ov::Shape out_shape = infer_request.get_output_tensor().get_shape();
    int num_classes = out_shape[1] - 4; // e.g. 84 - 4 = 80
    int num_proposals = out_shape[2];   // e.g. 8400
    
    // The data is likely row-major but the shape implies distinct channels per proposal.
    // Actually YOLOv8/11 export logic suggests [1, 84, 8400]
    // where 84 is (cx, cy, w, h, class0_conf, class1_conf...)
    
    // We transpose conceptually by iterating:
    // For each proposal p (0..8400):
    //   cx = data[0 * num_proposals + p]
    //   cy = data[1 * num_proposals + p]
    //   ...
    
    const float* px = output_data;
    const float* py = px + num_proposals;
    const float* pw = py + num_proposals;
    const float* ph = pw + num_proposals;
    const float* p_classes = ph + num_proposals; // Start of class scores
    
    float ratio_w = (float)original_size.width / input_shape[3];
    float ratio_h = (float)original_size.height / input_shape[2];
    
    for (int i = 0; i < num_proposals; i++) {
        
        // Find best class score for this proposal
        float max_score = 0.0f;
        int max_class_id = -1;
        
        for (int c = 0; c < num_classes; c++) {
            float score = p_classes[c * num_proposals + i];
            if (score > max_score) {
                max_score = score;
                max_class_id = c;
            }
        }
        
        if (max_score > conf_threshold) {
            float cx = px[i];
            float cy = py[i];
            float w = pw[i];
            float h = ph[i];
            
            // Convert to top-left x,y
            int left = static_cast<int>((cx - 0.5 * w) * ratio_w);
            int top = static_cast<int>((cy - 0.5 * h) * ratio_h);
            int width = static_cast<int>(w * ratio_w);
            int height = static_cast<int>(h * ratio_h);
            
            boxes.push_back(cv::Rect(left, top, width, height));
            class_ids.push_back(max_class_id);
            confidences.push_back(max_score);
        }
    }
    
    // NMS
    std::vector<int> indices;
    cv::dnn::NMSBoxes(boxes, confidences, conf_threshold, iou_threshold, indices);
    
    for (int idx : indices) {
        Detection det;
        det.class_id = class_ids[idx];
        det.confidence = confidences[idx];
        det.box = boxes[idx];
        det.class_name = std::to_string(class_ids[idx]); // Map to name later
        detections.push_back(det);
    }
    
    return detections;
}

} // namespace yolov11
