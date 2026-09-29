//! Errors shared across document, filesystem, and media boundaries.
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum EditorError {
    #[error("Invalid project: {0}")]
    Invalid(String),
    #[error("{path}: {source}")]
    Storage {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("Invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("GStreamer: {0}")]
    Media(String),
    #[error("The editor worker has stopped")]
    Stopped,
}
pub type Result<T> = std::result::Result<T, EditorError>;

/// Associates a filesystem failure with the affected project path.
pub fn storage(path: impl Into<PathBuf>, source: std::io::Error) -> EditorError {
    EditorError::Storage {
        path: path.into(),
        source,
    }
}
