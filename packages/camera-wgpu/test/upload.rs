#![allow(clippy::expect_used)]

use beam_camera_wgpu::{CameraPreview, aligned_rgba_row_bytes};

#[test]
fn row_pitch_obeys_gpu_copy_alignment() {
    assert_eq!(aligned_rgba_row_bytes(1).expect("one pixel"), 256);
    assert_eq!(aligned_rgba_row_bytes(64).expect("aligned"), 256);
    assert_eq!(aligned_rgba_row_bytes(65).expect("next row"), 512);
}

#[test]
fn row_pitch_overflow_is_rejected() {
    assert!(aligned_rgba_row_bytes(u32::MAX).is_err());
}

#[test]
fn resetting_preview_does_not_fabricate_upload_metrics() {
    let mut preview = CameraPreview::new();
    assert_eq!(preview.stats().frames_uploaded, 0);
    preview.reset();
    assert_eq!(preview.stats().texture_recreations, 0);
}
