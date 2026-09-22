#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraFormat, CameraFrame, CameraQueueLimits, PixelFormat};

#[test]
fn public_camera_contract_exposes_owned_frames_and_bounded_queue_defaults() {
    let format = CameraFormat {
        width: 1,
        height: 1,
        fps: 30,
        pixel_format: PixelFormat::Bgra,
        stride: 4,
    };
    let frame = CameraFrame {
        format,
        native_timestamp_ns: Some(123),
        sequence: 7,
        data: Arc::from([1_u8, 2, 3, 255]),
    };
    assert_eq!(frame.to_rgba().expect("RGBA"), [3, 2, 1, 255]);
    let limits = CameraQueueLimits::default();
    assert!(limits.frames > 0);
    assert!(limits.bytes >= frame.data.len());
}
