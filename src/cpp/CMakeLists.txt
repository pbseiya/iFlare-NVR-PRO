
cmake_minimum_required(VERSION 3.10)
project(yolov11_inference_cpp)

set(CMAKE_CXX_STANDARD 17)

# Find OpenVINO
find_package(OpenVINO REQUIRED)

# Find OpenCV
find_package(OpenCV REQUIRED)

# Find PostgreSQL (libpqxx)
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBPQXX REQUIRED libpqxx)

# Include directories
include_directories(${OpenVINO_INCLUDE_DIRS})
include_directories(${OpenCV_INCLUDE_DIRS})
include_directories(${LIBPQXX_INCLUDE_DIRS})
include_directories(core)

# Source files
file(GLOB_RECURSE SOURCES
    "main.cpp"
    "core/*.cpp"
)

# Executable
add_executable(yolov11_inference_cpp ${SOURCES})

# Link libraries
target_link_libraries(yolov11_inference_cpp
    PRIVATE
    openvino::runtime
    ${OpenCV_LIBS}
    ${LIBPQXX_LIBRARIES}
)
