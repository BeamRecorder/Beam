#[derive(Clone, Debug, thiserror::Error)]
pub enum CameraError {
    #[error("camera unavailable: {0}")]
    DeviceUnavailable(String),
    #[error("camera permission denied: {0}")]
    PermissionDenied(String),
    #[error("unsupported camera format: {0}")]
    UnsupportedFormat(String),
    #[error("camera buffer is invalid: {0}")]
    InvalidBuffer(String),
    #[error("camera backend failed: {0}")]
    Backend(String),
    #[error("camera clock failed: {0}")]
    Clock(String),
}
