//! Loaded decisions are checked against the shared catalog before use.
use crate::{Clip, EditorError, Project, Result, TrackKind};
pub fn clip(project: &Project, clip: &Clip) -> Result<()> {
    let track = project
        .tracks
        .try_header_by_id(clip.track_id)?
        .ok_or_else(|| invalid("missing clip lane"))?;
    let asset = project
        .assets
        .iter()
        .find(|asset| asset.id == clip.asset_id);
    project
        .recording_style
        .cursor
        .overridden(clip.cursor_style.as_ref())
        .validate()?;
    if clip.cursor_style.is_some()
        && asset.is_none_or(|asset| {
            asset.cursor_mode != crate::recording::style_types::CursorMode::Separated
                || asset.cursor.is_empty()
        })
    {
        return Err(invalid(
            "cursor overrides require separated cursor telemetry; baked-in and unknown cursors cannot be redrawn",
        ));
    }
    let e = &clip.effects;
    if !bounded(e.opacity, 0., 1.)
        || !bounded(e.volume, 0., 2.)
        || !bounded(e.brightness, -1., 1.)
        || !bounded(e.saturation, 0., 2.)
        || !bounded(e.scale, 0.05, 5.)
        || !bounded(e.x, 0., 1.)
        || !bounded(e.y, 0., 1.)
        || e.fade_in_ms.saturating_add(e.fade_out_ms) > clip.duration_ms
    {
        return Err(invalid("effect value is out of bounds"));
    }
    for instance in clip.instances.iter().chain(&clip.generator) {
        instance.validate(&project.definitions)?;
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
        crate::effects::placement::compatible(&definition.processor, clip)?;
        if (definition.domain == crate::effects::Domain::Video && track.kind == TrackKind::Audio)
            || (definition.domain == crate::effects::Domain::Audio
                && !asset.is_some_and(|asset| asset.has_audio))
        {
            return Err(invalid("effect incompatible with clip media"));
        }
    }
    Ok(())
}
fn bounded(value: f64, min: f64, max: f64) -> bool {
    value.is_finite() && (min..=max).contains(&value)
}
fn invalid(message: &str) -> EditorError {
    EditorError::Invalid(message.into())
}
