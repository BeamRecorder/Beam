//! Bounded projections never return source paths or recording telemetry.
use super::types::Page;
use crate::{Document, EditorError, Result};
use uuid::Uuid;

pub const PAGE_LIMIT: usize = 256;

/// Placement/count pages read verified headers without materializing any FX page.
pub fn clip_headers(
    document: &Document,
    sequence: Uuid,
    offset: usize,
    limit: usize,
) -> Result<Page<crate::protocol::ClipOverview>> {
    let sequence = document
        .sequences
        .iter()
        .find(|value| value.id == sequence)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))?;
    let clips = &sequence.state.clips;
    if limit == 0 || limit > PAGE_LIMIT || offset > clips.len() {
        return Err(EditorError::Invalid(
            "page requires limit 1–256 and a valid offset".into(),
        ));
    }
    let items = clips
        .headers()
        .skip(offset)
        .take(limit)
        .map(|clip| {
            crate::commands::projections::validate_clip_header(
                &document.project.definitions,
                clip,
            )?;
            Ok(crate::protocol::ClipOverview::from_header(
                clip,
                &document.project.definitions,
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let end = offset.saturating_add(items.len());
    Ok(Page {
        revision: document.revision,
        total: clips.len(),
        next: (end < clips.len()).then_some(end),
        items,
    })
}
pub fn page<T: Clone>(
    revision: u64,
    collection: &[T],
    offset: usize,
    limit: usize,
) -> Result<Page<T>> {
    if limit == 0 || limit > PAGE_LIMIT || offset > collection.len() {
        return Err(EditorError::Invalid(
            "page requires limit 1–256 and a valid offset".into(),
        ));
    }
    let end = offset.saturating_add(limit).min(collection.len());
    Ok(Page {
        revision,
        items: collection[offset..end].to_vec(),
        next: (end < collection.len()).then_some(end),
        total: collection.len(),
    })
}
pub fn clips(
    document: &Document,
    sequence: Uuid,
    offset: usize,
    limit: usize,
) -> Result<Page<std::sync::Arc<crate::Clip>>> {
    let sequence = document
        .sequences
        .iter()
        .find(|s| s.id == sequence)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))?;
    if limit == 0 || limit > PAGE_LIMIT || offset > sequence.state.clips.len() {
        return Err(EditorError::Invalid(
            "page requires limit1–256 and a valid offset".into(),
        ));
    }
    let items = sequence.state.clips.try_page(offset, limit)?;
    let mut project = document.project.clone();
    sequence.state.clone().restore(&mut project);
    for clip in &items {
        crate::project::validation::clip(&project, clip)?;
    }
    let end = offset.saturating_add(items.len());
    Ok(Page {
        revision: document.revision,
        items,
        next: (end < sequence.state.clips.len()).then_some(end),
        total: sequence.state.clips.len(),
    })
}
pub fn clip(document: &Document, sequence: Uuid, id: Uuid) -> Result<std::sync::Arc<crate::Clip>> {
    let sequence = document
        .sequences
        .iter()
        .find(|value| value.id == sequence)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))?;
    let clip = sequence
        .state
        .clips
        .try_by_id(id)?
        .ok_or_else(|| EditorError::Invalid("missing clip".into()))?;
    let mut project = document.project.clone();
    sequence.state.clone().restore(&mut project);
    crate::project::validation::clip(&project, &clip)?;
    Ok(clip)
}
pub fn definitions(
    document: &Document,
    offset: usize,
    limit: usize,
) -> Result<Page<crate::effects::Definition>> {
    page(
        document.revision,
        &document.project.definitions,
        offset,
        limit,
    )
}

pub fn presets(
    document: &Document,
    offset: usize,
    limit: usize,
) -> Result<Page<crate::effects::preset_types::Preset>> {
    let page = page(document.revision, &document.project.presets, offset, limit)?;
    for preset in &page.items {
        preset.validate(&document.project.definitions)?;
    }
    Ok(page)
}

/// Timeline pages expose lane metadata and counts without loading parameters or keys.
pub fn tracks(
    document: &Document,
    sequence: Uuid,
    offset: usize,
    limit: usize,
) -> Result<Page<crate::protocol::TrackOverview>> {
    let sequence = document
        .sequences
        .iter()
        .find(|value| value.id == sequence)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))?;
    let tracks = &sequence.state.tracks;
    if limit == 0 || limit > PAGE_LIMIT || offset > tracks.len() {
        return Err(EditorError::Invalid(
            "page requires limit1–256 and a valid offset".into(),
        ));
    }
    let items = tracks
        .headers()
        .skip(offset)
        .take(limit)
        .map(|track| {
            crate::effects::scopes::validate_track_header(&document.project, track)?;
            Ok(crate::protocol::TrackOverview::from_header(
                track,
                &document.project.definitions,
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let end = offset.saturating_add(items.len());
    Ok(Page {
        revision: document.revision,
        total: tracks.len(),
        next: (end < tracks.len()).then_some(end),
        items,
    })
}

pub fn track(
    document: &Document,
    sequence: Uuid,
    id: Uuid,
) -> Result<std::sync::Arc<crate::Track>> {
    let sequence = document
        .sequences
        .iter()
        .find(|value| value.id == sequence)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))?;
    let track = sequence
        .state
        .tracks
        .try_by_id(id)?
        .ok_or_else(|| EditorError::Invalid("missing track".into()))?;
    crate::effects::scopes::validate_track(&document.project, &track)?;
    Ok(track)
}

pub fn sequence_instances(
    document: &Document,
    sequence: Uuid,
) -> Result<Vec<crate::effects::Instance>> {
    let sequence = document
        .sequences
        .iter()
        .find(|value| value.id == sequence)
        .ok_or_else(|| EditorError::Invalid("missing sequence".into()))?;
    crate::effects::scopes::validate_sequence(
        &document.project,
        &sequence.state.sequence_instances,
    )?;
    Ok(sequence.state.sequence_instances.clone())
}
