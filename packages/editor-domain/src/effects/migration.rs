//! Deterministic V1 scalar decisions become editable instances, including history.
use super::{Definition, Instance, catalog};
use crate::{
    Clip, Document, EditState, EditorError, MediaAsset, Result, TrackKind,
    animation::{Binding, Interpolation, Keyframe, Value},
    collections::PersistentCollection,
    timeline::{project_history_types::ProjectAction, sequence_types::Sequence, types::Track},
    timing::{Time, TimeSpace},
};
use std::collections::{BTreeSet, HashSet};
use uuid::Uuid;

/// Schema activation calls this only after the same processors pass native equivalence.
/// A rejected conversion leaves the input and its immutable media untouched.
pub fn migrate_document(document: &mut Document) -> Result<()> {
    let mut candidate = document.clone();
    ensure_definitions(&mut candidate.project.definitions)?;
    let assets = &candidate.project.assets;
    let definitions = &candidate.project.definitions;
    migrate_clips(
        &mut candidate.project.clips,
        &candidate.project.tracks,
        assets,
        definitions,
    )?;
    for state in candidate.undo.iter_mut().chain(&mut candidate.redo) {
        migrate_state(state, assets, definitions)?;
    }
    for sequence in &mut candidate.sequences {
        migrate_sequence(sequence, assets, definitions)?;
    }
    for action in candidate
        .project_undo
        .iter_mut()
        .chain(&mut candidate.project_redo)
    {
        if let ProjectAction::InsertSequence { sequence, .. } = action {
            migrate_sequence(sequence, assets, definitions)?;
        }
    }
    *document = candidate;
    Ok(())
}
fn migrate_sequence(
    sequence: &mut Sequence,
    assets: &[MediaAsset],
    definitions: &[Definition],
) -> Result<()> {
    migrate_state(&mut sequence.state, assets, definitions)?;
    for state in sequence.undo.iter_mut().chain(&mut sequence.redo) {
        migrate_state(state, assets, definitions)?;
    }
    Ok(())
}
fn migrate_state(
    state: &mut EditState,
    assets: &[MediaAsset],
    definitions: &[Definition],
) -> Result<()> {
    migrate_clips(&mut state.clips, &state.tracks, assets, definitions)
}
fn ensure_definitions(definitions: &mut Vec<Definition>) -> Result<()> {
    for definition in catalog::builtins().into_iter().filter(|d| {
        [
            "beam.color",
            "beam.opacity",
            "beam.gain",
            "beam.framing",
            "beam.textPlacement",
        ]
        .contains(&d.id.as_str())
    }) {
        if let Some(existing) = definitions
            .iter()
            .find(|d| d.id == definition.id && d.version == definition.version)
        {
            if existing != &definition {
                return Err(EditorError::Invalid(format!(
                    "legacy migration conflicts with definition {}",
                    definition.id
                )));
            }
        } else {
            definitions.push(definition);
        }
    }
    Ok(())
}
fn migrate_clips(
    clips: &mut PersistentCollection<Clip>,
    tracks: &PersistentCollection<Track>,
    assets: &[MediaAsset],
    definitions: &[Definition],
) -> Result<()> {
    let video: HashSet<_> = tracks
        .headers()
        .filter(|t| t.kind == TrackKind::Video)
        .map(|t| t.id)
        .collect();
    let audio: HashSet<_> = tracks
        .headers()
        .filter(|t| t.kind == TrackKind::Audio)
        .map(|t| t.id)
        .collect();
    let separated: HashSet<_> = clips
        .headers()
        .filter(|c| audio.contains(&c.track_id))
        .filter_map(|c| c.link_group)
        .collect();
    let ids: Vec<_> = clips.headers().map(|clip| clip.id).collect();
    for id in ids {
        let mut clip = clips
            .try_by_id_mut(id)?
            .ok_or_else(|| EditorError::Invalid("legacy migration has a missing clip".into()))?;
        let has_video = video.contains(&clip.track_id);
        let asset = assets.iter().find(|a| a.id == clip.asset_id);
        let has_audio = audio.contains(&clip.track_id)
            || (has_video
                && asset.is_some_and(|a| a.has_audio)
                && clip.link_group.is_none_or(|g| !separated.contains(&g)));
        if !has_video && !has_audio {
            return Err(EditorError::Invalid(
                "legacy migration has a missing clip lane".into(),
            ));
        }
        if clip.title.is_none() && clip.generator.is_none() && asset.is_none() {
            return Err(EditorError::Invalid(
                "legacy migration has a missing source".into(),
            ));
        }
        if clip
            .effects
            .fade_in_ms
            .checked_add(clip.effects.fade_out_ms)
            .is_none_or(|f| f > clip.duration_ms)
        {
            return Err(EditorError::Invalid(
                "legacy fades exceed their clip duration".into(),
            ));
        }
        let fades = clip.effects.fade_in_ms != 0 || clip.effects.fade_out_ms != 0;
        let mut migrated = Vec::new();
        if has_video && (clip.effects.brightness != 0. || clip.effects.saturation != 1.) {
            let mut instance = new(&clip, definitions, "beam.color")?;
            set(&mut instance, "brightness", clip.effects.brightness);
            set(&mut instance, "saturation", clip.effects.saturation);
            migrated.push(instance);
            clip.effects.brightness = 0.;
            clip.effects.saturation = 1.;
        }
        if has_video && (clip.effects.opacity != 1. || fades) {
            let mut instance = new(&clip, definitions, "beam.opacity")?;
            instance.parameters.insert(
                "opacity".into(),
                envelope(&clip, &instance, clip.effects.opacity)?,
            );
            migrated.push(instance);
            clip.effects.opacity = 1.;
        }
        if has_video
            && (clip.effects.x != 0.5
                || clip.effects.y != 0.5
                || (clip.title.is_none() && clip.effects.scale != 1.))
        {
            let mut instance = new(
                &clip,
                definitions,
                if clip.title.is_some() {
                    "beam.textPlacement"
                } else {
                    "beam.framing"
                },
            )?;
            set(&mut instance, "x", clip.effects.x);
            set(&mut instance, "y", clip.effects.y);
            if clip.title.is_none() {
                set(&mut instance, "scale", clip.effects.scale);
                clip.effects.scale = 1.;
            }
            migrated.push(instance);
            clip.effects.x = 0.5;
            clip.effects.y = 0.5;
        }
        if has_audio && (clip.effects.volume != 1. || fades) {
            let mut instance = new(&clip, definitions, "beam.gain")?;
            instance.parameters.insert(
                "volume".into(),
                envelope(&clip, &instance, clip.effects.volume)?,
            );
            migrated.push(instance);
            clip.effects.volume = 1.;
        }
        if fades {
            clip.effects.fade_in_ms = 0;
            clip.effects.fade_out_ms = 0;
        }
        for instance in &migrated {
            instance.validate(definitions)?;
        }
        migrated.append(&mut clip.instances);
        clip.instances = migrated;
    }
    Ok(())
}
fn new(clip: &Clip, definitions: &[Definition], id: &str) -> Result<Instance> {
    let mut instance = super::definition(definitions, id, 1)?.instantiate();
    instance.id = Uuid::new_v5(&clip.id, format!("beam.v1.fx.{id}").as_bytes());
    if clip.instances.iter().any(|i| i.id == instance.id) {
        return Err(EditorError::Invalid(
            "legacy effect migration collides with an existing occurrence".into(),
        ));
    }
    Ok(instance)
}
fn set(instance: &mut Instance, key: &str, value: f64) {
    instance
        .parameters
        .insert(key.into(), Binding::constant(Value::Number(value)));
}
fn envelope(clip: &Clip, instance: &Instance, value: f64) -> Result<Binding> {
    let (incoming, outgoing, duration) = (
        clip.effects.fade_in_ms,
        clip.effects.fade_out_ms,
        clip.duration_ms,
    );
    if incoming == 0 && outgoing == 0 {
        return Ok(Binding::constant(Value::Number(value)));
    }
    let mut boundaries = BTreeSet::from([0, duration]);
    if incoming != 0 {
        boundaries.insert(incoming);
    }
    if outgoing != 0 {
        boundaries.insert(duration - outgoing);
    }
    let keys = boundaries
        .into_iter()
        .map(|local| {
            let ticks = clip
                .animation_offset_ms
                .checked_add(
                    i64::try_from(local)
                        .map_err(|_| EditorError::Invalid("legacy fade time overflow".into()))?,
                )
                .ok_or_else(|| EditorError::Invalid("legacy animation origin overflow".into()))?;
            let time = Time::milliseconds(ticks);
            time.validate()?;
            let fade_in = if incoming == 0 {
                1.
            } else {
                local as f64 / incoming as f64
            };
            let fade_out = if outgoing == 0 {
                1.
            } else {
                (duration - local) as f64 / outgoing as f64
            };
            Ok(Keyframe {
                id: Uuid::new_v5(&instance.id, format!("beam.v1.key.{local}").as_bytes()),
                time,
                value: Value::Number(value * fade_in.min(fade_out).clamp(0., 1.)),
                interpolation: Interpolation::Linear,
            })
        })
        .collect::<Result<_>>()?;
    Ok(Binding::Curve {
        space: TimeSpace::ClipLocal,
        keys,
    })
}
