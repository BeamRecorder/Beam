//! Immutable decision pages with integrity checks and atomic manifest publication.
use super::{block_types::*, types::*};
use crate::{EditorError, Result};
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub fn directory(root: &Path, create: bool) -> Result<PathBuf> {
    let editor = root.join(".editor");
    let folder = editor.join("blocks");
    for path in [&editor, &folder] {
        match path.symlink_metadata() {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Err(error) if create && error.kind() == std::io::ErrorKind::NotFound => {
                if let Err(error) = fs::create_dir(path)
                    && error.kind() != std::io::ErrorKind::AlreadyExists
                {
                    return Err(crate::shared::storage(path, error));
                }
                let metadata = path
                    .symlink_metadata()
                    .map_err(|error| crate::shared::storage(path, error))?;
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err(EditorError::Invalid(
                        "immutable block directory is not a regular directory".into(),
                    ));
                }
            }
            Err(error) => return Err(crate::shared::storage(path, error)),
            _ => {
                return Err(EditorError::Invalid(
                    "immutable block directory is not a directory or is a symlink".into(),
                ));
            }
        }
    }
    Ok(folder)
}

pub fn put<T: Serialize + ?Sized>(root: &Path, value: &T) -> Result<String> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() > MAX_BLOCK_BYTES {
        return Err(EditorError::Invalid(
            "decision block exceeds 64 MiB; split the request".into(),
        ));
    }
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let folder = directory(root, true)?;
    let path = folder.join(format!("{hash}.json"));
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| !metadata.is_file() || metadata.file_type().is_symlink())
    {
        return Err(EditorError::Invalid(
            "immutable block is not a regular file".into(),
        ));
    }
    if !path.exists() {
        beam_media_manifest::write_atomic(&path, &bytes)
            .map_err(|e| EditorError::Invalid(e.to_string()))?;
    } else {
        // Never accept a tampered block merely because its filename matches.
        let existing = read_bytes(&path)?;
        if existing != bytes {
            return Err(EditorError::Invalid(format!(
                "immutable block {hash} was modified"
            )));
        }
    }
    Ok(hash)
}
pub fn get<T: DeserializeOwned>(root: &Path, hash: &str) -> Result<T> {
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        return Err(EditorError::Invalid("invalid block reference".into()));
    }
    let path = directory(root, false)?.join(format!("{hash}.json"));
    let metadata = path
        .symlink_metadata()
        .map_err(|error| crate::shared::storage(&path, error))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(EditorError::Invalid(
            "immutable block is not a regular file".into(),
        ));
    }
    let canonical = super::validation::source_path(root, &format!(".editor/blocks/{hash}.json"))?;
    let bytes = read_bytes(&canonical)?;
    if format!("{:x}", Sha256::digest(&bytes)) != hash {
        return Err(EditorError::Invalid(format!(
            "block integrity failure: {}",
            path.display()
        )));
    }
    Ok(serde_json::from_slice(&bytes)?)
}
pub fn index(root: &Path, document: &Document) -> Result<DocumentIndex> {
    crate::commands::events::validate(document)?;
    crate::commands::imports::validate(document)?;
    for asset in &document.project.assets {
        asset
            .identity
            .as_ref()
            .ok_or_else(|| {
                EditorError::Invalid(format!(
                    "asset {} has no immutable source identity",
                    asset.id
                ))
            })?
            .validate()?;
    }
    let sequences = document
        .sequences
        .iter()
        .map(|s| store_sequence(root, s))
        .collect::<Result<_>>()?;
    Ok(DocumentIndex {
        storage_version: 2,
        schema_version: DOCUMENT_VERSION,
        revision: document.revision,
        project_undo: document
            .project_undo
            .iter()
            .map(|a| store_action(root, a))
            .collect::<Result<_>>()?,
        project_redo: document
            .project_redo
            .iter()
            .map(|a| store_action(root, a))
            .collect::<Result<_>>()?,
        project_id: document.project.id,
        project_name: document.project.name.clone(),
        assets: document
            .project
            .assets
            .iter()
            .map(|asset| put(root, asset))
            .collect::<Result<_>>()?,
        definitions: put(root, &document.project.definitions)?,
        presets: Some(put(root, &document.project.presets)?),
        extension_packs: Some(put(root, &document.project.extension_packs)?),
        warnings: document.project.warnings.clone(),
        active_sequence: document.active_sequence,
        sequences,
        receipts: document.receipts.clone(),
        import_publications: document.import_publications.clone(),
        event_journal: document.event_journal.clone(),
    })
}
pub fn load(root: &Path, index: DocumentIndex) -> Result<Document> {
    if !(1..=2).contains(&index.storage_version) {
        return Err(EditorError::UnsupportedVersion(index.storage_version));
    }
    if index.schema_version != DOCUMENT_VERSION {
        return Err(EditorError::UnsupportedVersion(index.schema_version));
    }
    let cache = BlockCache::default();
    let legacy = index.storage_version == 1;
    let mut project = Project::new(index.project_name);
    project.id = index.project_id;
    project.assets = index
        .assets
        .iter()
        .map(|hash| get(root, hash))
        .collect::<Result<_>>()?;
    for asset in &project.assets {
        match &asset.identity {
            Some(identity) => identity.validate()?,
            None if !legacy => {
                return Err(EditorError::Invalid(format!(
                    "asset {} has no immutable source identity",
                    asset.id
                )));
            }
            None => {}
        }
    }
    project.definitions = get(root, &index.definitions)?;
    project.presets = match &index.presets {
        Some(hash) => get(root, hash)?,
        None => vec![],
    };
    project.extension_packs = match &index.extension_packs {
        Some(hash) => get(root, hash)?,
        None => vec![],
    };
    project.warnings = index.warnings;
    let sequences: Vec<_> = index
        .sequences
        .into_iter()
        .map(|s| load_sequence_cached(root, s, &cache, legacy))
        .collect::<Result<_>>()?;
    let active = sequences
        .iter()
        .find(|s| s.id == index.active_sequence)
        .ok_or_else(|| EditorError::Invalid("active sequence is missing".into()))?;
    active.state.clone().restore(&mut project);
    let event_journal = index.event_journal.unwrap_or_else(|| {
        crate::commands::event_types::EventJournal::from_receipts(index.revision, &index.receipts)
    });
    let document = Document {
        schema_version: DOCUMENT_VERSION,
        revision: index.revision,
        project,
        project_undo: index
            .project_undo
            .into_iter()
            .map(|a| load_action(root, a, &cache, legacy))
            .collect::<Result<_>>()?,
        project_redo: index
            .project_redo
            .into_iter()
            .map(|a| load_action(root, a, &cache, legacy))
            .collect::<Result<_>>()?,
        undo: active.undo.clone(),
        redo: active.redo.clone(),
        active_sequence: index.active_sequence,
        sequences,
        receipts: index.receipts,
        import_publications: index.import_publications,
        event_journal: Some(event_journal),
    };
    crate::commands::events::validate(&document)?;
    crate::commands::imports::validate(&document)?;
    super::validation::document(&document)?;
    Ok(document)
}
pub fn store_sequence(
    root: &Path,
    s: &crate::timeline::sequence_types::Sequence,
) -> Result<SequenceIndex> {
    Ok(SequenceIndex {
        id: s.id,
        name: s.name.clone(),
        state: store_state(root, &s.state)?,
        undo: s
            .undo
            .iter()
            .map(|state| store_state(root, state))
            .collect::<Result<_>>()?,
        redo: s
            .redo
            .iter()
            .map(|state| store_state(root, state))
            .collect::<Result<_>>()?,
    })
}
pub fn load_sequence(
    root: &Path,
    s: SequenceIndex,
) -> Result<crate::timeline::sequence_types::Sequence> {
    load_sequence_cached(root, s, &BlockCache::default(), true)
}
fn load_sequence_cached(
    root: &Path,
    s: SequenceIndex,
    cache: &BlockCache,
    legacy: bool,
) -> Result<crate::timeline::sequence_types::Sequence> {
    Ok(crate::timeline::sequence_types::Sequence {
        id: s.id,
        name: s.name,
        state: load_state_cached(root, &s.state, cache, legacy)?,
        undo: s
            .undo
            .iter()
            .map(|state| load_state_cached(root, state, cache, legacy))
            .collect::<Result<_>>()?,
        redo: s
            .redo
            .iter()
            .map(|state| load_state_cached(root, state, cache, legacy))
            .collect::<Result<_>>()?,
    })
}
fn store_action(
    root: &Path,
    action: &crate::timeline::project_history_types::ProjectAction,
) -> Result<ProjectActionIndex> {
    use crate::timeline::project_history_types::ProjectAction as A;
    Ok(match action {
        A::Rename { name } => ProjectActionIndex::Rename { name: name.clone() },
        A::RenameSequence { id, name } => ProjectActionIndex::RenameSequence {
            id: *id,
            name: name.clone(),
        },
        A::RemoveSequence { id } => ProjectActionIndex::RemoveSequence { id: *id },
        A::InsertSequence {
            sequence,
            index,
            active,
        } => ProjectActionIndex::InsertSequence {
            sequence: Box::new(store_sequence(root, sequence)?),
            index: *index,
            active: *active,
        },
    })
}
fn load_action(
    root: &Path,
    action: ProjectActionIndex,
    cache: &BlockCache,
    legacy: bool,
) -> Result<crate::timeline::project_history_types::ProjectAction> {
    use crate::timeline::project_history_types::ProjectAction as A;
    Ok(match action {
        ProjectActionIndex::Rename { name } => A::Rename { name },
        ProjectActionIndex::RenameSequence { id, name } => A::RenameSequence { id, name },
        ProjectActionIndex::RemoveSequence { id } => A::RemoveSequence { id },
        ProjectActionIndex::InsertSequence {
            sequence,
            index,
            active,
        } => A::InsertSequence {
            sequence: Box::new(load_sequence_cached(root, *sequence, cache, legacy)?),
            index,
            active,
        },
    })
}
pub fn store_state(root: &Path, state: &EditState) -> Result<StateIndex> {
    Ok(StateIndex {
        recording_style: state.recording_style.clone(),
        name: state.name.clone(),
        canvas: state.canvas.clone(),
        tracks: CollectionIndex::Paged(super::collection_blocks::store(root, &state.tracks)?),
        clips: CollectionIndex::Paged(super::collection_blocks::store(root, &state.clips)?),
        transitions: put(root, &state.transitions)?,
        sequence_instances: Some(put(root, &state.sequence_instances)?),
    })
}
pub fn load_state(root: &Path, state: &StateIndex) -> Result<EditState> {
    load_state_cached(root, state, &BlockCache::default(), true)
}
fn load_state_cached(
    root: &Path,
    state: &StateIndex,
    cache: &BlockCache,
    legacy: bool,
) -> Result<EditState> {
    Ok(EditState {
        recording_style: state.recording_style.clone(),
        name: state.name.clone(),
        canvas: state.canvas.clone(),
        tracks: load_collection(root, &state.tracks, &cache.tracks, legacy)?,
        clips: load_collection(root, &state.clips, &cache.clips, legacy)?,
        transitions: get(root, &state.transitions)?,
        sequence_instances: match &state.sequence_instances {
            Some(hash) => get(root, hash)?,
            None => vec![],
        },
    })
}
fn load_collection<T: crate::collections::PersistentItem>(
    root: &Path,
    index: &CollectionIndex,
    cache: &crate::collections::PageCache<T>,
    legacy: bool,
) -> Result<crate::collections::PersistentCollection<T>> {
    match index {
        CollectionIndex::Paged(references) => {
            super::collection_blocks::load(root, references, cache)
        }
        _ if !legacy => Err(EditorError::Invalid(
            "storage version2 requires paged decision/header references".into(),
        )),
        CollectionIndex::LegacyHash(hash) => get::<Vec<T>>(root, hash).map(Into::into),
        CollectionIndex::LegacyPages(hashes) => {
            let mut values = vec![];
            for hash in hashes {
                values.extend(get::<Vec<T>>(root, hash)?);
            }
            Ok(values.into())
        }
    }
}
pub fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|e| crate::shared::storage(path, e))?
        .take(MAX_BLOCK_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| crate::shared::storage(path, e))?;
    if bytes.len() > MAX_BLOCK_BYTES {
        return Err(EditorError::Invalid(
            "message/index/block exceeds 64 MiB".into(),
        ));
    }
    Ok(bytes)
}
