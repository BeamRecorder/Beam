use serde::{Deserialize, Serialize};

use crate::model::{CaptureCapabilities, PermissionSnapshot, SourceDescriptor, SourceKind};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSnapshot {
    pub generation: u64,
    pub created_at_utc: String,
    pub capabilities: CaptureCapabilities,
    pub permissions: PermissionSnapshot,
    pub limitations: Vec<String>,
    pub sources: Vec<SourceDescriptor>,
}

impl CatalogSnapshot {
    pub fn by_kind(&self, kind: SourceKind) -> impl Iterator<Item = &SourceDescriptor> {
        self.sources
            .iter()
            .filter(move |source| source.kind == kind)
    }
}
