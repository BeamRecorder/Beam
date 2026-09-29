//! Source versions are immutable assets; only explicit sequence clips change their reference.
use super::{
    asset_types::RelinkFingerprint,
    types::{Change, Command, Operation, Prepared, Receipt, Transaction},
};
use crate::{
    Document, EditorError, MediaAsset, Project, Result, project::types::SourceIdentity,
    protocol::RenderContext,
};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use uuid::Uuid;

fn fingerprint(
    context: &RenderContext,
    previous: Uuid,
    clips: &[Uuid],
    identity: &SourceIdentity,
) -> Result<String> {
    identity.validate()?;
    if context.project_id.is_nil()
        || context.sequence_id.is_nil()
        || previous.is_nil()
        || context.idempotency_key.is_empty()
        || context.idempotency_key.len() > 128
        || context.idempotency_key.contains('\0')
        || clips.is_empty()
        || clips.len() > super::MAX_COMMANDS
        || clips.iter().any(Uuid::is_nil)
        || clips.iter().collect::<HashSet<_>>().len() != clips.len()
    {
        return invalid("relink requires explicit, distinct clip IDs and bounded revision context");
    }
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&RelinkFingerprint {
            context,
            previous_asset_id: previous,
            clip_ids: clips,
            source_identity: identity
        })?)
    ))
}

/// Native owner hashes its authorized source before copying; durable retries create no orphan copy.
pub fn replay_relink(
    document: &Document,
    context: &RenderContext,
    previous: Uuid,
    clips: &[Uuid],
    identity: &SourceIdentity,
) -> Result<Option<Receipt>> {
    let fingerprint = fingerprint(context, previous, clips, identity)?;
    if context.project_id != document.project.id {
        return invalid("relink project identity differs");
    }
    if document
        .import_publications
        .iter()
        .any(|p| p.idempotency_key == context.idempotency_key)
    {
        return invalid("idempotency key already belongs to an import publication");
    }
    if let Some(receipt) = document
        .receipts
        .iter()
        .find(|receipt| receipt.idempotency_key == context.idempotency_key)
    {
        return if receipt.fingerprint == fingerprint {
            Ok(Some(receipt.clone()))
        } else {
            invalid("idempotency key was reused for a different source publication")
        };
    }
    if context.expected_revision != document.revision {
        return Err(EditorError::Conflict {
            expected: context.expected_revision,
            actual: document.revision,
        });
    }
    let sequence = document
        .sequences
        .iter()
        .find(|sequence| sequence.id == context.sequence_id)
        .ok_or_else(|| EditorError::Invalid("missing relink sequence".into()))?;
    if !document
        .project
        .assets
        .iter()
        .any(|asset| asset.id == previous)
    {
        return invalid("missing previous source version");
    }
    check_targets(&sequence.state.clips, previous, clips)?;
    Ok(None)
}

/// Prepares one undoable retarget after the host creates a verified, managed source copy.
pub fn prepare_relink(
    document: &Document,
    context: &RenderContext,
    previous: Uuid,
    clips: &[Uuid],
    mut asset: MediaAsset,
) -> Result<Prepared> {
    let identity = asset
        .identity
        .as_ref()
        .ok_or_else(|| EditorError::Invalid("relink source has no immutable identity".into()))?;
    let fingerprint = fingerprint(context, previous, clips, identity)?;
    if let Some(receipt) = replay_relink(document, context, previous, clips, identity)? {
        return Ok(Prepared {
            document: document.clone(),
            receipt,
            replay: true,
            change: Change {
                revision: document.revision,
                sequence_id: context.sequence_id,
                parameter_only: false,
                affected_clips: vec![],
            },
        });
    }
    let old = document
        .project
        .assets
        .iter()
        .find(|value| value.id == previous)
        .ok_or_else(|| EditorError::Invalid("missing previous source version".into()))?;
    if asset.id.is_nil()
        || document
            .project
            .assets
            .iter()
            .any(|existing| existing.id == asset.id)
    {
        return invalid("new source version requires a distinct asset UUID");
    }
    if old.identity.as_ref() == Some(identity) {
        asset.recording = old.recording;
        asset.cursor_mode = old.cursor_mode;
        asset.cursor = old.cursor.clone();
        asset.zooms = old.zooms.clone();
    } else if asset.cursor_mode == crate::recording::style_types::CursorMode::Unknown {
        asset.cursor_mode = crate::recording::style_types::CursorMode::Absent;
    }
    let asset_id = asset.id;
    let mut candidate = document.clone();
    candidate.project.assets.push(asset);
    let transaction = Transaction {
        api_version: crate::protocol::API_VERSION,
        project_id: context.project_id,
        sequence_id: context.sequence_id,
        expected_revision: context.expected_revision,
        idempotency_key: context.idempotency_key.clone(),
        commands: vec![Command {
            command_id: "relink".into(),
            operation: Operation::AssetRetarget {
                asset_id,
                previous_asset_id: previous,
                clip_ids: clips.to_vec(),
            },
        }],
    };
    let mut prepared = super::prepare(&candidate, &transaction)?;
    prepared.receipt.fingerprint = fingerprint;
    let result = prepared.receipt.results.first_mut().ok_or_else(|| {
        EditorError::Invalid("relink publication lacks its command result".into())
    })?;
    result.created.insert(0, asset_id);
    let durable = prepared
        .document
        .receipts
        .iter_mut()
        .find(|receipt| receipt.idempotency_key == context.idempotency_key)
        .ok_or_else(|| {
            EditorError::Invalid("relink publication lacks its durable receipt".into())
        })?;
    *durable = prepared.receipt.clone();
    Ok(prepared)
}

pub fn retarget(project: &mut Project, previous: Uuid, asset: Uuid, clips: &[Uuid]) -> Result<()> {
    if asset == previous || !project.assets.iter().any(|value| value.id == asset) {
        return invalid("retarget requires a different authorized source version");
    }
    check_targets(&project.clips, previous, clips)?;
    let mut candidate = project.clone();
    for id in clips {
        candidate
            .clips
            .try_by_id_mut(*id)?
            .ok_or_else(|| EditorError::Invalid("missing relink clip".into()))?
            .asset_id = asset;
    }
    crate::project::validation::project(&candidate)?;
    *project = candidate;
    Ok(())
}

fn check_targets(
    collection: &crate::collections::PersistentCollection<crate::Clip>,
    previous: Uuid,
    clips: &[Uuid],
) -> Result<()> {
    let selected: HashSet<_> = clips.iter().copied().collect();
    if clips.is_empty() || clips.len() > super::MAX_COMMANDS || selected.len() != clips.len() {
        return invalid("relink clip IDs must be explicit and distinct");
    }
    let mut groups = HashSet::new();
    for id in clips {
        let clip = collection
            .try_header_by_id(*id)?
            .ok_or_else(|| EditorError::Invalid("missing relink clip".into()))?;
        if clip.asset_id != previous || clip.generator.is_some() || clip.title.is_some() {
            return invalid("relink target does not use the previous media source");
        }
        if let Some(group) = clip.link_group {
            groups.insert(group);
        }
    }
    if collection.headers().any(|clip| {
        clip.link_group.is_some_and(|group| groups.contains(&group)) && !selected.contains(&clip.id)
    }) {
        return invalid("relink must explicitly include every clip in each linked group");
    }
    Ok(())
}

fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}
