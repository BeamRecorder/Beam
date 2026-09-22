use std::{io, path::PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum ManifestError {
    #[error("invalid source id: expected 1..=1024 nonblank characters")]
    InvalidSourceId,
    #[error("atomic path has no filename")]
    InvalidPath,
    #[error("storage error at {path}: {source}")]
    Storage {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("manifest serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl ManifestError {
    pub(crate) fn storage(path: impl Into<PathBuf>, source: io::Error) -> Self {
        Self::Storage {
            path: path.into(),
            source,
        }
    }
}
