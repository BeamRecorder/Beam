//! Bundle lookup for a staged native host and a Cargo development run.

use std::path::{Path, PathBuf};

/// Locates the running binary's scene bundle when no override was provided.
pub(crate) fn running_bundle_path() -> Option<PathBuf> {
    Some(fallback_bundle_path(
        &std::env::current_exe().ok()?,
        Path::new(env!("CARGO_MANIFEST_DIR")),
    ))
}

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

/// Selects the scene next to the launcher, retaining settings argument precedence.
pub(crate) fn scene_bundle_path(
    bundle: Option<PathBuf>,
    settings: bool,
    editor: bool,
) -> Option<PathBuf> {
    bundle.map(|path| {
        if settings {
            path.with_file_name("settings.mjs")
        } else if editor {
            path.with_file_name("editor.mjs")
        } else {
            path
        }
    })
}

/// Resolves scene assets beside a staged bundle or from the development tree.
pub(crate) fn fallback_asset_manifest(
    bundle: Option<&Path>,
    packaged_name: &str,
    development_name: &str,
) -> Result<PathBuf, &'static str> {
    let parent = bundle
        .and_then(Path::parent)
        .ok_or("bundle path has no directory")?;
    let packaged = parent.join(packaged_name);
    if packaged.exists() {
        Ok(packaged)
    } else {
        Ok(parent.join("../..").join(development_name))
    }
}
