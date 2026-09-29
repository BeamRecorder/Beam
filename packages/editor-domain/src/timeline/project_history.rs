//! Reversible project operations retain deleted sequences without undoing clip edits.
use super::project_history_types::ProjectAction;
use crate::{Document, Edit, EditorError, Result};
pub fn is_project_edit(edit: &Edit) -> bool {
    matches!(
        edit,
        Edit::AddSequence { .. }
            | Edit::DuplicateSequence { .. }
            | Edit::RemoveSequence { .. }
            | Edit::RenameSequence { .. }
            | Edit::Rename { .. }
            | Edit::UndoProject {}
            | Edit::RedoProject {}
    )
}
pub fn edit(document: &Document, edit: &Edit) -> Result<Document> {
    let mut next = document.clone();
    super::sequences::synchronize(&mut next);
    match edit {
        Edit::UndoProject {} => {
            let action = next
                .project_undo
                .pop()
                .ok_or_else(|| invalid("nothing to undo in project history"))?;
            let reverse = apply(&mut next, action)?;
            next.project_redo.push(reverse);
        }
        Edit::RedoProject {} => {
            let action = next
                .project_redo
                .pop()
                .ok_or_else(|| invalid("nothing to redo in project history"))?;
            let reverse = apply(&mut next, action)?;
            next.project_undo.push(reverse);
        }
        Edit::Rename { name } => {
            let reverse = apply(
                &mut next,
                ProjectAction::Rename {
                    name: name.trim().into(),
                },
            )?;
            next.project_undo.push(reverse);
            next.project_redo.clear();
        }
        _ => {
            let before_ids: std::collections::HashSet<_> =
                next.sequences.iter().map(|s| s.id).collect();
            let before = next.clone();
            next = super::sequences::edited(&next, edit)?
                .ok_or_else(|| invalid("not a project edit"))?;
            let action = match edit {
                Edit::AddSequence { .. } | Edit::DuplicateSequence { .. } => {
                    ProjectAction::RemoveSequence {
                        id: next
                            .sequences
                            .iter()
                            .find(|s| !before_ids.contains(&s.id))
                            .ok_or_else(|| invalid("sequence was not created"))?
                            .id,
                    }
                }
                Edit::RemoveSequence { id } => {
                    let index = before
                        .sequences
                        .iter()
                        .position(|s| s.id == *id)
                        .ok_or_else(|| invalid("missing sequence"))?;
                    ProjectAction::InsertSequence {
                        sequence: Box::new(before.sequences[index].clone()),
                        index,
                        active: before.active_sequence,
                    }
                }
                Edit::RenameSequence { id, .. } => ProjectAction::RenameSequence {
                    id: *id,
                    name: before
                        .sequences
                        .iter()
                        .find(|s| s.id == *id)
                        .ok_or_else(|| invalid("missing sequence"))?
                        .name
                        .clone(),
                },
                _ => return Err(invalid("not a project edit")),
            };
            next.project_undo.push(action);
            next.project_redo.clear();
        }
    }
    if next.project_undo.len() >= crate::project::types::HISTORY_LIMIT {
        next.project_undo.remove(0);
    }
    super::sequences::synchronize(&mut next);
    Ok(next)
}
fn apply(document: &mut Document, action: ProjectAction) -> Result<ProjectAction> {
    match action {
        ProjectAction::Rename { name } => {
            let previous = std::mem::replace(&mut document.project.name, name);
            for sequence in &mut document.sequences {
                sequence.state.name = document.project.name.clone();
            }
            Ok(ProjectAction::Rename { name: previous })
        }
        ProjectAction::RenameSequence { id, name } => {
            let sequence = document
                .sequences
                .iter_mut()
                .find(|s| s.id == id)
                .ok_or_else(|| invalid("missing sequence for history"))?;
            Ok(ProjectAction::RenameSequence {
                id,
                name: std::mem::replace(&mut sequence.name, name),
            })
        }
        ProjectAction::RemoveSequence { id } => {
            let index = document
                .sequences
                .iter()
                .position(|s| s.id == id)
                .ok_or_else(|| invalid("missing sequence for history"))?;
            if document.sequences.len() == 1 {
                return Err(invalid("keep at least one sequence"));
            }
            let active = document.active_sequence;
            let sequence = document.sequences.remove(index);
            if active == id {
                select(document, document.sequences[index.saturating_sub(1)].id)?;
            }
            Ok(ProjectAction::InsertSequence {
                sequence: Box::new(sequence),
                index,
                active,
            })
        }
        ProjectAction::InsertSequence {
            sequence,
            index,
            active,
        } => {
            if document.sequences.iter().any(|s| s.id == sequence.id) {
                return Err(invalid("sequence history identity already exists"));
            }
            let id = sequence.id;
            document
                .sequences
                .insert(index.min(document.sequences.len()), *sequence);
            if document.sequences.iter().any(|s| s.id == active) {
                select(document, active)?;
            }
            Ok(ProjectAction::RemoveSequence { id })
        }
    }
}
fn select(document: &mut Document, id: uuid::Uuid) -> Result<()> {
    let sequence = document
        .sequences
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| invalid("missing sequence"))?;
    let mut state = sequence.state.clone();
    state.name = document.project.name.clone();
    state.restore(&mut document.project);
    document.undo = sequence.undo.clone();
    document.redo = sequence.redo.clone();
    document.active_sequence = id;
    Ok(())
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
