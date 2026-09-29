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
    if document.undo.len() + document.redo.len() >= HISTORY_LIMIT {
        return invalid("history exceeds 50 states");
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
    name(&project.name)?;
    let canvas = &project.canvas;
    if !(16..=4096).contains(&canvas.width)
        || !(16..=4096).contains(&canvas.height)
        || !(1..=60).contains(&canvas.fps)
    {
        return invalid("canvas must be 16–4096 pixels and 1–60 fps");
    }
    if project.assets.len() > 512 || project.clips.len() > 2048 || project.tracks.len() > 32 {
        return invalid("project capacity exceeded");
    }
    let mut ids = HashSet::new();
    for asset in &project.assets {
        if !ids.insert(asset.id) || asset.duration_ms == 0 || asset.duration_ms > MAX_DURATION_MS {
            return invalid("invalid or duplicate media asset");
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
        for sample in &asset.cursor {
            if sample.time_ms < last
                || sample.time_ms > asset.duration_ms
                || !unit(sample.cx)
                || !unit(sample.cy)
            {
                return invalid("invalid cursor data");
            }
            last = sample.time_ms;
        }
        for zoom in &asset.zooms {
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
    for track in &project.tracks {
        if !ids.insert(track.id) {
            return invalid("duplicate lane ID");
        }
        name(&track.name)?;
    }
    for clip in &project.clips {
        if !ids.insert(clip.id) {
            return invalid("duplicate clip ID");
        }
        let asset = project.assets.iter().find(|a| a.id == clip.asset_id);
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
        } else if asset.is_none() {
            return invalid("missing clip asset");
        }
        let track = project
            .tracks
            .iter()
            .find(|t| t.id == clip.track_id)
            .ok_or_else(|| EditorError::Invalid("missing clip lane".into()))?;
        if (clip.title.is_some() && track.kind != TrackKind::Video)
            || asset.is_some_and(|asset| {
                (track.kind == TrackKind::Video && !asset.has_video)
                    || (track.kind == TrackKind::Audio && !asset.has_audio)
            })
        {
            return invalid("media cannot be placed on this lane");
        }
        if clip.duration_ms == 0
            || clip
                .source_in_ms
                .checked_add(clip.duration_ms)
                .is_none_or(|end| end > asset.map_or(MAX_DURATION_MS, |asset| asset.duration_ms))
            || clip
                .start_ms
                .checked_add(clip.duration_ms)
                .is_none_or(|end| end > MAX_DURATION_MS)
        {
            return invalid("clip is outside its source or timeline");
        }
        let e = &clip.effects;
        if !unit(e.opacity)
            || !bounded(e.volume, 0., 2.)
            || !bounded(e.brightness, -1., 1.)
            || !bounded(e.saturation, 0., 2.)
            || !bounded(e.scale, 0.05, 5.)
            || !unit(e.x)
            || !unit(e.y)
            || e.fade_in_ms.saturating_add(e.fade_out_ms) > clip.duration_ms
        {
            return invalid("effect value is out of bounds");
        }
        if project.clips.iter().any(|other| {
            other.id != clip.id
                && other.track_id == clip.track_id
                && other.start_ms < clip.start_ms + clip.duration_ms
                && other.start_ms + other.duration_ms > clip.start_ms
        }) {
            return invalid("clips overlap on the same lane; use another lane");
        }
    }
    Ok(())
}

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
