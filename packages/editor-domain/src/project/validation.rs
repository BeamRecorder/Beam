//! Bounded validation for disk documents, UI commands, and relative media paths.
use super::types::{DOCUMENT_VERSION, HISTORY_LIMIT, MAX_DURATION_MS};
use crate::{Document, EditorError, Project, Result, TrackKind};
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
};

/// Validates schema, history, identifiers, timing, and all referenced asset bounds.
pub fn document(document: &Document) -> Result<()> {
    if document.schema_version != DOCUMENT_VERSION {
        return invalid("unsupported document version");
    }
    crate::commands::events::validate(document)?;
    crate::commands::imports::validate(document)?;
    if document.undo.len() + document.redo.len() >= HISTORY_LIMIT {
        return invalid("history exceeds 50 states");
    }
    if document.project_undo.len() + document.project_redo.len() >= HISTORY_LIMIT {
        return invalid("project history exceeds 50 states");
    }
    for action in document.project_undo.iter().chain(&document.project_redo) {
        if let crate::timeline::project_history_types::ProjectAction::InsertSequence {
            sequence,
            ..
        } = action
        {
            for state in std::iter::once(&sequence.state)
                .chain(&sequence.undo)
                .chain(&sequence.redo)
            {
                let mut restored = document.project.clone();
                state.clone().restore(&mut restored);
                project(&restored)?;
            }
        }
    }
    project(&document.project)?;
    for state in document.undo.iter().chain(&document.redo) {
        let mut restored = document.project.clone();
        state.clone().restore(&mut restored);
        project(&restored)?;
    }
    crate::timeline::sequences::validate(document)?;
    Ok(())
}

