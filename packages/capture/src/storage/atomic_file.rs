use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::Path,
};

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), crate::CaptureError> {
    let file_name = path.file_name().ok_or_else(|| {
        crate::CaptureError::InvalidConfiguration("atomic path has no filename".into())
    })?;
    let temporary = path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
    if temporary.exists() {
        std::fs::remove_file(&temporary)
            .map_err(|error| crate::CaptureError::storage(&temporary, error))?;
    }
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|e| crate::CaptureError::storage(&temporary, e))?;
    if let Err(error) = (|| {
        file.write_all(bytes)?;
        file.sync_all()
    })() {
        let _cleanup = std::fs::remove_file(&temporary);
        return Err(crate::CaptureError::storage(&temporary, error));
    }
    std::fs::rename(&temporary, path).map_err(|e| crate::CaptureError::storage(path, e))?;
    if let Some(parent) = path.parent()
        && let Err(error) = File::open(parent).and_then(|directory| directory.sync_all())
    {
        // Some filesystems (notably Windows directories) reject directory fsync even
        // though the file itself and atomic replacement have completed successfully.
        if !matches!(
            error.kind(),
            std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
        ) {
            return Err(crate::CaptureError::storage(parent, error));
        }
    }
    Ok(())
}
