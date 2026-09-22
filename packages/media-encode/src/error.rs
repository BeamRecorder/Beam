#[derive(Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("invalid media format: {0}")]
    InvalidFormat(String),
    #[error("non-monotonic track timestamp: {pts_ns}ns follows {last_end_ns}ns")]
    NonMonotonic { pts_ns: u64, last_end_ns: u64 },
    #[error("track queue is full ({kind})")]
    QueueFull { kind: &'static str },
    #[error("track worker stopped unexpectedly")]
    WorkerStopped,
    #[error("track worker failed: {0}")]
    WorkerFailed(String),
    #[error("GStreamer initialization or pipeline failed: {0}")]
    Pipeline(String),
    #[error("track storage error at {path}: {source}")]
    Storage {
        path: std::path::PathBuf,
        #[source]
        source: std::io::Error,
    },
}

impl EncodeError {
    pub(crate) fn storage(path: impl Into<std::path::PathBuf>, source: std::io::Error) -> Self {
        Self::Storage {
            path: path.into(),
            source,
        }
    }
}
