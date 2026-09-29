//! Authorized inputs are frozen by filesystem identity, without exposing their paths.
use crate::project::source_types::SourceStamp;
use std::path::PathBuf;

#[derive(Clone, serde::Serialize)]
pub(crate) struct ImportSource {
    pub path: PathBuf,
    pub stamp: SourceStamp,
}
