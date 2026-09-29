//! Mark checkpoints and job snapshots before sweeping unreachable immutable blocks.
use super::{block_types::*, blocks, gc_types::GarbageCollection, types::DOCUMENT_FILE};
use crate::{EditorError, Result};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, io::Read, path::Path};

pub(super) fn collect(root: &Path, pins: &[String]) -> Result<GarbageCollection> {
    let folder = blocks::directory(root, false)?;
    let mut live = HashSet::new();
    for name in [DOCUMENT_FILE, "editor.beam.previous.json"] {
        let path = root.join(name);
        match path.symlink_metadata() {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                let bytes = blocks::read_bytes(&path)?;
                let header: serde_json::Value = serde_json::from_slice(&bytes)?;
                if header.get("storageVersion").is_some() {
                    references(&serde_json::from_slice(&bytes)?, &mut live)?;
                } else {
                    super::migration::migrate(serde_json::from_slice(&bytes)?)?;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && name != DOCUMENT_FILE => {
            }
            Err(error) => return Err(crate::shared::storage(path, error)),
            _ => {
                return Err(EditorError::Invalid(
                    "checkpoint is not a regular file".into(),
                ));
            }
        }
    }
    for pin in pins {
        let index: DocumentIndex = blocks::get(root, pin)?;
        live.insert(pin.clone());
        references(&index, &mut live)?;
    }
    // Integrity is checked without deserializing potentially large FX payloads.
    // Any damaged live reference aborts before the first deletion.
    for hash in &live {
        verify(&folder, hash)?;
    }
    let mut obsolete = vec![];
    for entry in fs::read_dir(&folder).map_err(|error| crate::shared::storage(&folder, error))? {
        let entry = entry.map_err(|error| crate::shared::storage(&folder, error))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let hash = name.strip_suffix(".json").ok_or_else(|| {
            EditorError::Invalid("unknown entry in immutable block directory".into())
        })?;
        crate::collections::validate_hash(hash)?;
        let metadata = entry
            .path()
            .symlink_metadata()
            .map_err(|error| crate::shared::storage(entry.path(), error))?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(EditorError::Invalid(
                "immutable block is not a regular file".into(),
            ));
        }
        if !live.contains(hash) {
            obsolete.push((entry.path(), metadata.len()));
        }
    }
    let mut result = GarbageCollection {
        retained_blocks: live.len(),
        ..Default::default()
    };
    for (path, bytes) in obsolete {
        fs::remove_file(&path).map_err(|error| crate::shared::storage(&path, error))?;
        result.removed_blocks += 1;
        result.freed_bytes = result
            .freed_bytes
            .checked_add(bytes)
            .ok_or_else(|| EditorError::Invalid("garbage collection byte count overflow".into()))?;
    }
    if result.removed_blocks > 0 {
        match fs::File::open(&folder).and_then(|file| file.sync_all()) {
            Ok(()) => {}
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
                ) => {}
            Err(error) => return Err(crate::shared::storage(&folder, error)),
        }
    }
    Ok(result)
}
fn references(index: &DocumentIndex, live: &mut HashSet<String>) -> Result<()> {
    if !(1..=2).contains(&index.storage_version)
        || index.schema_version != super::types::DOCUMENT_VERSION
    {
        return Err(EditorError::Invalid(
            "cannot collect blocks for an unsupported checkpoint".into(),
        ));
    }
    live.extend(index.assets.iter().cloned());
    live.insert(index.definitions.clone());
    live.extend(index.presets.iter().cloned());
    live.extend(index.extension_packs.iter().cloned());
    for sequence in &index.sequences {
        sequence_references(sequence, live);
    }
    for action in index.project_undo.iter().chain(&index.project_redo) {
        if let ProjectActionIndex::InsertSequence { sequence, .. } = action {
            sequence_references(sequence, live);
        }
    }
    Ok(())
}
fn sequence_references(sequence: &SequenceIndex, live: &mut HashSet<String>) {
    for state in std::iter::once(&sequence.state)
        .chain(&sequence.undo)
        .chain(&sequence.redo)
    {
        collection_references(&state.clips, live);
        collection_references(&state.tracks, live);
        live.insert(state.transitions.clone());
        live.extend(state.sequence_instances.iter().cloned());
    }
}
fn collection_references(collection: &CollectionIndex, live: &mut HashSet<String>) {
    match collection {
        CollectionIndex::Paged(pages) => {
            for page in pages {
                live.insert(page.values.clone());
                live.insert(page.headers.clone());
            }
        }
        CollectionIndex::LegacyHash(hash) => {
            live.insert(hash.clone());
        }
        CollectionIndex::LegacyPages(hashes) => {
            live.extend(hashes.iter().cloned());
        }
    }
}
fn verify(folder: &Path, hash: &str) -> Result<()> {
    crate::collections::validate_hash(hash)?;
    let path = folder.join(format!("{hash}.json"));
    let metadata = path
        .symlink_metadata()
        .map_err(|error| crate::shared::storage(&path, error))?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() > MAX_BLOCK_BYTES as u64
    {
        return Err(EditorError::Invalid(
            "live immutable block is not a bounded regular file".into(),
        ));
    }
    let mut file = fs::File::open(&path)
        .map_err(|error| crate::shared::storage(&path, error))?
        .take(MAX_BLOCK_BYTES as u64 + 1);
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let length = file
            .read(&mut buffer)
            .map_err(|error| crate::shared::storage(&path, error))?;
        if length == 0 {
            break;
        }
        size += length as u64;
        digest.update(&buffer[..length]);
    }
    if size != metadata.len()
        || size > MAX_BLOCK_BYTES as u64
        || format!("{:x}", digest.finalize()) != hash
    {
        return Err(EditorError::Invalid(format!(
            "live block integrity failure: {hash}"
        )));
    }
    Ok(())
}
