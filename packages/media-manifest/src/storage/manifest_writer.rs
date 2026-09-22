use std::path::PathBuf;

use crate::model::SessionManifest;

use super::{SessionLayout, write_atomic};

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
    pub fn checkpoint(&self, manifest: &SessionManifest) -> Result<(), crate::ManifestError> {
        let bytes = serde_json::to_vec_pretty(manifest)?;
        write_atomic(&self.layout.partial_manifest(), &bytes)
    }
    pub fn finalize(
        &mut self,
        manifest: &mut SessionManifest,
    ) -> Result<PathBuf, crate::ManifestError> {
        self.finalize_with_completion(manifest, true)
    }

    pub fn finalize_with_completion(
        &mut self,
        manifest: &mut SessionManifest,
        completed_successfully: bool,
    ) -> Result<PathBuf, crate::ManifestError> {
        if self.finalized {
            return Ok(self.layout.manifest());
        }
        let mut completed = manifest.clone();
        completed.completed = completed_successfully;
        let bytes = serde_json::to_vec_pretty(&completed)?;
        write_atomic(&self.layout.manifest(), &bytes)?;
        let partial = self.layout.partial_manifest();
        if partial.is_file() {
            std::fs::remove_file(&partial)
                .map_err(|e| crate::ManifestError::storage(&partial, e))?;
        }
        manifest.completed = completed_successfully;
        self.finalized = true;
        Ok(self.layout.manifest())
    }
}
