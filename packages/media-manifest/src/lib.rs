//! Versioned Beam session manifests and crash-safe metadata persistence.

mod error;
mod model;
mod storage;

pub use error::ManifestError;
pub use model::*;
pub use storage::{ManifestWriter, ProjectLayout, SessionLayout, write_atomic};