/// Checks invariants before an edit or media pipeline can replace the current one.
pub fn project(project: &Project) -> Result<()> {
    metadata(project)?;
    for item in project.tracks.try_dirty_items() {
        let track = item?;
        crate::effects::scopes::validate_track(project, &track)?;
    }
    for item in project.clips.try_dirty_items() {
        let item = item?;
        clip(project, &item)?;
    }
    Ok(())
}
fn metadata(project: &Project) -> Result<()> {
    project.tracks.validate_index()?;
    project.tracks.validate_identities()?;
    project.clips.validate_index()?;
    project.clips.validate_identities()?;
    let context = super::validation_context::key(project)?;
    project
        .clips
        .try_validate_headers(&context, || validate_metadata(project))
}
fn validate_metadata(project: &Project) -> Result<()> {
    crate::timeline::links::validate(project)?;
    crate::effects::presets::validate_catalog(&project.presets, &project.definitions)?;
    crate::effects::pack::validate_provenance(project)?;
    name(&project.name)?;
    project.recording_style.validate()?;
    crate::effects::scopes::validate_sequence(project, &project.sequence_instances)?;
    let canvas = &project.canvas;
    if !(16..=4096).contains(&canvas.width)
        || !(16..=4096).contains(&canvas.height)
        || canvas.fps == 0
        || canvas.fps_denominator == 0
        || u64::from(canvas.fps) > 240 * u64::from(canvas.fps_denominator)
    {
        return invalid(
            "canvas must be 16–4096 pixels and a positive frame rate no greater than 240 fps",
        );
    }
    let mut ids = HashSet::new();
    if project.id.is_nil()
        || project.clips.identity_count(project.id) > 0
        || project.tracks.identity_count(project.id) > 0
    {
        return invalid("project ID must be non-nil and distinct from decisions");
    }
    ids.insert(project.id);
    let assets: std::collections::HashMap<_, _> =
        project.assets.iter().map(|a| (a.id, a)).collect();
    let tracks: std::collections::HashMap<_, _> =
        project.tracks.headers().map(|t| (t.id, t)).collect();
    let mut definitions = HashSet::new();
    for definition in &project.definitions {
        definition.validate()?;
        if !definitions.insert((&definition.id, definition.version)) {
            return invalid("duplicate definition version");
        }
    }
    let mut intervals: std::collections::HashMap<uuid::Uuid, Vec<(u64, u64)>> =
        std::collections::HashMap::new();
    for asset in &project.assets {
        if asset.id.is_nil()
            || !ids.insert(asset.id)
            || project.clips.identity_count(asset.id) > 0
            || project.tracks.identity_count(asset.id) > 0
            || asset.duration_ms == 0
            || asset.duration_ms > MAX_DURATION_MS
        {
            return invalid("invalid or duplicate media asset");
        }
        if let Some(identity) = &asset.identity {
            identity.validate()?;
        }
        name(&asset.name)?;
        relative_path(&asset.path)?;
        if !asset.has_video && !asset.has_audio {
            return invalid("asset contains no media");
        }
        if asset.has_video
            && (asset.width == 0
                || asset.height == 0
                || asset.width > 16384
                || asset.height > 16384)
        {
            return invalid("invalid media dimensions");
        }
        if asset.cursor.len() > 216_000 || asset.zooms.len() > 4096 {
            return invalid("cursor data exceeds limits");
        }
        let mut last = 0;
        for sample in asset.cursor.iter() {
            if sample.time_ms < last
                || sample.time_ms > asset.duration_ms
                || !unit(sample.cx)
                || !unit(sample.cy)
            {
                return invalid("invalid cursor data");
            }
            last = sample.time_ms;
        }
        for zoom in asset.zooms.iter() {
            if zoom.start_ms >= zoom.end_ms
                || zoom.end_ms > asset.duration_ms
                || !unit(zoom.cx)
                || !unit(zoom.cy)
                || !zoom.scale.is_finite()
                || !(1.0..=5.0).contains(&zoom.scale)
            {
                return invalid("invalid zoom interval");
            }
        }
    }
    for track in project.tracks.headers() {
        crate::effects::scopes::validate_track_header(project, track)?;
        super::validation_ids::track(project, track, &mut ids)?;
    }
    super::validation_ids::sequence(project, &mut ids)?;
    for clip in project.clips.headers() {
        if clip.id == project.id {
            return invalid("clip ID collides with project ID");
        }
        let asset = assets.get(&clip.asset_id).copied();
        let track = tracks
            .get(&clip.track_id)
            .copied()
            .ok_or_else(|| EditorError::Invalid("missing clip lane".into()))?;
        if let Some(title) = &clip.title {
            if !clip.asset_id.is_nil()
                || title.text.trim().is_empty()
                || title.text.len() > 4096
                || title.text.contains('\0')
                || title.font.trim().is_empty()
                || title.font.len() > 128
                || title.font.contains(['\0', '\n'])
                || !bounded(title.size, 0.1, 30.)
            {
                return invalid("invalid generated title");
            }
        } else if let Some(generator) = &clip.generator {
            if !clip.asset_id.is_nil()
                || crate::effects::definition(
                    &project.definitions,
                    &generator.definition_id,
                    generator.definition_version,
                )?
                .domain
                    != crate::effects::Domain::Generator
            {
                return invalid("invalid generator definition");
            }
        } else if asset.is_none() {
            return invalid("missing clip asset");
        }
        if ((clip.title.is_some() || clip.generator.is_some()) && track.kind != TrackKind::Video)
            || asset.is_some_and(|asset| {
                (track.kind == TrackKind::Video && !asset.has_video)
                    || (track.kind == TrackKind::Audio && !asset.has_audio)
            })
        {
            return invalid("media cannot be placed on this lane");
        }
        clip.rate.validate()?;
        if clip.duration_ms == 0
            || clip
                .source_in_ms
                .checked_add(clip.rate.source_offset(clip.duration_ms)?)
                .is_none_or(|end| end > asset.map_or(MAX_DURATION_MS, |asset| asset.duration_ms))
            || clip
                .start_ms
                .checked_add(clip.duration_ms)
                .is_none_or(|end| end > MAX_DURATION_MS)
        {
            return invalid("clip is outside its source or timeline");
        }
        for instance in clip.instances.iter().chain(&clip.generator) {
            if instance.id == project.id {
                return invalid("effect ID collides with project ID");
            }
            let definition = crate::effects::definition(
                &project.definitions,
                &instance.definition_id,
                instance.definition_version,
            )?;
            crate::effects::scopes::compatible(
                definition,
                crate::effects::scope_types::ScopeTarget::Clip,
                None,
            )?;
            if let Some(range) = instance.range {
                range.validate()?;
            }
            if instance.name.as_ref().is_some_and(|name| {
                name.trim().is_empty() || name.len() > 256 || name.contains('\0')
            }) {
                return invalid("invalid instance name");
            }
            if (definition.domain == crate::effects::Domain::Video
                && track.kind == TrackKind::Audio)
                || (definition.domain == crate::effects::Domain::Audio
                    && !asset.is_some_and(|asset| asset.has_audio))
            {
                return invalid("effect incompatible with clip media");
            }
        }
        intervals
            .entry(clip.track_id)
            .or_default()
            .push((clip.start_ms, clip.start_ms + clip.duration_ms));
    }
    for lane in intervals.values_mut() {
        lane.sort_unstable();
        if lane.windows(2).any(|pair| pair[0].1 > pair[1].0) {
            return invalid("clips overlap on the same lane; use another lane");
        }
    }
    for transition in &project.transitions {
        for id in std::iter::once(transition.instance.id).chain(
            transition
                .instance
                .parameters
                .values()
                .flat_map(|binding| match binding {
                    crate::animation::Binding::Constant { .. } => [].iter(),
                    crate::animation::Binding::Curve { keys, .. } => keys.iter(),
                })
                .map(|key| key.id),
        ) {
            if id.is_nil() || !ids.insert(id) || project.clips.identity_count(id) > 0 {
                return invalid("duplicate or nil transition/keyframe ID");
            }
        }
        crate::effects::transitions::validate(project, transition)?;
    }
    Ok(())
}

