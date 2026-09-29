//! Preserve accepted V1 bytes before publishing the first migrated checkpoint.
use crate::{Document, EditorError, Result};
use std::{fs, io::Write, path::Path};

pub(super) fn capture(bytes: &[u8]) -> Result<Option<Vec<u8>>> {
    let header: serde_json::Value = serde_json::from_slice(bytes)?;
    Ok((header
        .get("schemaVersion")
        .and_then(|version| version.as_u64())
        == Some(1))
    .then(|| bytes.to_vec()))
}
pub(super) fn preserve(root: &Path, original: &[u8]) -> Result<()> {
    let folder = super::blocks::directory(root, true)?
        .parent()
        .ok_or_else(|| EditorError::Invalid("editor directory is unavailable".into()))?
        .to_owned();
    let path = root.join(super::legacy_backup_types::V1_ORIGINAL_FILE);
    match path.symlink_metadata() {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            let existing = super::blocks::read_bytes(&path)?;
            let stored: Document = serde_json::from_slice(&existing)?;
            let supplied: Document = serde_json::from_slice(original)?;
            if stored.schema_version != 1 || stored.project.id != supplied.project.id {
                return Err(EditorError::Invalid(
                    "original V1 backup belongs to a different project or schema".into(),
                ));
            }
            super::migration::migrate(stored)?;
            return Ok(());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(crate::shared::storage(&path, error)),
        _ => {
            return Err(EditorError::Invalid(
                "original V1 backup is not a regular file".into(),
            ));
        }
    }
    let mut temporary = tempfile::Builder::new()
        .prefix(".v1-original-")
        .tempfile_in(&folder)
        .map_err(|error| crate::shared::storage(&folder, error))?;
    temporary
        .write_all(original)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| crate::shared::storage(temporary.path(), error))?;
    temporary
        .persist_noclobber(&path)
        .map_err(|error| crate::shared::storage(&path, error.error))?;
    match fs::File::open(&folder).and_then(|file| file.sync_all()) {
        Ok(()) => {}
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
            ) => {}
        Err(error) => return Err(crate::shared::storage(&folder, error)),
    }
    Ok(())
}
