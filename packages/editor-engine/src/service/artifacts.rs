//! Artifact bytes are bounded resources in a project-owned directory.
use crate::{EditorError, Result};
use base64::Engine;
use beam_editor_domain::protocol::{
    ARTIFACT_CHUNK_BYTES, ArtifactData, ArtifactInfo, SourceVersion,
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
};
use uuid::Uuid;
type ArtifactCache =
    Mutex<HashMap<PathBuf, (crate::project::source_types::SourceStamp, SourceVersion)>>;
static VERIFIED: OnceLock<ArtifactCache> = OnceLock::new();

pub fn managed_directory(root: &Path, category: &str) -> Result<PathBuf> {
    if !matches!(category, "jobs" | "artifacts") {
        return Err(EditorError::Invalid("invalid managed directory".into()));
    }
    let base = root
        .canonicalize()
        .map_err(|e| crate::shared::storage(root, e))?;
    let editor = base.join(".editor");
    for directory in [&editor, &editor.join(category)] {
        if directory
            .symlink_metadata()
            .is_ok_and(|m| !m.is_dir() || m.file_type().is_symlink())
        {
            return Err(EditorError::Invalid(
                "managed directory was replaced by a non-directory or symlink".into(),
            ));
        }
        fs::create_dir_all(directory).map_err(|e| crate::shared::storage(directory, e))?;
    }
    Ok(editor.join(category))
}
pub fn version(path: &Path) -> Result<SourceVersion> {
    version_cancellable(path, None)
}
pub fn version_cancellable(path: &Path, cancel: Option<&AtomicBool>) -> Result<SourceVersion> {
    let before = path
        .symlink_metadata()
        .map_err(|e| crate::shared::storage(path, e))?;
    if !before.is_file() || before.file_type().is_symlink() {
        return Err(EditorError::Invalid(
            "artifact/source is not a regular file".into(),
        ));
    }
    let stamp = crate::project::source_types::SourceStamp::from(&before);
    let mut file = fs::File::open(path).map_err(|e| crate::shared::storage(path, e))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        if cancel.is_some_and(|flag| flag.load(Ordering::Acquire)) {
            return Err(EditorError::Stopped);
        }
        let length = file
            .read(&mut buffer)
            .map_err(|e| crate::shared::storage(path, e))?;
        if length == 0 {
            break;
        }
        hash.update(&buffer[..length]);
        size += length as u64;
    }
    let after = file
        .metadata()
        .map_err(|e| crate::shared::storage(path, e))?;
    let current = path
        .symlink_metadata()
        .map_err(|e| crate::shared::storage(path, e))?;
    if size != before.len()
        || crate::project::source_types::SourceStamp::from(&after) != stamp
        || crate::project::source_types::SourceStamp::from(&current) != stamp
        || current.file_type().is_symlink()
    {
        return Err(EditorError::Invalid(
            "source changed while its version was being verified".into(),
        ));
    }
    Ok(SourceVersion {
        sha256: format!("{:x}", hash.finalize()),
        byte_length: size,
    })
}
pub fn publish(
    root: &Path,
    job_id: Uuid,
    name: String,
    mime_type: &str,
    width: u32,
    height: u32,
    write: impl FnOnce(&mut fs::File) -> Result<()>,
) -> Result<ArtifactInfo> {
    let folder = managed_directory(root, "artifacts")?;
    let id = Uuid::new_v4();
    let path = folder.join(format!("{id}.bin"));
    let mut temporary = tempfile::Builder::new()
        .prefix(".artifact-")
        .tempfile_in(&folder)
        .map_err(|e| crate::shared::storage(&folder, e))?;
    write(temporary.as_file_mut())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|e| crate::shared::storage(temporary.path(), e))?;
    let version = version(temporary.path())?;
    temporary
        .persist_noclobber(&path)
        .map_err(|e| crate::shared::storage(&path, e.error))?;
    if let Err(error) = fs::File::open(&folder).and_then(|file| file.sync_all())
        && !matches!(
            error.kind(),
            std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
        )
    {
        return Err(crate::shared::storage(&folder, error));
    }
    Ok(ArtifactInfo {
        id,
        job_id,
        name,
        mime_type: mime_type.into(),
        byte_length: version.byte_length,
        sha256: version.sha256,
        width,
        height,
    })
}
pub fn capture(
    root: &Path,
    job_id: Uuid,
    path: &Path,
    mime_type: &str,
    width: u32,
    height: u32,
    cancel: &AtomicBool,
) -> Result<ArtifactInfo> {
    let name = path
        .file_name()
        .ok_or_else(|| EditorError::Invalid("artifact filename is missing".into()))?
        .to_string_lossy()
        .into_owned();
    publish(
        root,
        job_id,
        name,
        mime_type,
        width,
        height,
        |destination| {
            let mut source = fs::File::open(path).map_err(|e| crate::shared::storage(path, e))?;
            let mut buffer = [0u8; 64 * 1024];
            loop {
                if cancel.load(Ordering::Acquire) {
                    return Err(EditorError::Stopped);
                }
                let length = source
                    .read(&mut buffer)
                    .map_err(|e| crate::shared::storage(path, e))?;
                if length == 0 {
                    break;
                }
                destination
                    .write_all(&buffer[..length])
                    .map_err(|e| crate::shared::storage("artifact", e))?;
            }
            Ok(())
        },
    )
}
pub fn read(
    root: &Path,
    artifact: &ArtifactInfo,
    offset: u64,
    length: usize,
) -> Result<ArtifactData> {
    if length == 0 || length > ARTIFACT_CHUNK_BYTES || offset > artifact.byte_length {
        return Err(EditorError::Invalid(
            "resource reads require 1–256 KiB and an offset within the artifact".into(),
        ));
    }
    let path = managed_directory(root, "artifacts")?.join(format!("{}.bin", artifact.id));
    let count = (artifact.byte_length - offset).min(length as u64) as usize;
    let mut bytes = vec![0u8; count];
    let before = path
        .symlink_metadata()
        .map_err(|error| crate::shared::storage(&path, error))?;
    if !before.is_file() || before.file_type().is_symlink() {
        return Err(EditorError::Invalid(
            "artifact is not a regular file".into(),
        ));
    }
    let stamp = crate::project::source_types::SourceStamp::from(&before);
    let expected = SourceVersion {
        sha256: artifact.sha256.clone(),
        byte_length: artifact.byte_length,
    };
    let cache = VERIFIED.get_or_init(Default::default);
    let verified = cache
        .lock()
        .map_err(|_| EditorError::Stopped)?
        .get(&path)
        .is_some_and(|(previous, identity)| previous == &stamp && identity == &expected);
    if !verified {
        if version(&path)? != expected {
            return Err(EditorError::Invalid(
                "artifact integrity check failed".into(),
            ));
        }
        let mut entries = cache.lock().map_err(|_| EditorError::Stopped)?;
        if entries.len() >= 1024 {
            entries.clear();
        }
        entries.insert(path.clone(), (stamp.clone(), expected));
    }
    let mut file = fs::File::open(&path).map_err(|e| crate::shared::storage(&path, e))?;
    file.seek(SeekFrom::Start(offset))
        .and_then(|_| file.read_exact(&mut bytes))
        .map_err(|e| crate::shared::storage(&path, e))?;
    if crate::project::source_types::SourceStamp::from(
        &file
            .metadata()
            .map_err(|error| crate::shared::storage(&path, error))?,
    ) != stamp
    {
        return Err(EditorError::Invalid(
            "artifact changed during its resource read".into(),
        ));
    }
    let end = offset + count as u64;
    Ok(ArtifactData {
        artifact_id: artifact.id,
        offset,
        byte_length: artifact.byte_length,
        data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        next: (end < artifact.byte_length).then_some(end),
    })
}
