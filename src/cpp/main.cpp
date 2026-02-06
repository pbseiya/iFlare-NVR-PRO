
#include <iostream>
#include <string>
#include <vector>
#include <chrono>
#include <thread>
#include <iomanip>
#include <cstdlib>

#include <opencv2/highgui.hpp>
#include <opencv2/imgproc.hpp>

#include "core/inference_engine.hpp"

// Simple argument parser helper
std::string getCmdOption(char ** begin, char ** end, const std::string & option) {
    char ** itr = std::find(begin, end, option);
    if (itr != end && ++itr != end) {
        return std::string(*itr);
    }
    return "";
}

bool cmdOptionExists(char** begin, char** end, const std::string& option) {
    return std::find(begin, end, option) != end;
}

int main(int argc, char* argv[]) {
    std::cout << "--- YOLOv11 C++ Inference Engine (Visual) ---" << std::endl;

    if (cmdOptionExists(argv, argv+argc, "-h") || cmdOptionExists(argv, argv+argc, "--help")) {
        std::cout << "Usage: ./yolov11_inference_cpp --model <path> --source <path> [--fps <val>] [--conf <val>]" << std::endl;
        return 0;
    }

    // 1. Parse Arguments
    std::string model_path = getCmdOption(argv, argv + argc, "--model");
    std::string source_path = getCmdOption(argv, argv + argc, "--source");
    
    float fps_target = 10.0f;
    std::string fps_str = getCmdOption(argv, argv + argc, "--fps");
    if (!fps_str.empty()) fps_target = std::stof(fps_str);

    float conf_threshold = 0.25f;
    std::string conf_str = getCmdOption(argv, argv + argc, "--conf");
    if (!conf_str.empty()) conf_threshold = std::stof(conf_str);
    
    if (model_path.empty() || source_path.empty()) {
        std::cerr << "Error: --model and --source are required." << std::endl;
        return 1;
    }

    try {
        // 2. Initialize Engine
        yolov11::InferenceEngine engine;
        engine.load_model(model_path, "CPU");

        // 3. Open Video Source
        cv::VideoCapture cap;
        try {
            int cam_id = std::stoi(source_path);
            cap.open(cam_id);
        } catch (...) {
            cap.open(source_path);
        }

        if (!cap.isOpened()) {
            std::cerr << "Error: Could not open source " << source_path << std::endl;
            return 1;
        }

        std::cout << "Source opened: " << source_path << std::endl;
        
    // ... (args parsing)
    bool json_output = cmdOptionExists(argv, argv + argc, "--json");
    bool headless = cmdOptionExists(argv, argv + argc, "--headless");

    if (json_output) headless = true; // efficient 

    // ... (engine init)

        bool has_display = false;
        if (!headless && std::getenv("DISPLAY") != nullptr) {
            has_display = true;
            cv::namedWindow("C++ Inference", cv::WINDOW_AUTOSIZE);
        } else if (!json_output) {
             std::cout << "Warning: No DISPLAY or Headless mode. Visualization disabled." << std::endl;
        }

        // 4. Inference Loop
        cv::Mat frame;
        long frame_counter = 0;
        
        double frame_interval_ms = (fps_target > 0) ? (1000.0 / fps_target) : 0;
        auto last_frame_time = std::chrono::high_resolution_clock::now();

        while (true) {
            auto now = std::chrono::high_resolution_clock::now();
            double elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_frame_time).count();
            
            if (fps_target > 0 && elapsed_ms < frame_interval_ms) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                continue;
            }
            
            cap >> frame;
            if (frame.empty()) {
                if (!json_output) std::cout << "End of stream." << std::endl;
                break;
            }
            last_frame_time = std::chrono::high_resolution_clock::now();
            frame_counter++;

            // Inference
            std::vector<yolov11::Detection> detections = engine.infer(frame, conf_threshold);

            if (json_output) {
                std::cout << "{\"frame\": " << frame_counter << ", \"detections\": [";
                for (size_t i = 0; i < detections.size(); ++i) {
                    const auto& det = detections[i];
                    std::cout << "{\"class_id\": " << det.class_id << ", \"confidence\": " << det.confidence 
                              << ", \"bbox\": [" << det.box.x << ", " << det.box.y << ", " << det.box.width << ", " << det.box.height << "]}";
                    if (i < detections.size() - 1) std::cout << ", ";
                }
                std::cout << "]}" << std::endl;
            } else {
                std::cout << "Frame " << frame_counter << ": " << detections.size() << " detections." << std::endl;
            }
            
            // Visualization
            if (has_display) {
                for (const auto& det : detections) {
                    cv::rectangle(frame, det.box, cv::Scalar(0, 255, 0), 2);
                    std::string label = std::to_string(det.class_id) + " " + std::to_string(det.confidence).substr(0, 4);
                    cv::putText(frame, label, cv::Point(det.box.x, det.box.y - 10), cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 255, 0), 2);
                }
                cv::imshow("C++ Inference", frame);
                if (cv::waitKey(1) == 113) { // 'q'
                    break;
                }
            }
        }
        
        if (has_display) {
            cv::destroyAllWindows();
        }

    } catch (const std::exception& e) {
        std::cerr << "Runtime Error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
