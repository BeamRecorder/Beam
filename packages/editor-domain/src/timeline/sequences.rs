//! Atomic sequence selection and independent bounded undo/redo histories.
use super::sequence_types::Sequence;
use crate::{Document, Edit, EditState, EditorError, Project, Result};

/// Migrates a single-timeline document and checkpoints the active sequence.
pub fn synchronize(document: &mut Document) {
    if document.sequences.is_empty() {
        document.active_sequence = document.project.id;
        document.sequences.push(Sequence {
            id: document.active_sequence,
            name: "Timeline 1".into(),
            state: EditState::capture(&document.project),
            undo: document.undo.clone(),
            redo: document.redo.clone(),
        });
    }
    if let Some(sequence) = document
        .sequences
        .iter_mut()
        .find(|s| s.id == document.active_sequence)
    {
        sequence.state = EditState::capture(&document.project);
        sequence.undo = document.undo.clone();
        sequence.redo = document.redo.clone();
    }
}

/// Handles sequence commands without inserting a sequence switch into clip history.
pub fn edited(document: &Document, edit: &Edit) -> Result<Option<Document>> {
    if !matches!(
        edit,
        Edit::AddSequence { .. }
            | Edit::DuplicateSequence { .. }
            | Edit::SelectSequence { .. }
            | Edit::RenameSequence { .. }
            | Edit::RemoveSequence { .. }
    ) {
        return Ok(None);
    }
    let mut next = document.clone();
    synchronize(&mut next);
    match edit {
        Edit::DuplicateSequence { id, name } => {
            valid_name(name)?;
            let mut sequence = next
                .sequences
                .iter()
                .find(|s| s.id == *id)
                .cloned()
                .ok_or_else(|| EditorError::Invalid("missing timeline".into()))?;
            sequence.id = uuid::Uuid::new_v4();
            sequence.name = name.trim().into();
            sequence.undo.clear();
            sequence.redo.clear();
            let mut ids = std::collections::HashMap::new();
            let mut links = std::collections::HashMap::new();
            let mut tracks = std::collections::HashMap::new();
            let track_ids = sequence
                .state
                .tracks
                .headers()
                .map(|track| track.id)
                .collect::<Vec<_>>();
            for id in track_ids {
                let mut track = sequence
                    .state
                    .tracks
                    .try_by_id_mut(id)?
                    .ok_or_else(|| EditorError::Invalid("missing duplicated track".into()))?;
                let new_id = uuid::Uuid::new_v4();
                tracks.insert(track.id, new_id);
                track.id = new_id;
                track.instances = track
                    .instances
                    .iter()
                    .map(crate::effects::Instance::duplicate)
                    .collect();
            }
            sequence.state.sequence_instances = sequence
                .state
                .sequence_instances
                .iter()
                .map(crate::effects::Instance::duplicate)
                .collect();
            let selected = sequence
                .state
                .clips
                .headers()
                .map(|clip| clip.id)
                .collect::<Vec<_>>();
            for id in selected {
                let mut clip = sequence
                    .state
                    .clips
                    .try_by_id_mut(id)?
                    .ok_or_else(|| EditorError::Invalid("missing duplicated clip".into()))?;
                let new_id = uuid::Uuid::new_v4();
                ids.insert(clip.id, new_id);
                clip.id = new_id;
                clip.track_id = *tracks
                    .get(&clip.track_id)
                    .ok_or_else(|| EditorError::Invalid("missing duplicated clip lane".into()))?;
                clip.instances = clip
                    .instances
                    .iter()
                    .map(crate::effects::Instance::duplicate)
                    .collect();
                clip.generator = clip
                    .generator
                    .as_ref()
                    .map(crate::effects::Instance::duplicate);
                clip.link_group = clip
                    .link_group
                    .map(|id| *links.entry(id).or_insert_with(uuid::Uuid::new_v4));
            }
            for transition in &mut sequence.state.transitions {
                transition.instance = transition.instance.duplicate();
                transition.from_clip = ids[&transition.from_clip];
                transition.to_clip = ids[&transition.to_clip];
            }
            let new_id = sequence.id;
            next.sequences.push(sequence);
            select(&mut next, new_id)?;
        }
        Edit::AddSequence { name } => {
            valid_name(name)?;
            let mut empty = Project::new(next.project.name.clone());
            empty.canvas = next.project.canvas.clone();
            let id = uuid::Uuid::new_v4();
            next.sequences.push(Sequence {
                id,
                name: name.trim().into(),
                state: EditState::capture(&empty),
                undo: vec![],
                redo: vec![],
            });
            select(&mut next, id)?;
        }
        Edit::SelectSequence { id } => {
            if *id == next.active_sequence {
                return Ok(Some(next));
            }
            select(&mut next, *id)?;
        }
        Edit::RenameSequence { id, name } => {
            valid_name(name)?;
            next.sequences
                .iter_mut()
                .find(|s| s.id == *id)
                .ok_or_else(|| EditorError::Invalid("missing timeline".into()))?
                .name = name.trim().into();
        }
        Edit::RemoveSequence { id } => {
            if next.sequences.len() == 1 {
                return invalid("keep at least one timeline");
            }
            let index = next
                .sequences
                .iter()
                .position(|s| s.id == *id)
                .ok_or_else(|| EditorError::Invalid("missing timeline".into()))?;
            next.sequences.remove(index);
            if *id == next.active_sequence {
                let target = next.sequences[index.saturating_sub(1)].id;
                select(&mut next, target)?;
            }
        }
        _ => unreachable!(),
    }
    next.revision = next
        .revision
        .checked_add(1)
        .ok_or_else(|| EditorError::Invalid("revision overflow".into()))?;
    synchronize(&mut next);
    crate::project::validation::document(&next)?;
    Ok(Some(next))
}

