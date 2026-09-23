#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("screen capture failed: {0}")]
    Screen(#[from] beam_screen::CaptureError),
    #[error("invalid session configuration: {0}")]
    InvalidConfiguration(String),
    #[error("session storage failed: {0}")]
    Storage(#[from] beam_media_manifest::ManifestError),
    #[error("session JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("session clock failed: {0}")]
    Clock(#[from] beam_media_core::GateError),
    #[error("session time formatting failed: {0}")]
    Time(#[from] time::error::Format),
}
