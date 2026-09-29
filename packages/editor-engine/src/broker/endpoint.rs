//! Stable addresses use the canonical project identity, never its path length.
use crate::{EditorError, Result};
use sha2::{Digest, Sha256};
use std::path::Path;
#[cfg(unix)]
use std::path::PathBuf;

pub(super) fn project_hash(project: &Path) -> Result<String> {
    let canonical = project
        .canonicalize()
        .map_err(|error| crate::shared::storage(project, error))?;
    if !canonical.is_dir() {
        return Err(EditorError::Invalid(
            "broker project must be a directory".into(),
        ));
    }
    Ok(format!(
        "{:x}",
        Sha256::digest(canonical.as_os_str().as_encoded_bytes())
    ))
}

#[cfg(unix)]
pub(super) fn private_runtime() -> Result<PathBuf> {
    use std::os::unix::fs::DirBuilderExt;
    // geteuid has no pointers or mutable process state; ownership follows the
    // effective credentials which also determine socket/filesystem access.
    let uid = unsafe { libc::geteuid() };
    let runtime = PathBuf::from(format!("/tmp/beam-editor-{uid}"));
    match std::fs::DirBuilder::new().mode(0o700).create(&runtime) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(crate::shared::storage(&runtime, error)),
    }
    private_directory(&runtime)?;
    Ok(runtime)
}

#[cfg(unix)]
pub(super) fn private_directory(path: &Path) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    let metadata =
        std::fs::symlink_metadata(path).map_err(|error| crate::shared::storage(path, error))?;
    let uid = unsafe { libc::geteuid() };
    if !metadata.is_dir() || metadata.uid() != uid || metadata.mode() & 0o7777 != 0o700 {
        return Err(EditorError::Unauthorized(
            "broker directory must be owned by this user with permissions 0700 and no symlink"
                .into(),
        ));
    }
    Ok(())
}

#[cfg(unix)]
pub(super) fn private_file(path: &Path, socket: bool) -> Result<()> {
    use std::os::unix::fs::{FileTypeExt, MetadataExt};
    let metadata =
        std::fs::symlink_metadata(path).map_err(|error| crate::shared::storage(path, error))?;
    let uid = unsafe { libc::geteuid() };
    let valid_kind = if socket {
        metadata.file_type().is_socket()
    } else {
        metadata.is_file()
    };
    if !valid_kind || metadata.uid() != uid || metadata.mode() & 0o7777 != 0o600 {
        return Err(EditorError::Unauthorized(
            "broker socket and token must be owned by this user with permissions 0600 and no symlink".into(),
        ));
    }
    Ok(())
}