fn select(document: &mut Document, id: uuid::Uuid) -> Result<()> {
    let sequence = document
        .sequences
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| EditorError::Invalid("missing timeline".into()))?;
    let mut state = sequence.state.clone();
    // The project title belongs to the shared library, not to a selected sequence.
    state.name = document.project.name.clone();
    state.restore(&mut document.project);
    document.undo = sequence.undo.clone();
    document.redo = sequence.redo.clone();
    document.active_sequence = id;
    Ok(())
}

/// Checks every saved timeline and its history against the shared source library.
pub fn validate(document: &Document) -> Result<()> {
    if document.sequences.is_empty() {
        return Ok(());
    }
    if !document
        .sequences
        .iter()
        .any(|s| s.id == document.active_sequence)
    {
        return invalid("invalid active timeline or timeline capacity");
    }
    let mut ids = std::collections::HashSet::new();
    let active = document
        .sequences
        .iter()
        .find(|s| s.id == document.active_sequence)
        .expect("validated active sequence");
    if active.state != EditState::capture(&document.project)
        || active.undo != document.undo
        || active.redo != document.redo
    {
        return invalid("active timeline checkpoint differs from the document");
    }
    for sequence in &document.sequences {
        valid_name(&sequence.name)?;
        if sequence.id.is_nil()
            || !ids.insert(sequence.id)
            || sequence.undo.len() + sequence.redo.len() >= 50
        {
            return invalid("invalid timeline identifier or history");
        }
        for state in std::iter::once(&sequence.state)
            .chain(&sequence.undo)
            .chain(&sequence.redo)
        {
            let mut project = document.project.clone();
            state.clone().restore(&mut project);
            crate::project::validation::project(&project)?;
        }
    }
    Ok(())
}

fn valid_name(name: &str) -> Result<()> {
    if name.trim().is_empty() || name.len() > 128 || name.contains('\0') {
        return invalid("timeline name must contain 1–128 bytes");
    }
    Ok(())
}
fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}
