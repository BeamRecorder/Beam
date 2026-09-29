//! Recovered metadata is checked before it can claim a render or an artifact.
use super::job_types::JobRecord;
use crate::{EditorError, Result};
use beam_editor_domain::protocol::{Container, JobKind, JobPhase, JobScope};
use std::collections::HashSet;

fn digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
pub fn record(record: &JobRecord) -> Result<()> {
    let info = &record.info;
    let context = &record.context;
    let invalid = || EditorError::Invalid("job metadata is inconsistent".into());
    if info.id.is_nil()
        || info.project_id.is_nil()
        || !super::job_context::valid_scope(&info.scope)
        || super::job_context::project(context) != info.project_id
        || super::job_context::scope(context) != info.scope
        || super::job_context::revision(context) != info.revision
        || super::job_context::key(context).is_empty()
        || super::job_context::key(context).len() > 128
        || super::job_context::key(context).contains('\0')
        || !digest(&record.fingerprint)
        || !info.progress.is_finite()
        || !(0.0..=1.0).contains(&info.progress)
        || info.snapshot_id.as_ref().is_some_and(|id| !digest(id))
    {
        return Err(invalid());
    }
    if let JobKind::Preview { time, .. } = &info.kind {
        time.validate()?;
        if time.ticks < 0 {
            return Err(invalid());
        }
    }
    if matches!(info.kind, JobKind::Analysis { .. } | JobKind::Proxy { .. })
        != matches!(info.scope, JobScope::Source { .. })
    {
        return Err(invalid());
    }
    if let JobKind::Import { source_count } = &info.kind {
        if *source_count == 0
            || *source_count > beam_editor_domain::commands::imports::IMPORT_SOURCE_LIMIT
        {
            return Err(invalid());
        }
        if let Some(publication) = &record.import_publication {
            let beam_editor_domain::protocol::JobContext::Sequence { context } = &record.context
            else {
                return Err(invalid());
            };
            if publication.project_id != context.project_id
                || publication.sequence_id != context.sequence_id
                || publication.idempotency_key != context.idempotency_key
                || context.expected_revision.checked_add(1) != Some(publication.revision)
                || publication.asset_ids.len() != *source_count
                || publication.clip_ids.len() != *source_count
                || info.source_versions.len() != *source_count
                || !digest(&publication.fingerprint)
            {
                return Err(invalid());
            }
            let mut identities = HashSet::new();
            if publication
                .asset_ids
                .iter()
                .chain(&publication.clip_ids)
                .any(|id| id.is_nil() || !identities.insert(*id))
            {
                return Err(invalid());
            }
            let sources = publication
                .asset_ids
                .iter()
                .map(|id| {
                    let version = info.source_versions.get(id).ok_or_else(invalid)?;
                    Ok(beam_editor_domain::project::types::SourceIdentity {
                        sha256: version.sha256.clone(),
                        byte_length: version.byte_length,
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            if beam_editor_domain::commands::imports::fingerprint(context, &sources)?
                != publication.fingerprint
            {
                return Err(invalid());
            }
        } else if info.phase == JobPhase::Completed || !info.source_versions.is_empty() {
            return Err(invalid());
        }
        if info.phase == JobPhase::Queued && record.import_publication.is_some() {
            return Err(invalid());
        }
    } else if record.import_publication.is_some() {
        return Err(invalid());
    }
    if let JobKind::Proxy { settings } = &info.kind {
        settings.frame_rate.time_at_frame(0)?;
        if settings.width < 16
            || settings.height < 16
            || settings.width > 4096
            || settings.height > 4096
        {
            return Err(invalid());
        }
    }
    for (id, version) in &info.source_versions {
        if id.is_nil() || version.byte_length == 0 || !digest(&version.sha256) {
            return Err(invalid());
        }
    }
    if let JobScope::Source { asset_id } = info.scope
        && matches!(info.phase, JobPhase::Rendering | JobPhase::Completed)
        && (info.source_versions.len() != 1 || !info.source_versions.contains_key(&asset_id))
    {
        return Err(invalid());
    }
    let valid_phase = match info.phase {
        JobPhase::Queued => {
            info.progress == 0.0
                && info.snapshot_id.is_none()
                && info.source_versions.is_empty()
                && info.error.is_none()
        }
        JobPhase::Rendering => info.snapshot_id.is_some() && info.error.is_none(),
        JobPhase::Completed => {
            info.progress == 1.0
                && info.snapshot_id.is_some()
                && info.error.is_none()
                && !record.artifacts.is_empty()
        }
        JobPhase::Cancelled => info.error.is_none(),
        JobPhase::Failed => info
            .error
            .as_ref()
            .is_some_and(|error| !error.trim().is_empty()),
    };
    if !valid_phase
        || (info.phase != JobPhase::Completed && !record.artifacts.is_empty())
        || info.artifacts
            != record
                .artifacts
                .iter()
                .map(|artifact| artifact.id)
                .collect::<Vec<_>>()
    {
        return Err(invalid());
    }
    let mime_type = match info.kind {
        JobKind::Preview { .. } => "image/png",
        JobKind::Export {
            container: Container::Mp4,
        } => "video/mp4",
        JobKind::Export {
            container: Container::Webm,
        } => "video/webm",
        JobKind::Analysis { .. } => "application/json",
        JobKind::Import { .. } => "application/json",
        JobKind::Proxy { ref settings } => match settings.container {
            Container::Mp4 => "video/mp4",
            Container::Webm => "video/webm",
        },
    };
    let mut identities = HashSet::new();
    for artifact in &record.artifacts {
        if artifact.id.is_nil()
            || !identities.insert(artifact.id)
            || artifact.job_id != info.id
            || artifact.name.is_empty()
            || artifact.name.len() > 255
            || artifact.name.contains(['\0', '/', '\\'])
            || artifact.mime_type != mime_type
            || artifact.byte_length == 0
            || if matches!(info.kind, JobKind::Analysis { .. } | JobKind::Import { .. }) {
                artifact.width != 0 || artifact.height != 0
            } else {
                artifact.width == 0 || artifact.height == 0
            }
            || !digest(&artifact.sha256)
        {
            return Err(invalid());
        }
    }
    Ok(())
}
