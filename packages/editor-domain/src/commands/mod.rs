//! Atomic batches, optimistic revisions, dry-run and retry after lost responses.
pub mod asset_types;
pub mod assets;
mod created;
mod created_types;
pub mod event_types;
pub mod events;
pub mod import_types;
pub mod imports;
mod instance_types;
mod instances;
pub mod operations;
mod parameters;
pub mod paste;
pub mod presets;
pub mod projections;
pub mod query;
pub mod scope_types;
mod scoped_actions;
mod scopes;
pub mod source_jobs;
pub mod types;
use crate::{Document, Edit, EditState, EditorError, Result};
use sha2::{Digest, Sha256};
use types::*;

pub const MAX_COMMANDS: usize = 512;
pub const RECEIPT_RETENTION: usize = 128;

/// Prepares a complete candidate. Publishing disk/render state belongs to the owner.
pub fn prepare(document: &Document, request: &Transaction) -> Result<Prepared> {
    if document
        .import_publications
        .iter()
        .any(|p| p.idempotency_key == request.idempotency_key)
    {
        return Err(EditorError::Invalid(
            "idempotency key already belongs to an import publication".into(),
        ));
    }
    let fingerprint = format!("{:x}", Sha256::digest(serde_json::to_vec(request)?));
    if let Some(receipt) = document
        .receipts
        .iter()
        .find(|r| r.idempotency_key == request.idempotency_key)
    {
        if receipt.fingerprint != fingerprint {
            return Err(EditorError::Invalid(
                "idempotency key was reused for a different transaction".into(),
            ));
        }
        return Ok(Prepared {
            document: document.clone(),
            receipt: receipt.clone(),
            replay: true,
            change: Change {
                revision: document.revision,
                sequence_id: request.sequence_id,
                parameter_only: true,
                affected_clips: vec![],
            },
        });
    }
    if request.api_version != 1 || request.project_id != document.project.id {
        return Err(EditorError::Invalid(
            "API version or project identity differs".into(),
        ));
    }
    if request.expected_revision != document.revision {
        return Err(EditorError::Conflict {
            expected: request.expected_revision,
            actual: document.revision,
        });
    }
    if request.commands.is_empty()
        || request.commands.len() > MAX_COMMANDS
        || request.idempotency_key.is_empty()
        || request.idempotency_key.len() > 128
    {
        return Err(EditorError::Invalid(
            "transaction requires 1–512 commands and a bounded idempotency key".into(),
        ));
    }
    let mut next = document.clone();
    let project_command = request.commands.iter().any(|c| matches!(&c.operation,Operation::Edit {edit} if crate::timeline::project_history::is_project_edit(edit) || matches!(edit,Edit::SelectSequence {..})));
    if project_command && request.commands.len() != 1 {
        return Err(EditorError::Invalid(
            "project metadata and selection commands require a standalone transaction".into(),
        ));
    }
    crate::timeline::sequences::synchronize(&mut next);
    if next.active_sequence != request.sequence_id {
        next = crate::timeline::history::edited(
            &next,
            &Edit::SelectSequence {
                id: request.sequence_id,
            },
        )?;
    }
    let base = next.clone();
    let mut results = Vec::with_capacity(request.commands.len());
    let mut ids = std::collections::HashSet::new();
    for command in &request.commands {
        if command.command_id.is_empty()
            || command.command_id.len() > 128
            || !ids.insert(&command.command_id)
        {
            return Err(EditorError::Invalid(
                "command IDs must be unique and bounded".into(),
            ));
        }
        let created = operations::apply(&mut next, document, &command.operation, &results)?;
        results.push(CommandResult {
            command_id: command.command_id.clone(),
            created,
        });
    }
    let history_command = request.commands.iter().any(|c| {
        matches!(
            &c.operation,
            Operation::Edit {
                edit: Edit::Undo {} | Edit::Redo {}
            }
        )
    });
    if history_command && request.commands.len() != 1 {
        return Err(EditorError::Invalid(
            "undo/redo must be standalone transactions".into(),
        ));
    }
    if !history_command && !project_command && next.project != base.project {
        next.undo = base.undo.clone();
        next.undo.push(EditState::capture(&base.project));
        next.redo.clear();
        if next.undo.len() >= crate::project::types::HISTORY_LIMIT {
            next.undo.remove(0);
        }
    }
    crate::timeline::sequences::synchronize(&mut next);
    let selects_sequence = project_command;
    if !selects_sequence && next.active_sequence != document.active_sequence {
        next = crate::timeline::history::edited(
            &next,
            &Edit::SelectSequence {
                id: document.active_sequence,
            },
        )?;
    }
    next.revision = document
        .revision
        .checked_add(1)
        .ok_or_else(|| EditorError::Invalid("revision overflow".into()))?;
    let receipt = Receipt {
        sequence_id: request.sequence_id,
        idempotency_key: request.idempotency_key.clone(),
        fingerprint,
        revision: next.revision,
        results,
    };
    events::record_transaction(&mut next, &receipt)?;
    next.receipts.push(receipt.clone());
    if next.receipts.len() > RECEIPT_RETENTION {
        next.receipts.remove(0);
    }
    crate::project::validation::document(&next)?;
    let change = changes(document, &next, request.sequence_id)?;
    Ok(Prepared {
        document: next,
        receipt,
        change,
        replay: false,
    })
}

pub fn single(document: &Document, edit: Edit) -> Transaction {
    Transaction {
        api_version: 1,
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: uuid::Uuid::new_v4().to_string(),
        commands: vec![Command {
            command_id: "edit".into(),
            operation: Operation::Edit { edit },
        }],
    }
}
fn changes(before: &Document, after: &Document, sequence_id: uuid::Uuid) -> Result<Change> {
    let old = before.sequences.iter().find(|s| s.id == sequence_id);
    let new = after.sequences.iter().find(|s| s.id == sequence_id);
    let mut parameter_only = before.active_sequence == after.active_sequence
        && before.project.canvas == after.project.canvas
        && before.project.definitions == after.project.definitions;
    let mut affected = vec![];
    if let (Some(old), Some(new)) = (old, new) {
        parameter_only &= old.state.tracks == new.state.tracks
            && old.state.sequence_instances == new.state.sequence_instances
            && old.state.transitions == new.state.transitions
            && old.state.clips.len() == new.state.clips.len();
        affected = new.state.clips.try_changed_ids(&old.state.clips)?;
        for id in &affected {
            match (
                old.state.clips.try_header_by_id(*id)?,
                new.state.clips.try_header_by_id(*id)?,
            ) {
                (Some(prior), Some(clip)) => {
                    parameter_only &= prior.asset_id == clip.asset_id
                        && prior.track_id == clip.track_id
                        && prior.start_ms == clip.start_ms
                        && prior.source_in_ms == clip.source_in_ms
                        && prior.duration_ms == clip.duration_ms
                        && prior.rate == clip.rate
                        && prior.animation_offset_ms == clip.animation_offset_ms
                        && prior
                            .instances
                            .iter()
                            .map(|i| (&i.definition_id, i.definition_version, i.id))
                            .eq(clip
                                .instances
                                .iter()
                                .map(|i| (&i.definition_id, i.definition_version, i.id)))
                        && prior.generator == clip.generator
                        && prior.title == clip.title;
                }
                _ => parameter_only = false,
            }
        }
    } else {
        parameter_only = false;
    }
    Ok(Change {
        revision: after.revision,
        sequence_id,
        parameter_only,
        affected_clips: affected,
    })
}
