use anyhow::{Context, Result};
use opencv::{
    core::{Mat, Point, Rect, Scalar, Size, Vector},
    dnn, imgproc,
    prelude::*,
};
use openvino::{Core, ElementType, Tensor};
use std::sync::Arc;

pub struct Detection {
    pub class_id: i32,
    pub score: f32,
    pub box_rect: Rect,
    pub class_name: String,
}

pub struct InferenceEngine {
    core: Core,
    compiled_model: Option<openvino::CompiledModel>,
    infer_request: Option<openvino::InferRequest>,
    input_width: usize,
    input_height: usize,
}

impl InferenceEngine {
    pub fn new() -> Self {
        let core = Core::new().expect("Failed to create OpenVINO Core");
        Self {
            core,
            compiled_model: None,
            infer_request: None,
            input_width: 640,
            input_height: 640,
        }
    }

    pub fn load_model(&mut self, model_path: &str, device: &str) -> Result<()> {
        println!(
            "Loading model (OpenVINO 0.7.1 - NMS Enabled): {} on {}",
            model_path, device
        );
        let bin_path = model_path.replace(".xml", ".bin");

        let model = self.core.read_model_from_file(model_path, &bin_path)?;
        let mut compiled_model = self.core.compile_model(&model, device.into())?;
        let infer_request = compiled_model.create_infer_request()?;

        self.compiled_model = Some(compiled_model);
        self.infer_request = Some(infer_request);

        println!("Model loaded successfully");
        Ok(())
    }

    pub fn infer(&mut self, frame: &Mat, conf_threshold: f32) -> Result<Vec<Detection>> {
        let request = self
            .infer_request
            .as_mut()
            .ok_or(anyhow::anyhow!("Model not loaded"))?;

        // 1. Preprocess
        let img = letterbox(frame, self.input_height as i32, self.input_width as i32)?;
        // OpenCV Rust Mat is already usable, but need to extract data.

        // Convert to RGB
        let mut rgb = Mat::default();
        imgproc::cvt_color(&img, &mut rgb, imgproc::COLOR_BGR2RGB, 0)?;

        // Convert to Float32 and Normalize 0-1
        let mut float_img = Mat::default();
        rgb.convert_to(&mut float_img, opencv::core::CV_32F, 1.0 / 255.0, 0.0)?;

        // HWC to CHW
        let h = self.input_height;
        let w = self.input_width;
        let mut input_data = vec![0.0f32; 3 * h * w];

        for y in 0..h {
            for x in 0..w {
                let pixel = float_img.at_2d::<opencv::core::Vec3f>(y as i32, x as i32)?;
                input_data[0 * h * w + y * w + x] = pixel[0]; // R
                input_data[1 * h * w + y * w + x] = pixel[1]; // G
                input_data[2 * h * w + y * w + x] = pixel[2]; // B
            }
        }

        // 2. Set Input
        let mut input_tensor = request.get_input_tensor()?;
        // Note: 0.7.1 might return Tensor, which has get_data_mut (generic?)
        // The reference code used: input_tensor.get_data_mut::<f32>()?
        {
            let buffer = input_tensor.get_data_mut::<f32>()?;
            if buffer.len() != input_data.len() {
                return Err(anyhow::anyhow!(
                    "Input tensor size mismatch: expected {}, got {}",
                    buffer.len(),
                    input_data.len()
                ));
            }
            buffer.copy_from_slice(&input_data);
        }

        // 3. Infer
        request.infer()?;

        // 4. Post-process (YOLOv11 NMS)
        let output_tensor = request.get_output_tensor()?;
        let output_data = output_tensor.get_data::<f32>()?;
        let len = output_data.len();

        let mut anchors = 8400;
        let mut channels = len / anchors;

        if len % anchors != 0 {
            anchors = 8400;
            channels = 84;
        }

        let mut boxes: Vector<Rect> = Vector::new();
        let mut scores: Vector<f32> = Vector::new();
        let mut class_ids: Vec<i32> = Vec::new();

        let scale_x = frame.cols() as f32 / w as f32;
        let scale_y = frame.rows() as f32 / h as f32;

        for i in 0..anchors {
            let mut max_score = 0.0f32;
            let mut cls_id = 0;

            // Classes start after the first 4 bbox coordinates
            for cls in 0..(channels - 4) {
                let idx = (4 + cls) * anchors + i;
                if idx < len {
                    let val = output_data[idx];
                    if val > max_score {
                        max_score = val;
                        cls_id = cls;
                    }
                }
            }

            if max_score > conf_threshold {
                let cx = output_data[0 * anchors + i];
                let cy = output_data[1 * anchors + i];
                let bw = output_data[2 * anchors + i];
                let bh = output_data[3 * anchors + i];

                let x = ((cx - bw / 2.0) * scale_x) as i32;
                let y = ((cy - bh / 2.0) * scale_y) as i32;
                let w_box = (bw * scale_x) as i32;
                let h_box = (bh * scale_y) as i32;

                boxes.push(Rect::new(x, y, w_box, h_box));
                scores.push(max_score);
                class_ids.push(cls_id as i32);
            }
        }

        // NMS
        let mut indices: Vector<i32> = Vector::new();
        dnn::nms_boxes(&boxes, &scores, conf_threshold, 0.45, &mut indices, 1.0, 0)?;

        let mut detections = Vec::new();
        for i in 0..indices.len() {
            let idx = indices.get(i)? as usize;
            let box_rect = boxes.get(idx)?;
            let score = scores.get(idx)?;
            let class_id = class_ids[idx];

            // Map class_id to name
            let class_name = match class_id {
                0 => "fire",
                1 => "smoke",
                2 => "fire_smoke",
                3 => "steam",
                _ => "unknown",
            }
            .to_string();

            detections.push(Detection {
                class_id,
                score,
                box_rect,
                class_name,
            });
        }

        Ok(detections)
    }
}

// Helper
fn letterbox(img: &Mat, new_h: i32, new_w: i32) -> Result<Mat> {
    let h = img.rows();
    let w = img.cols();
    let r = (new_h as f32 / h as f32).min(new_w as f32 / w as f32);
    let new_unpad_w = (w as f32 * r).round() as i32;
    let new_unpad_h = (h as f32 * r).round() as i32;
    let dw = (new_w - new_unpad_w) / 2;
    let dh = (new_h - new_unpad_h) / 2;

    let mut resized = Mat::default();
    imgproc::resize(
        img,
        &mut resized,
        Size::new(new_unpad_w, new_unpad_h),
        0.0,
        0.0,
        imgproc::INTER_LINEAR,
    )?;

    let mut result = Mat::default();
    opencv::core::copy_make_border(
        &resized,
        &mut result,
        dh,
        dh,
        dw,
        dw,
        opencv::core::BORDER_CONSTANT,
        Scalar::new(114.0, 114.0, 114.0, 0.0),
    )?;

    Ok(result)
}
