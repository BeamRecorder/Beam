//! Retention counts unique historical decision blocks without loading any FX payload.
use super::{block_types::*, blocks, history_budget_types::Stack};
use crate::{Document, EditorError, Result};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

pub(super) fn retain(root: &Path, index: &mut DocumentIndex, budget: u64) -> Result<()> {
    let mut lengths = HashMap::new();
    while bytes(root, index, &mut lengths)? > budget {
        let Some(stack) = oldest_stack(index) else {
            return Err(EditorError::Invalid(
                "history budget cannot retain its current state".into(),
            ));
        };
        match stack {
            Stack::SequenceUndo(sequence) => {
                index.sequences[sequence].undo.remove(0);
            }
            Stack::SequenceRedo(sequence) => {
                index.sequences[sequence].redo.remove(0);
            }
            Stack::ProjectUndo => {
                index.project_undo.remove(0);
            }
            Stack::ProjectRedo => {
                index.project_redo.remove(0);
            }
        }
    }
    Ok(())
}
pub(super) fn apply(document: &Document, index: &DocumentIndex) -> Document {
    let mut accepted = document.clone();
    for (sequence, retained) in accepted.sequences.iter_mut().zip(&index.sequences) {
        sequence
            .undo
            .drain(..sequence.undo.len() - retained.undo.len());
        sequence
            .redo
            .drain(..sequence.redo.len() - retained.redo.len());
    }
    accepted
        .project_undo
        .drain(..accepted.project_undo.len() - index.project_undo.len());
    accepted
        .project_redo
        .drain(..accepted.project_redo.len() - index.project_redo.len());
    if let Some(sequence) = accepted
        .sequences
        .iter()
        .find(|sequence| sequence.id == accepted.active_sequence)
    {
        accepted.undo = sequence.undo.clone();
        accepted.redo = sequence.redo.clone();
    }
    accepted
}
fn oldest_stack(index: &DocumentIndex) -> Option<Stack> {
    let undo = index
        .sequences
        .iter()
        .enumerate()
        .map(|(i, sequence)| (sequence.undo.len(), Stack::SequenceUndo(i)))
        .chain(std::iter::once((
            index.project_undo.len(),
            Stack::ProjectUndo,
        )))
        .filter(|(len, _)| *len > 0)
        .max_by_key(|(len, _)| *len);
    undo.or_else(|| {
        index
            .sequences
            .iter()
            .enumerate()
            .map(|(i, sequence)| (sequence.redo.len(), Stack::SequenceRedo(i)))
            .chain(std::iter::once((
                index.project_redo.len(),
                Stack::ProjectRedo,
            )))
            .filter(|(len, _)| *len > 0)
            .max_by_key(|(len, _)| *len)
    })
    .map(|(_, stack)| stack)
}
fn bytes(root: &Path, index: &DocumentIndex, lengths: &mut HashMap<String, u64>) -> Result<u64> {
    let mut current = HashSet::new();
    for sequence in &index.sequences {
        state(&sequence.state, &mut current);
    }
    let mut historical = HashSet::new();
    let mut metadata = 0u64;
    for sequence in &index.sequences {
        for saved in sequence.undo.iter().chain(&sequence.redo) {
            state(saved, &mut historical);
            metadata = add(metadata, serde_json::to_vec(saved)?.len() as u64)?;
        }
    }
    for action in index.project_undo.iter().chain(&index.project_redo) {
        metadata = add(metadata, serde_json::to_vec(action)?.len() as u64)?;
        if let ProjectActionIndex::InsertSequence { sequence, .. } = action {
            for saved in std::iter::once(&sequence.state)
                .chain(&sequence.undo)
                .chain(&sequence.redo)
            {
                state(saved, &mut historical);
            }
        }
    }
    for hash in historical.difference(&current) {
        let length = if let Some(length) = lengths.get(hash) {
            *length
        } else {
            crate::collections::validate_hash(hash)?;
            let path = blocks::directory(root, false)?.join(format!("{hash}.json"));
            let file = fs::symlink_metadata(&path)
                .map_err(|error| crate::shared::storage(&path, error))?;
            if !file.is_file()
                || file.file_type().is_symlink()
                || file.len() > MAX_BLOCK_BYTES as u64
            {
                return Err(EditorError::Invalid(
                    "history decision block is not a bounded regular file".into(),
                ));
            }
            lengths.insert(hash.clone(), file.len());
            file.len()
        };
        metadata = add(metadata, length)?;
    }
    Ok(metadata)
}
fn state(value: &StateIndex, hashes: &mut HashSet<String>) {
    collection(&value.clips, hashes);
    collection(&value.tracks, hashes);
    hashes.insert(value.transitions.clone());
    if let Some(hash) = &value.sequence_instances {
        hashes.insert(hash.clone());
    }
}
fn collection(value: &CollectionIndex, hashes: &mut HashSet<String>) {
    match value {
        CollectionIndex::Paged(pages) => {
            for page in pages {
                hashes.insert(page.values.clone());
                hashes.insert(page.headers.clone());
            }
        }
        CollectionIndex::LegacyHash(hash) => {
            hashes.insert(hash.clone());
        }
        CollectionIndex::LegacyPages(pages) => {
            hashes.extend(pages.iter().cloned());
        }
    }
}
fn add(left: u64, right: u64) -> Result<u64> {
    left.checked_add(right)
        .ok_or_else(|| EditorError::Invalid("history byte count overflow".into()))
}
