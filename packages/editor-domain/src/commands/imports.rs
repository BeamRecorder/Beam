//! Source preflight, durable retry and one undoable publication; no filesystem access.
use super::import_types::{ImportFingerprint, ImportPublication, PreparedImport};
use crate::{
    Document, Edit, EditorError, MediaAsset, Result, TrackKind, project::types::SourceIdentity,
    protocol::RenderContext,
};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use uuid::Uuid;

pub const IMPORT_SOURCE_LIMIT: usize = 32;
pub const IMPORT_RETENTION: usize = 128;

pub fn fingerprint(context: &RenderContext, sources: &[SourceIdentity]) -> Result<String> {
    if context.project_id.is_nil()
        || context.sequence_id.is_nil()
        || context.idempotency_key.is_empty()
        || context.idempotency_key.len() > 128
        || context.idempotency_key.contains('\0')
        || sources.is_empty()
        || sources.len() > IMPORT_SOURCE_LIMIT
    {
        return invalid("import requires explicit revision context and 1–32 source identities");
    }
    for source in sources {
        source.validate()?;
    }
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&ImportFingerprint { context, sources })?)
    ))
}

/// Check this with real source digests before creating managed copies or probing media.
pub fn replay(
    document: &Document,
    context: &RenderContext,
    sources: &[SourceIdentity],
) -> Result<Option<ImportPublication>> {
    let digest = fingerprint(context, sources)?;
    validate(document)?;
    if context.project_id != document.project.id {
        return invalid("import project identity differs");
    }
    if let Some(publication) = document
        .import_publications
        .iter()
        .find(|p| p.idempotency_key == context.idempotency_key)
    {
        return if publication.fingerprint == digest {
            Ok(Some(publication.clone()))
        } else {
            invalid("idempotency key was reused for a different import")
        };
    }
    if document
        .receipts
        .iter()
        .any(|r| r.idempotency_key == context.idempotency_key)
    {
        return invalid("idempotency key already belongs to an edit or source version publication");
    }
    if document.revision != context.expected_revision {
        return Err(EditorError::Conflict {
            expected: context.expected_revision,
            actual: document.revision,
        });
    }
    if !document
        .sequences
        .iter()
        .any(|s| s.id == context.sequence_id)
    {
        return invalid("missing import sequence");
    }
    Ok(None)
}

/// Host-supplied assets must already be verified immutable managed copies.
pub fn prepare(
    document: &Document,
    context: &RenderContext,
    assets: Vec<MediaAsset>,
) -> Result<PreparedImport> {
    let identities = assets
        .iter()
        .map(|asset| {
            asset.identity.clone().ok_or_else(|| {
                EditorError::Invalid("import source has no immutable identity".into())
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let digest = fingerprint(context, &identities)?;
    if let Some(publication) = replay(document, context, &identities)? {
        return Ok(PreparedImport {
            document: document.clone(),
            publication,
            replay: true,
        });
    }
    let mut next = document.clone();
    focus(&mut next, context.sequence_id)?;
    let mut project = next.project.clone();
    let mut asset_ids = vec![];
    let mut clip_ids = vec![];
    for asset in assets {
        if asset.id.is_nil() || project.assets.iter().any(|a| a.id == asset.id) {
            return invalid("each imported source requires a distinct non-nil asset UUID");
        }
        let kind = if asset.has_video {
            TrackKind::Video
        } else {
            TrackKind::Audio
        };
        let track = project
            .tracks
            .headers()
            .find(|t| t.kind == kind)
            .ok_or_else(|| EditorError::Invalid("add a compatible lane before importing".into()))?
            .id;
        let start_ms = project
            .clips
            .headers()
            .filter(|c| c.track_id == track)
            .map(|c| {
                c.start_ms
                    .checked_add(c.duration_ms)
                    .ok_or_else(|| EditorError::Invalid("import timeline overflow".into()))
            })
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .max()
            .unwrap_or(0);
        if project.assets.is_empty() && asset.has_video {
            project.canvas = crate::Canvas::from_source(asset.width, asset.height);
        }
        let asset_id = asset.id;
        project.assets.push(asset);
        project = crate::timeline::edit::apply_unvalidated(
            &project,
            &Edit::Insert {
                asset_id,
                track_id: track,
                start_ms,
            },
        )?;
        let clip_id = project
            .clips
            .headers()
            .last()
            .ok_or_else(|| EditorError::Invalid("import did not create its clip".into()))?
            .id;
        asset_ids.push(asset_id);
        clip_ids.push(clip_id);
    }
    next = crate::timeline::history::replaced(&next, project)?;
    let publication = ImportPublication {
        project_id: context.project_id,
        sequence_id: context.sequence_id,
        revision: next.revision,
        idempotency_key: context.idempotency_key.clone(),
        fingerprint: digest,
        asset_ids,
        clip_ids,
    };
    next.import_publications.push(publication.clone());
    if next.import_publications.len() > IMPORT_RETENTION {
        next.import_publications.remove(0);
    }
    super::events::record_import(&mut next)?;
    focus(&mut next, document.active_sequence)?;
    validate(&next)?;
    crate::project::validation::document(&next)?;
    Ok(PreparedImport {
        document: next,
        publication,
        replay: false,
    })
}

/// Historical IDs may have since been deleted; their publication still identifies the retry.
pub fn validate(document: &Document) -> Result<()> {
    if document.import_publications.len() > IMPORT_RETENTION {
        return invalid("import publication retention exceeds 128");
    }
    let mut revision = 0;
    let mut keys = HashSet::new();
    for publication in &document.import_publications {
        let ids: Vec<_> = publication
            .asset_ids
            .iter()
            .chain(&publication.clip_ids)
            .collect();
        if publication.project_id != document.project.id
            || publication.sequence_id.is_nil()
            || publication.revision <= revision
            || publication.revision > document.revision
            || publication.idempotency_key.is_empty()
            || publication.idempotency_key.len() > 128
            || publication.idempotency_key.contains('\0')
            || !keys.insert(&publication.idempotency_key)
            || document
                .receipts
                .iter()
                .any(|r| r.idempotency_key == publication.idempotency_key)
            || publication.fingerprint.len() != 64
            || !publication
                .fingerprint
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
            || publication.asset_ids.is_empty()
            || publication.asset_ids.len() > IMPORT_SOURCE_LIMIT
            || publication.asset_ids.len() != publication.clip_ids.len()
            || ids.iter().any(|id| id.is_nil())
            || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        {
            return invalid("invalid import publication identity, order or source IDs");
        }
        revision = publication.revision;
    }
    Ok(())
}

fn focus(document: &mut Document, sequence_id: Uuid) -> Result<()> {
    crate::timeline::sequences::synchronize(document);
    if document.active_sequence == sequence_id {
        return Ok(());
    }
    let sequence = document
        .sequences
        .iter()
        .find(|s| s.id == sequence_id)
        .ok_or_else(|| EditorError::Invalid("missing import sequence".into()))?;
    sequence.state.clone().restore(&mut document.project);
    document.undo = sequence.undo.clone();
    document.redo = sequence.redo.clone();
    document.active_sequence = sequence_id;
    Ok(())
}
fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}
