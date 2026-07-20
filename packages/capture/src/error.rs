use std::io;

use thiserror::Error;

/// Errors produced by capture discovery, validation and recording.
#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("source not found: {0}")]
    SourceNotFound(String),
    #[error("unsupported operation: {0}")]
    Unsupported(String),
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("invalid state transition: {from} -> {to}")]
    InvalidTransition { from: String, to: String },
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("storage error at {path}: {source}")]
    Storage {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("backend error: {0}")]
    Backend(String),
    #[error("operation cancelled")]
    Cancelled,
}

impl CaptureError {
    pub(crate) fn storage(path: &std::path::Path, source: io::Error) -> Self {
        Self::Storage {
            path: path.display().to_string(),
            source,
        }
    }
}
