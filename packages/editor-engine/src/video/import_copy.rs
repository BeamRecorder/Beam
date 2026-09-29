//! A cancellable copy identifies the exact bytes written to the private candidate.
use crate::{EditorError, Result, project::source_types::SourceStamp};
use beam_editor_domain::project::types::SourceIdentity;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

pub(crate) fn copy(
    path: &Path,
    destination: &mut fs::File,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64, u64) -> Result<()>,
) -> Result<SourceIdentity> {
    let before = path
        .symlink_metadata()
        .map_err(|error| crate::shared::storage(path, error))?;
    if !before.is_file() || before.file_type().is_symlink() {
        return Err(EditorError::Invalid(
            "import requires a regular authorized source file".into(),
        ));
    }
    let stamp = SourceStamp::from(&before);
    let mut source = fs::File::open(path).map_err(|error| crate::shared::storage(path, error))?;
    if SourceStamp::from(
        &source
            .metadata()
            .map_err(|error| crate::shared::storage(path, error))?,
    ) != stamp
    {
        return Err(EditorError::Invalid(
            "source was replaced before its import copy".into(),
        ));
    }
    let mut buffer = [0u8; 256 * 1024];
    let mut copied = 0u64;
    let mut hash = Sha256::new();
    loop {
        if cancel.load(Ordering::Acquire) {
            return Err(EditorError::Stopped);
        }
        let length = source
            .read(&mut buffer)
            .map_err(|error| crate::shared::storage(path, error))?;
        if length == 0 {
            break;
        }
        destination
            .write_all(&buffer[..length])
            .map_err(|error| crate::shared::storage("managed import copy", error))?;
        hash.update(&buffer[..length]);
        copied += length as u64;
        progress(copied, before.len())?;
    }
    let after = path
        .symlink_metadata()
        .map_err(|error| crate::shared::storage(path, error))?;
    if copied != before.len()
        || SourceStamp::from(&after) != stamp
        || after.file_type().is_symlink()
        || SourceStamp::from(
            &source
                .metadata()
                .map_err(|error| crate::shared::storage(path, error))?,
        ) != stamp
    {
        return Err(EditorError::Invalid(
            "source changed while being imported; retry the selection".into(),
        ));
    }
    Ok(SourceIdentity {
        sha256: format!("{:x}", hash.finalize()),
        byte_length: copied,
    })
}
