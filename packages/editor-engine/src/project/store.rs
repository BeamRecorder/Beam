//! Exclusive project ownership, bounded JSON reads, and atomic recovery checkpoints.
use super::{types::DOCUMENT_FILE, validation};
use crate::{Document, EditorError, Result};
use fs2::FileExt;
use std::{
    fs::{self, File, OpenOptions},
    io::Read,
    path::{Path, PathBuf},
};

const MAX_DOCUMENT_BYTES: u64 = 64 * 1024 * 1024;
pub struct ProjectStore {
    pub root: PathBuf,
    _lock: File,
}

impl ProjectStore {
    /// Locks a project directory. A second editor fails visibly rather than overwriting it.
    pub fn lock(root: &Path) -> Result<Self> {
        fs::create_dir_all(root).map_err(|e| crate::shared::storage(root, e))?;
        let path = root.join(".editor.lock");
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|e| crate::shared::storage(&path, e))?;
        lock.try_lock_exclusive()
            .map_err(|e| crate::shared::storage(path, e))?;
        Ok(Self {
            root: root.to_owned(),
            _lock: lock,
        })
    }
    /// Loads a document, using the last valid checkpoint only when the current one is unreadable.
    /// The recovery flag must be surfaced to the user. Corrupt files are never replaced here.
    pub fn read(&self) -> Result<(Document, bool)> {
        let primary = self.root.join(DOCUMENT_FILE);
        match read_document(&primary) {
            Ok(value) => Ok((value, false)),
            Err(error) => match read_document(&self.root.join("editor.beam.previous.json")) {
                Ok(value) => Ok((value, true)),
                Err(_) => Err(error),
            },
        }
    }
    /// Persists a complete project and history before publishing an edit to the UI.
    pub fn write(&self, document: &Document) -> Result<()> {
        validation::document(document)?;
        let bytes = serde_json::to_vec(document)?;
        if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
            return Err(EditorError::Invalid("project file exceeds 64 MiB".into()));
        }
        let primary = self.root.join(DOCUMENT_FILE);
        if let Ok(old) = read_document(&primary) {
            beam_media_manifest::write_atomic(
                &self.root.join("editor.beam.previous.json"),
                &serde_json::to_vec(&old)?,
            )
            .map_err(|e| EditorError::Invalid(e.to_string()))?;
        }
        beam_media_manifest::write_atomic(&primary, &bytes)
            .map_err(|e| EditorError::Invalid(e.to_string()))
    }
}

/// Reads bounded document bytes and rejects unsupported schemas and invalid history.
pub fn read_document(path: &Path) -> Result<Document> {
    let file = File::open(path).map_err(|e| crate::shared::storage(path, e))?;
    let mut bytes = Vec::new();
    file.take(MAX_DOCUMENT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| crate::shared::storage(path, e))?;
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err(EditorError::Invalid("project file exceeds 64 MiB".into()));
    }
    let mut value: Document = serde_json::from_slice(&bytes)?;
    validation::document(&value)?;
    crate::timeline::sequences::synchronize(&mut value);
    validation::document(&value)?;
    Ok(value)
}