/// Checks payloads acquired by one native render window after metadata validation.
pub fn render(project: &Project, active_ids: &HashSet<uuid::Uuid>) -> Result<()> {
    metadata(project)?;
    let mut lanes = HashSet::new();
    for id in active_ids {
        let item = project
            .clips
            .try_by_id(*id)?
            .ok_or_else(|| EditorError::Invalid("active render clip is missing".into()))?;
        clip(project, &item)?;
        if lanes.insert(item.track_id) {
            let track = project
                .tracks
                .try_by_id(item.track_id)?
                .ok_or_else(|| EditorError::Invalid("active render lane is missing".into()))?;
            crate::effects::scopes::validate_track(project, &track)?;
        }
    }
    Ok(())
}
pub use super::clip_validation::clip;

/// Resolves an existing source inside its project, rejecting symlink escapes.
pub fn source_path(root: &Path, value: &str) -> Result<PathBuf> {
    relative_path(value)?;
    let base = root
        .canonicalize()
        .map_err(|e| crate::shared::storage(root, e))?;
    let candidate = root
        .join(value)
        .canonicalize()
        .map_err(|e| crate::shared::storage(root.join(value), e))?;
    if !candidate.starts_with(base) || !candidate.is_file() {
        return Err(EditorError::Invalid(
            "source escapes the project directory".into(),
        ));
    }
    Ok(candidate)
}

/// Rejects absolute paths, parent traversal, and platform-dependent path separators.
pub fn relative_path(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 4096
        || value.contains(['\\', ':', '\0'])
        || Path::new(value)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return invalid("media path must be relative to the project");
    }
    Ok(())
}
fn name(value: &str) -> Result<()> {
    if value.trim().is_empty() || value.len() > 256 || value.contains('\0') {
        return invalid("name must contain 1–256 bytes");
    }
    Ok(())
}
fn unit(value: f64) -> bool {
    bounded(value, 0., 1.)
}
fn bounded(value: f64, low: f64, high: f64) -> bool {
    value.is_finite() && (low..=high).contains(&value)
}
fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}
