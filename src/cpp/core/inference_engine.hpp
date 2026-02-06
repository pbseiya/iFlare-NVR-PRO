
#pragma once

#include <string>
#include <vector>
#include <memory>
#include <openvino/openvino.hpp>
#include <opencv2/opencv.hpp>

namespace yolov11 {

struct Detection {
    int class_id;
    float confidence;
    cv::Rect box;
    std::string class_name;
};

class InferenceEngine {
public:
    InferenceEngine();
    ~InferenceEngine();

    // Initialize OpenVINO core and load model
    void load_model(const std::string& model_path, const std::string& device_name = "CPU");

    // Perform inference on a single frame
    std::vector<Detection> infer(const cv::Mat& frame, float conf_threshold = 0.25f, float iou_threshold = 0.45f);

private:
    ov::Core core;
    std::shared_ptr<ov::Model> model;
    ov::CompiledModel compiled_model;
    ov::InferRequest infer_request;
    
    // Model input information
    std::string input_name;
    ov::Shape input_shape;
    
    // Model output information
    std::string output_name;
    ov::Shape output_shape;

    // Preprocessing helper
    cv::Mat preprocess(const cv::Mat& frame);
    
    // Postprocessing helper (YOLOv11 specific)
    std::vector<Detection> postprocess(const float* output_data, const cv::Size& original_size, float conf_threshold, float iou_threshold);
};

} // namespace yolov11
