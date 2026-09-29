//! Source analysis becomes independent editable occurrences; telemetry stays immutable.
use super::{style_types::ZoomDefaults, types::Zoom};
use crate::{
    Clip, Document, EditorError, MediaAsset, Result,
    animation::{Binding, Value},
    collections::PersistentCollection,
    effects::{Instance, catalog},
    timeline::{project_history_types::ProjectAction, sequence_types::Sequence},
    timing::{Time, TimeRange, TimeSpace},
};
use uuid::Uuid;

pub const ZOOM_DEFINITION: &str = "beam.camera.zoom";
pub const CURSOR_DEFINITION: &str = "beam.cursor";

pub fn from_suggestion(
    clip: &Clip,
    asset: &MediaAsset,
    index: usize,
    defaults: &ZoomDefaults,
) -> Result<Instance> {
    defaults.validate()?;
    let zoom = asset
        .zooms
        .get(index)
        .ok_or_else(|| crate::EditorError::Invalid("zoom suggestion does not exist".into()))?;
    let mut instance = suggestion(clip, zoom, index, false);
    set(&mut instance, "scale", Value::Number(defaults.scale));
    set(
        &mut instance,
        "entryMs",
        Value::Number(defaults.entry_ms as f64),
    );
    set(
        &mut instance,
        "exitMs",
        Value::Number(defaults.exit_ms as f64),
    );
    set(
        &mut instance,
        "followCursor",
        Value::Boolean(defaults.follow_cursor),
    );
    // A manual application is a new decision, even when the suggestion was used before.
    instance.id = Uuid::new_v4();
    Ok(instance)
}

/// IDs depend only on source occurrence lineage and suggestion index, including undo/redo.
pub fn migrate_document(document: &mut Document) -> Result<()> {
    let mut candidate = document.clone();
    ensure_definitions(&mut candidate.project.definitions)?;
    let assets = &candidate.project.assets;
    migrate_clips(&mut candidate.project.clips, assets)?;
    for state in candidate.undo.iter_mut().chain(&mut candidate.redo) {
        migrate_clips(&mut state.clips, assets)?;
    }
    for sequence in &mut candidate.sequences {
        migrate_sequence(sequence, assets)?;
    }
    for action in candidate
        .project_undo
        .iter_mut()
        .chain(&mut candidate.project_redo)
    {
        if let ProjectAction::InsertSequence { sequence, .. } = action {
            migrate_sequence(sequence, assets)?;
        }
    }
    *document = candidate;
    Ok(())
}
fn migrate_sequence(sequence: &mut Sequence, assets: &[MediaAsset]) -> Result<()> {
    migrate_clips(&mut sequence.state.clips, assets)?;
    for state in sequence.undo.iter_mut().chain(&mut sequence.redo) {
        migrate_clips(&mut state.clips, assets)?;
    }
    Ok(())
}

/// New native captures use editable instances from their first document, too.
pub fn apply_suggestions(clip: &mut Clip, asset: &MediaAsset) {
    if clip.effects.auto_zoom
        && clip
            .instances
            .iter()
            .all(|i| i.definition_id != ZOOM_DEFINITION)
    {
        clip.instances.extend(
            asset
                .zooms
                .iter()
                .enumerate()
                .map(|(index, zoom)| suggestion(clip, zoom, index, true))
                .collect::<Vec<_>>(),
        );
    }
    clip.effects.auto_zoom = false;
}

fn migrate_clips(clips: &mut PersistentCollection<Clip>, assets: &[MediaAsset]) -> Result<()> {
    let ids: Vec<_> = clips.headers().map(|clip| clip.id).collect();
    for id in ids {
        let mut clip = clips
            .try_by_id_mut(id)?
            .ok_or_else(|| EditorError::Invalid("zoom migration has a missing clip".into()))?;
        if let Some(asset) = assets.iter().find(|asset| asset.id == clip.asset_id) {
            apply_suggestions(&mut clip, asset);
        }
    }
    Ok(())
}
fn ensure_definitions(definitions: &mut Vec<crate::effects::Definition>) -> Result<()> {
    for definition in catalog::builtins()
        .into_iter()
        .filter(|d| [ZOOM_DEFINITION, CURSOR_DEFINITION].contains(&d.id.as_str()))
    {
        if let Some(existing) = definitions
            .iter()
            .find(|d| d.id == definition.id && d.version == definition.version)
        {
            if existing != &definition {
                return Err(EditorError::Invalid(format!(
                    "zoom migration conflicts with definition {}",
                    definition.id
                )));
            }
        } else {
            definitions.push(definition);
        }
    }
    Ok(())
}
fn suggestion(clip: &Clip, zoom: &Zoom, index: usize, legacy: bool) -> Instance {
    let definition = catalog::builtins()
        .into_iter()
        .find(|d| d.id == ZOOM_DEFINITION)
        .expect("built-in zoom definition");
    let mut instance = definition.instantiate();
    instance.id = Uuid::new_v5(&clip.id, format!("beam.zoom.suggestion.{index}").as_bytes());
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::milliseconds(zoom.start_ms as i64),
        end: Time::milliseconds(zoom.end_ms as i64),
    });
    set(&mut instance, "scale", Value::Number(zoom.scale));
    set(&mut instance, "center", Value::Point([zoom.cx, zoom.cy]));
    if legacy {
        set(
            &mut instance,
            "interpolation",
            Value::Choice("legacySpring".into()),
        );
        set(&mut instance, "entryMs", Value::Number(1522.575));
        set(&mut instance, "exitMs", Value::Number(1015.05));
    }
    instance
}
fn set(instance: &mut Instance, key: &str, value: Value) {
    instance
        .parameters
        .insert(key.into(), Binding::constant(value));
}
