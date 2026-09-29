//! Scoped mutations acquire exactly one lane guard or the selected sequence stack.
use super::{
    operations::resolve,
    scope_types::{ScopeAddress, ScopedAction},
    types::CommandResult,
};
use crate::{Document, EditorError, Result, effects::ScopeTarget};

pub(super) fn apply(
    document: &mut Document,
    target: &ScopeAddress,
    action: &ScopedAction,
    results: &[CommandResult],
) -> Result<()> {
    let catalog = document.project.definitions.clone();
    match target {
        ScopeAddress::Track { track } => {
            let id = resolve(track, results)?;
            let mut track = document
                .project
                .tracks
                .try_by_id_mut(id)?
                .ok_or_else(|| invalid("missing effect target track"))?;
            let kind = track.kind;
            super::scoped_actions::apply(&mut track.instances, action, &catalog, results)?;
            crate::effects::scopes::validate_instances(
                &catalog,
                &track.instances,
                ScopeTarget::Track,
                Some(kind),
            )?;
        }
        ScopeAddress::Sequence { sequence_id } => {
            if sequence_id.is_nil() || *sequence_id != document.active_sequence {
                return Err(invalid(
                    "effect target differs from the transaction sequence",
                ));
            }
            super::scoped_actions::apply(
                &mut document.project.sequence_instances,
                action,
                &catalog,
                results,
            )?;
            crate::effects::scopes::validate_sequence(
                &document.project,
                &document.project.sequence_instances,
            )?;
        }
    }
    Ok(())
}

fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
