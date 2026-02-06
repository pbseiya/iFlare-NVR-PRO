use clap::Parser;
use opencv::prelude::*;
use opencv::{core as cv_core, highgui, imgproc, videoio};
use std::env;
use std::thread;
use std::time::{Duration, Instant};

mod core;
use crate::core::inference_engine::{Detection, InferenceEngine};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    model: String,

    #[arg(short, long)]
    source: String,

    #[arg(short, long, default_value_t = 10.0)]
    fps: f32,

    #[arg(short, long, default_value_t = 0.25)]
    conf: f32,

    #[arg(long, default_value_t = false)]
    json: bool,

    #[arg(long, default_value_t = false)]
    headless: bool,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    // Only print splash if not json (or put it to stderr)
    if !args.json {
        println!("--- YOLOv11 Rust Inference Engine (Visual) ---");
        println!("Model: {}", args.model);
        println!("Source: {}", args.source);
        println!("FPS Target: {}", args.fps);
    }

    // 1. Initialize Engine
    let mut engine = InferenceEngine::new();
    if let Err(e) = engine.load_model(&args.model, "CPU") {
        eprintln!("Error loading model: {}", e);
        return Err(e);
    }

    // 2. Open Video Source
    let mut cam = if let Ok(id) = args.source.parse::<i32>() {
        videoio::VideoCapture::new(id, videoio::CAP_ANY)?
    } else {
        videoio::VideoCapture::from_file(&args.source, videoio::CAP_ANY)?
    };

    if !videoio::VideoCapture::is_opened(&cam)? {
        eprintln!("Error: Could not open source '{}'", args.source);
        return Ok(());
    }

    if !args.json {
        println!("Source opened successfully. Inference starting...");
    }

    // 3. Inference Loop
    let mut frame = Mat::default();
    let frame_interval = if args.fps > 0.0 {
        Duration::from_secs_f32(1.0 / args.fps)
    } else {
        Duration::from_secs_f32(0.0)
    };

    let mut last_frame_time = Instant::now();
    let mut frame_count = 0;

    // Check for display availability for visualization
    let has_display = !args.headless && args.json == false && env::var("DISPLAY").is_ok();

    if has_display {
        highgui::named_window("Rust Inference", highgui::WINDOW_AUTOSIZE)?;
    } else if !args.json {
        println!("Visualization disabled.");
    }

    loop {
        // FPS throttling
        let elapsed = last_frame_time.elapsed();
        if args.fps > 0.0 && elapsed < frame_interval {
            thread::sleep(Duration::from_millis(1));
            continue;
        }

        if !cam.read(&mut frame)? {
            if !args.json {
                println!("End of stream.");
            }
            break;
        }

        if frame.empty() {
            break;
        }

        last_frame_time = Instant::now();
        frame_count += 1;

        // Inference
        match engine.infer(&frame, args.conf) {
            Ok(detections) => {
                if args.json {
                    use serde_json::json;
                    let det_json: Vec<_> = detections.iter().map(|d| {
                        json!({
                            "class_id": d.class_id,
                            "class_name": d.class_name,
                            "confidence": d.score,
                            "bbox": [d.box_rect.x, d.box_rect.y, d.box_rect.width, d.box_rect.height]
                        })
                    }).collect();

                    let output = json!({
                        "frame": frame_count,
                        "detections": det_json
                    });

                    println!("{}", output.to_string());
                } else {
                    println!("Frame {}: {} detections", frame_count, detections.len());
                }

                // Visualization
                if has_display {
                    for det in detections {
                        imgproc::rectangle(
                            &mut frame,
                            det.box_rect,
                            cv_core::Scalar::new(0.0, 255.0, 0.0, 0.0),
                            2,
                            imgproc::LINE_8,
                            0,
                        )?;
                        let label = format!("{} {:.2}", det.class_name, det.score);
                        imgproc::put_text(
                            &mut frame,
                            &label,
                            cv_core::Point::new(det.box_rect.x, det.box_rect.y - 10),
                            imgproc::FONT_HERSHEY_SIMPLEX,
                            0.5,
                            cv_core::Scalar::new(0.0, 255.0, 0.0, 0.0),
                            2,
                            imgproc::LINE_AA,
                            false,
                        )?;
                    }

                    highgui::imshow("Rust Inference", &frame)?;
                    if highgui::wait_key(1)? == 113 {
                        // 'q' to quit
                        break;
                    }
                }
            }
            Err(e) => eprintln!("Inference error: {}", e),
        }
    }

    if has_display {
        highgui::destroy_all_windows()?;
    }

    Ok(())
}
