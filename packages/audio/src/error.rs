#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("audio device unavailable: {0}")]
    DeviceUnavailable(String),
    #[error("audio permission denied: {0}")]
    PermissionDenied(String),
    #[error("unsupported audio format or operation: {0}")]
    Unsupported(String),
    #[error("audio backend failed: {0}")]
    Backend(String),
    #[error("audio timestamp invalid: {0}")]
    Clock(String),
}

impl From<cpal::Error> for AudioError {
    fn from(error: cpal::Error) -> Self {
        match error.kind() {
            cpal::ErrorKind::PermissionDenied => Self::PermissionDenied(error.to_string()),
            cpal::ErrorKind::DeviceNotAvailable => Self::DeviceUnavailable(error.to_string()),
            cpal::ErrorKind::UnsupportedConfig | cpal::ErrorKind::UnsupportedOperation => {
                Self::Unsupported(error.to_string())
            }
            _ => Self::Backend(error.to_string()),
        }
    }
}
