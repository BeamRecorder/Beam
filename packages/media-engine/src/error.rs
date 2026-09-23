use crate::RecordingState;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("capture selection cancelled")]
    Cancelled,
    #[error("invalid recording configuration: {0}")]
    InvalidConfiguration(String),
    #[error("cannot {operation} while engine is {state:?}")]
    InvalidTransition {
        state: RecordingState,
        operation: &'static str,
    },
    #[error("command refers to another recording session")]
    StaleSession,
    #[error("native media worker is unavailable")]
    WorkerUnavailable,
    #[error("native media worker command queue is full")]
    Busy,
    #[error("native media failed: {0}")]
    Media(String),
    #[error("recording storage failed: {0}")]
    Storage(#[from] std::io::Error),
}

impl EngineError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Cancelled => "cancelled",
            Self::InvalidConfiguration(_) => "invalid-configuration",
            Self::InvalidTransition { .. } => "invalid-transition",
            Self::StaleSession => "stale-session",
            Self::WorkerUnavailable => "worker-unavailable",
            Self::Busy => "busy",
            Self::Media(_) => "media-error",
            Self::Storage(_) => "storage-error",
        }
    }
}
