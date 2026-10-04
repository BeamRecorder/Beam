use crate::CaptureError;
use std::{
    collections::BTreeSet,
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

fn stage(path: &Path, bytes: &[u8]) -> Result<PathBuf, CaptureError> {
    let file_name = path
        .file_name()
        .ok_or_else(|| CaptureError::InvalidConfiguration("atomic path has no filename".into()))?;
    let temporary = path.with_file_name(format!(
        "{}.{}.tmp",
        file_name.to_string_lossy(),
        uuid::Uuid::now_v7()
    ));
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| CaptureError::storage(&temporary, error))?;
    let result = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    if let Err(error) = result {
        let failure = CaptureError::storage(&temporary, error);
        if let Err(cleanup) = std::fs::remove_file(&temporary) {
            return Err(CaptureError::storage(
                &temporary,
                std::io::Error::other(format!("{failure}; cleanup failed: {cleanup}")),
            ));
        }
        return Err(failure);
    }
    Ok(temporary)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), CaptureError> {
    write_atomic_batch([(path, bytes)])
}

pub(crate) fn write_atomic_batch<'a>(
    entries: impl IntoIterator<Item = (&'a Path, &'a [u8])>,
) -> Result<(), CaptureError> {
    let mut staged = Vec::new();
    let mut published = 0;
    let result = (|| {
        for (path, bytes) in entries {
            staged.push((path.to_path_buf(), stage(path, bytes)?));
        }
        let mut directories = BTreeSet::new();
        for (path, temporary) in &staged {
            std::fs::rename(temporary, path).map_err(|error| CaptureError::storage(path, error))?;
            published += 1;
            directories.insert(
                path.parent()
                    .filter(|parent| !parent.as_os_str().is_empty())
                    .unwrap_or_else(|| Path::new("."))
                    .to_path_buf(),
            );
        }
        for parent in directories {
            if let Err(error) = File::open(&parent).and_then(|directory| directory.sync_all()) {
                // Windows and some filesystems reject directory fsync; file data
                // has already been synchronized before the atomic replacement.
                if !matches!(
                    error.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
                ) {
                    return Err(CaptureError::storage(&parent, error));
                }
            }
        }
        Ok(())
    })();
    let mut cleanup_failure = None;
    for (_, temporary) in staged.iter().skip(published) {
        if let Err(error) = std::fs::remove_file(temporary)
            && error.kind() != std::io::ErrorKind::NotFound
        {
            let message = result.as_ref().err().map_or_else(
                || error.to_string(),
                |failure| format!("{failure}; cleanup failed: {error}"),
            );
            cleanup_failure.get_or_insert_with(|| {
                CaptureError::storage(temporary, std::io::Error::other(message))
            });
        }
    }
    cleanup_failure.map_or(result, Err)
}
