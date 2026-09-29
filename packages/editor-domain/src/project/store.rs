//! Exclusive project ownership, bounded JSON reads, and atomic recovery checkpoints.
use super::{types::DOCUMENT_FILE, validation};
use crate::{Document, EditorError, Result};
use fs2::FileExt;
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    sync::Mutex,
};

pub struct ProjectStore {
    pub root: PathBuf,
    _lock: File,
    checkpoint: Mutex<Option<Vec<u8>>>,
    legacy_original: Mutex<Option<Vec<u8>>>,
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
            checkpoint: Mutex::new(None),
            legacy_original: Mutex::new(None),
        })
    }
    /// Loads a document, using the last valid checkpoint only when the current one is unreadable.
    /// The recovery flag must be surfaced to the user. Corrupt files are never replaced here.
    pub fn read(&self) -> Result<(Document, bool)> {
        let primary = self.root.join(DOCUMENT_FILE);
        match read_checkpoint(&primary) {
            Ok((value, bytes)) => {
                *self
                    .legacy_original
                    .lock()
                    .map_err(|_| EditorError::Stopped)? = super::legacy_backup::capture(&bytes)?;
                *self.checkpoint.lock().map_err(|_| EditorError::Stopped)? = Some(bytes);
                Ok((value, false))
            }
            Err(error @ EditorError::UnsupportedVersion(_)) => Err(error),
            Err(error) => match read_checkpoint(&self.root.join("editor.beam.previous.json")) {
                Ok((value, bytes)) => {
                    *self
                        .legacy_original
                        .lock()
                        .map_err(|_| EditorError::Stopped)? =
                        super::legacy_backup::capture(&bytes)?;
                    Ok((value, true))
                }
                Err(_) => Err(error),
            },
        }
    }
    /// Persists a complete project and history before publishing an edit to the UI.
    pub fn write(&self, document: &Document) -> Result<Document> {
        self.write_with_history_budget(document, super::history_budget_types::HISTORY_BYTES)
    }
    /// Returns the accepted document after retaining recent history within the byte budget.
    pub fn write_with_history_budget(&self, document: &Document, budget: u64) -> Result<Document> {
        validation::document(document)?;
        let mut index = super::blocks::index(&self.root, document)?;
        super::history_budget::retain(&self.root, &mut index, budget)?;
        let accepted = super::history_budget::apply(document, &index);
        validation::document(&accepted)?;
        let bytes = serde_json::to_vec(&index)?;
        if bytes.len() > super::block_types::MAX_BLOCK_BYTES {
            return Err(EditorError::Invalid(
                "project index exceeds message budget".into(),
            ));
        }
        let primary = self.root.join(DOCUMENT_FILE);
        let mut checkpoint = self.checkpoint.lock().map_err(|_| EditorError::Stopped)?;
        let mut original = self
            .legacy_original
            .lock()
            .map_err(|_| EditorError::Stopped)?;
        if let Some(bytes) = original.as_ref() {
            super::legacy_backup::preserve(&self.root, bytes)?;
        }
        if let Some(known) = checkpoint.as_ref()
            && let Ok(current) = super::blocks::read_bytes(&primary)
            && &current == known
        {
            beam_media_manifest::write_atomic(&self.root.join("editor.beam.previous.json"), known)
                .map_err(|e| EditorError::Invalid(e.to_string()))?;
        }
        beam_media_manifest::write_atomic(&primary, &bytes)
            .map_err(|e| EditorError::Invalid(e.to_string()))?;
        *checkpoint = Some(bytes);
        *original = None;
        Ok(accepted)
    }
    /// Caller holds the owner actor and supplies every durable job snapshot pin.
    pub fn garbage_collect(&self, pins: &[String]) -> Result<super::gc_types::GarbageCollection> {
        let checkpoint = self.checkpoint.lock().map_err(|_| EditorError::Stopped)?;
        let accepted = checkpoint.as_ref().ok_or_else(|| {
            EditorError::Invalid(
                "load or save the owner checkpoint before collecting blocks".into(),
            )
        })?;
        if &super::blocks::read_bytes(&self.root.join(DOCUMENT_FILE))? != accepted {
            return Err(EditorError::Invalid(
                "checkpoint changed outside the owner; reload before collecting blocks".into(),
            ));
        }
        super::gc::collect(&self.root, pins)
    }
}

/// Reads bounded document bytes and rejects unsupported schemas and invalid history.
pub fn read_document(path: &Path) -> Result<Document> {
    read_checkpoint(path).map(|(document, _)| document)
}
fn read_checkpoint(path: &Path) -> Result<(Document, Vec<u8>)> {
    let bytes = super::blocks::read_bytes(path)?;
    let header: serde_json::Value = serde_json::from_slice(&bytes)?;
    let version = header
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| EditorError::Invalid("document version is missing".into()))?;
    if version > u64::from(super::types::DOCUMENT_VERSION) {
        return Err(EditorError::UnsupportedVersion(version as u32));
    }
    let document = if header.get("storageVersion").is_some() {
        super::blocks::load(
            path.parent()
                .ok_or_else(|| EditorError::Invalid("project directory is missing".into()))?,
            serde_json::from_slice(&bytes)?,
        )
    } else {
        super::migration::migrate(serde_json::from_slice(&bytes)?)
    }?;
    Ok((document, bytes))
}
