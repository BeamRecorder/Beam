#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraFormat, CameraFrame, CameraQueueLimits, PixelFormat};

#[test]
fn owned_camera_frame_reuses_a_caller_rgba_buffer_across_updates() {
    let frame = CameraFrame {
        format: CameraFormat {
            width: 1,
            height: 1,
            fps: 30,
            pixel_format: PixelFormat::Bgra,
            stride: 4,
        },
        native_timestamp_ns: Some(42),
        sequence: 3,
        data: Arc::from([10_u8, 20, 30, 255]),
    };
    let mut output = Vec::with_capacity(16);
    let address = output.as_ptr();
    frame.write_rgba(&mut output).expect("first conversion");
    assert_eq!(output, [30, 20, 10, 255]);
    frame.write_rgba(&mut output).expect("second conversion");
    assert_eq!(output.as_ptr(), address);
    assert_eq!(frame.sequence, 3);
    assert_eq!(frame.native_timestamp_ns, Some(42));
}

#[test]
fn default_camera_queue_bounds_frames_and_bytes() {
    let limits = CameraQueueLimits::default();
    assert!(limits.frames > 0);
    assert!(limits.bytes >= 640 * 480 * 4);
}
