use beam_camera::CameraError;
use beam_camera_wgpu::PreviewError;

#[test]
fn public_preview_error_preserves_camera_failure_context() {
    let error = PreviewError::from(CameraError::InvalidBuffer("truncated NV12 frame".into()));
    assert!(error.to_string().contains("truncated NV12 frame"));
    assert!(matches!(error, PreviewError::Camera(_)));
}
