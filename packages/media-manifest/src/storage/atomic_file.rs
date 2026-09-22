use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::Path,
};

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), crate::ManifestError> {
    let file_name = path.file_name().ok_or(crate::ManifestError::InvalidPath)?;
    let temporary = path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
    if temporary.exists() {
        std::fs::remove_file(&temporary)
            .map_err(|error| crate::ManifestError::storage(&temporary, error))?;
    }
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|e| crate::ManifestError::storage(&temporary, e))?;
    if let Err(error) = (|| {
        file.write_all(bytes)?;
        file.sync_all()
    })() {
        let _cleanup = std::fs::remove_file(&temporary);
        return Err(crate::ManifestError::storage(&temporary, error));
    }
    if let Err(error) = std::fs::rename(&temporary, path) {
        let _cleanup = std::fs::remove_file(&temporary);
        return Err(crate::ManifestError::storage(path, error));
    }
    if let Some(parent) = path.parent()
        && let Err(error) = File::open(parent).and_then(|directory| directory.sync_all())
    {
        // Some filesystems (notably Windows directories) reject directory fsync even
        // though the file itself and atomic replacement have completed successfully.
        if !matches!(
            error.kind(),
            std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
        ) {
            return Err(crate::ManifestError::storage(parent, error));
        }
    }
    Ok(())
}
