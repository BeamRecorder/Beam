use std::path::PathBuf;

use crate::model::SessionManifest;

use super::{SessionLayout, write_json_atomic};

pub struct ManifestWriter {
    layout: SessionLayout,
    finalized: bool,
}
impl ManifestWriter {
    #[must_use]
    pub fn new(layout: SessionLayout) -> Self {
        Self {
            layout,
            finalized: false,
        }
    }
    pub fn checkpoint(&self, manifest: &SessionManifest) -> Result<(), crate::CaptureError> {
        write_json_atomic(&self.layout.partial_manifest(), manifest)
    }
    pub fn finalize(
        &mut self,
        manifest: &mut SessionManifest,
    ) -> Result<PathBuf, crate::CaptureError> {
        if self.finalized {
            return Ok(self.layout.manifest());
        }
        manifest.completed = true;
        write_json_atomic(&self.layout.manifest(), manifest)?;
        let partial = self.layout.partial_manifest();
        if partial.exists() {
            std::fs::remove_file(&partial)
                .map_err(|e| crate::CaptureError::storage(&partial, e))?;
        }
        self.finalized = true;
        Ok(self.layout.manifest())
    }
}
