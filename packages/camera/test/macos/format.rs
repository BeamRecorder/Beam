#![cfg(test)]

use super::*;

#[test]
fn macos_camera_format_ranking_prefers_requested_dimensions() {
    let request = CameraRequest {
        device_id: "camera".into(),
        width: 1280,
        height: 720,
        fps: 30,
    };
    let exact = CameraFormat {
        width: 1280,
        height: 720,
        fps: 25,
        pixel_format: PixelFormat::Bgra,
        stride: 5120,
    };
    let remote = CameraFormat {
        width: 640,
        height: 480,
        fps: 30,
        pixel_format: PixelFormat::Bgra,
        stride: 2560,
    };
    assert!(format_score(&request, exact) < format_score(&request, remote));
    let correct_rate = CameraFormat { fps: 30, ..exact };
    assert!(format_score(&request, correct_rate) < format_score(&request, exact));
}
