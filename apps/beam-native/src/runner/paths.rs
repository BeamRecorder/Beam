//! Bundle lookup for a staged native host and a Cargo development run.

use std::path::{Path, PathBuf};

/// Chooses the staged UI only when it exists; Cargo targets live elsewhere.
pub(crate) fn fallback_bundle_path(executable: &Path, manifest_dir: &Path) -> PathBuf {
    let staged = executable
        .parent()
        .map(|directory| directory.join("ui/app.mjs"));
    if let Some(path) = staged
        && path.is_file()
    {
        return path;
    }
    manifest_dir.join("../../packages/beam-ui/dist/native/app.mjs")
}
