//! Persistent history bounded to 50 states, including the current document.
use crate::project::types::HISTORY_LIMIT;
use crate::{Document, Edit, EditState, EditorError, Project, Result};

/// Prepares one undoable document transition without mutating the current state.
pub fn edited(document: &Document, edit: &Edit) -> Result<Document> {
    if let Some(next) = super::sequences::edited(document, edit)? {
        return Ok(next);
    }
    let mut next = document.clone();
    match edit {
        Edit::Undo {} => {
            let state = next
                .undo
                .pop()
                .ok_or_else(|| EditorError::Invalid("nothing to undo".into()))?;
            next.redo.push(EditState::capture(&next.project));
            state.restore(&mut next.project);
        }
        Edit::Redo {} => {
            let state = next
                .redo
                .pop()
                .ok_or_else(|| EditorError::Invalid("nothing to redo".into()))?;
            next.undo.push(EditState::capture(&next.project));
            state.restore(&mut next.project);
        }
        _ => return replaced(document, super::edit::apply(&document.project, edit)?),
    }
    next.revision = next
        .revision
        .checked_add(1)
        .ok_or_else(|| EditorError::Invalid("revision overflow".into()))?;
    super::sequences::synchronize(&mut next);
    crate::project::validation::document(&next)?;
    Ok(next)
}

/// Records a media import or another fully validated project replacement.
pub fn replaced(document: &Document, project: Project) -> Result<Document> {
    crate::project::validation::project(&project)?;
    if project == document.project {
        return Ok(document.clone());
    }
    let mut next = document.clone();
    next.undo.push(EditState::capture(&next.project));
    next.project = project;
    next.redo.clear();
    if next.undo.len() >= HISTORY_LIMIT {
        next.undo.remove(0);
    }
    next.revision = next
        .revision
        .checked_add(1)
        .ok_or_else(|| EditorError::Invalid("revision overflow".into()))?;
    super::sequences::synchronize(&mut next);
    Ok(next)
}
