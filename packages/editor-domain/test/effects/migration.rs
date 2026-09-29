use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::{
    Document, EditState,
    effects::{Instance, migration},
    timeline::project_history_types::ProjectAction,
    timing::Time,
};
fn legacy() -> Document {
    let mut project = crate::fixtures::project();
    project.assets[0].has_audio = true;
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.start_ms = 500;
    clip.source_in_ms = 1000;
    clip.duration_ms = 3000;
    clip.animation_offset_ms = 125;
    clip.effects.brightness = 0.12;
    clip.effects.saturation = 0.65;
    clip.effects.opacity = 0.8;
    clip.effects.volume = 0.7;
    clip.effects.scale = 0.7;
    clip.effects.x = 0.23;
    clip.effects.y = 0.72;
    clip.effects.fade_in_ms = 600;
    clip.effects.fade_out_ms = 900;
    drop(clip);
    Document::new(project)
}
fn effect(document: &Document, id: &str) -> Instance {
    decision(&document.project.clips, 0)
        .instances
        .iter()
        .find(|i| i.definition_id == id)
        .unwrap()
        .clone()
}
#[test]
fn scalar_migration_preserves_all_snapshot_lineages_sources_and_stable_ids() {
    let mut document = legacy();
    let state = EditState::capture(&document.project);
    document.undo.push(state.clone());
    document.redo.push(state.clone());
    document.sequences[0].undo.push(state.clone());
    document.sequences[0].redo.push(state);
    document.project_undo.push(ProjectAction::InsertSequence {
        sequence: Box::new(document.sequences[0].clone()),
        index: 0,
        active: document.active_sequence,
    });
    let sources = document.project.assets.clone();
    migration::migrate_document(&mut document).unwrap();
    let clip = &decision(&document.project.clips, 0);
    assert_eq!(
        clip.instances
            .iter()
            .map(|i| i.definition_id.as_str())
            .collect::<Vec<_>>(),
        vec!["beam.color", "beam.opacity", "beam.framing", "beam.gain"]
    );
    for snapshot in document
        .undo
        .iter()
        .chain(&document.redo)
        .chain(std::iter::once(&document.sequences[0].state))
        .chain(&document.sequences[0].undo)
        .chain(&document.sequences[0].redo)
    {
        assert_eq!(decision(&snapshot.clips, 0).instances, clip.instances);
    }
    let ProjectAction::InsertSequence { sequence, .. } = &document.project_undo[0] else {
        panic!()
    };
    assert_eq!(decision(&sequence.state.clips, 0).instances, clip.instances);
    assert_eq!(document.project.assets, sources);
    assert!(std::sync::Arc::ptr_eq(
        &document.project.assets[0].cursor,
        &sources[0].cursor
    ));
    assert_eq!(clip.effects.opacity, 1.);
    assert_eq!(clip.effects.volume, 1.);
    assert_eq!(clip.effects.scale, 1.);
    assert_eq!((clip.effects.fade_in_ms, clip.effects.fade_out_ms), (0, 0));
    let before = serde_json::to_value(&document).unwrap();
    migration::migrate_document(&mut document).unwrap();
    assert_eq!(serde_json::to_value(&document).unwrap(), before);
}

#[test]
fn serialized_v1_catalogue_metadata_remains_immutable_when_new_versions_are_added() {
    let mut document = legacy();
    document
        .project
        .definitions
        .retain(|definition| definition.version == 1);
    let old = serde_json::to_value(&document.project.definitions).unwrap();
    assert!(
        old.as_array()
            .unwrap()
            .iter()
            .all(|definition| definition.get("targets").is_none())
    );
    document.project.definitions = serde_json::from_value(old.clone()).unwrap();
    migration::migrate_document(&mut document).unwrap();
    let retained: Vec<_> = document
        .project
        .definitions
        .iter()
        .filter(|definition| definition.version == 1)
        .cloned()
        .collect();
    assert_eq!(serde_json::to_value(retained).unwrap(), old);
    assert!(
        document
            .project
            .definitions
            .iter()
            .any(|definition| definition.id == "beam.opacity" && definition.version == 2)
    );
    for instance in &decision(&document.project.clips, 0).instances {
        assert_eq!(instance.definition_version, 1);
    }
}
#[test]
fn fade_curves_reproduce_clip_relative_values_including_handles_and_offsets() {
    let mut document = legacy();
    migration::migrate_document(&mut document).unwrap();
    let clip = &decision(&document.project.clips, 0);
    for local in [-100, 0, 200, 600, 1200, 2100, 2500, 3000, 3200] {
        let fade = (local as f64 / 600.)
            .min((3000. - local as f64) / 900.)
            .clamp(0., 1.);
        let time = Time::milliseconds(500 + local);
        let opacity = effect(&document, "beam.opacity")
            .evaluated(&clip, time)
            .unwrap()["opacity"]
            .number()
            .unwrap();
        let gain = effect(&document, "beam.gain")
            .evaluated(&clip, time)
            .unwrap()["volume"]
            .number()
            .unwrap();
        assert!((opacity - fade * 0.8).abs() < 1e-12);
        assert!((gain - fade * 0.7).abs() < 1e-12);
    }
}
#[test]
fn each_one_sided_fade_and_constant_volume_retains_its_endpoint_behavior() {
    for (incoming, outgoing) in [(600, 0), (0, 900), (0, 0)] {
        let mut document = legacy();
        decision_mut(&mut document.project.clips, 0)
            .effects
            .fade_in_ms = incoming;
        decision_mut(&mut document.project.clips, 0)
            .effects
            .fade_out_ms = outgoing;
        migration::migrate_document(&mut document).unwrap();
        let clip = &decision(&document.project.clips, 0);
        for local in [-100, 0, 1000, 3000, 3100] {
            let a = if incoming == 0 {
                1.
            } else {
                local as f64 / incoming as f64
            };
            let b = if outgoing == 0 {
                1.
            } else {
                (3000. - local as f64) / outgoing as f64
            };
            let opacity = effect(&document, "beam.opacity")
                .evaluated(&clip, Time::milliseconds(500 + local))
                .unwrap()["opacity"]
                .number()
                .unwrap();
            assert!((opacity - 0.8 * a.min(b).clamp(0., 1.)).abs() < 1e-12);
        }
    }
}
#[test]
fn migration_neutralizes_only_effects_applicable_to_the_rendered_media() {
    let mut document = legacy();
    document.project.assets[0].has_audio = false;
    migration::migrate_document(&mut document).unwrap();
    assert!(
        !decision(&document.project.clips, 0)
            .instances
            .iter()
            .any(|i| i.definition_id == "beam.gain")
    );
    assert_eq!(decision(&document.project.clips, 0).effects.volume, 0.7);
    let mut document = legacy();
    decision_mut(&mut document.project.clips, 0).title = Some(Default::default());
    decision_mut(&mut document.project.clips, 0).asset_id = uuid::Uuid::nil();
    migration::migrate_document(&mut document).unwrap();
    assert!(
        decision(&document.project.clips, 0)
            .instances
            .iter()
            .any(|i| i.definition_id == "beam.textPlacement")
    );
    assert!(
        !decision(&document.project.clips, 0)
            .instances
            .iter()
            .any(|i| i.definition_id == "beam.framing")
    );
    assert_eq!(decision(&document.project.clips, 0).effects.scale, 0.7);
}
#[test]
fn conflicting_definitions_invalid_fades_and_missing_sources_leave_input_unchanged() {
    for kind in 0..3 {
        let mut document = legacy();
        match kind {
            0 => {
                document
                    .project
                    .definitions
                    .iter_mut()
                    .find(|d| d.id == "beam.color")
                    .unwrap()
                    .label = "conflicting".into()
            }
            1 => {
                decision_mut(&mut document.project.clips, 0)
                    .effects
                    .fade_in_ms = u64::MAX
            }
            _ => decision_mut(&mut document.project.clips, 0).asset_id = uuid::Uuid::new_v4(),
        }
        let before = serde_json::to_value(&document).unwrap();
        assert!(migration::migrate_document(&mut document).is_err());
        assert_eq!(serde_json::to_value(&document).unwrap(), before);
    }
}

#[test]
fn separated_audio_migrates_gain_on_its_audio_lane_and_keeps_unused_video_gain() {
    use beam_editor_domain::{Track, TrackKind};
    let mut document = legacy();
    let audio = Track::new("Audio".into(), TrackKind::Audio);
    let mut separated = (*decision(&document.project.clips, 0)).clone();
    let link = uuid::Uuid::new_v4();
    separated.id = uuid::Uuid::new_v4();
    separated.track_id = audio.id;
    separated.link_group = Some(link);
    decision_mut(&mut document.project.clips, 0).link_group = Some(link);
    document.project.tracks.try_push(audio).unwrap();
    document.project.clips.try_push(separated).unwrap();
    migration::migrate_document(&mut document).unwrap();
    let video = &decision(&document.project.clips, 0);
    assert!(
        !video
            .instances
            .iter()
            .any(|i| i.definition_id == "beam.gain")
    );
    assert_eq!(video.effects.volume, 0.7);
    let audio = &decision(&document.project.clips, 1);
    assert_eq!(audio.instances.len(), 1);
    assert_eq!(audio.instances[0].definition_id, "beam.gain");
    assert_eq!(audio.effects.volume, 1.);
    assert_eq!(audio.effects.brightness, 0.12);
    assert_eq!(audio.effects.opacity, 0.8);
    assert_eq!(audio.effects.scale, 0.7);
    assert!(
        (audio.instances[0]
            .evaluated(audio, Time::milliseconds(800))
            .unwrap()["volume"]
            .number()
            .unwrap()
            - 0.35)
            .abs()
            < 1e-12
    );
}

#[test]
fn existing_named_occurrences_keep_their_order_after_legacy_decisions() {
    let mut document = legacy();
    let mut original =
        beam_editor_domain::effects::definition(&document.project.definitions, "beam.opacity", 1)
            .unwrap()
            .instantiate();
    original.name = Some("Final opacity".into());
    decision_mut(&mut document.project.clips, 0)
        .instances
        .push(original.clone());
    migration::migrate_document(&mut document).unwrap();
    assert_eq!(
        decision(&document.project.clips, 0).instances.last(),
        Some(&original)
    );
    assert_ne!(effect(&document, "beam.opacity").id, original.id);
}

#[test]
fn bad_lanes_occurrence_collisions_and_invalid_values_never_publish_partial_migration() {
    for kind in 0..5 {
        let mut document = legacy();
        match kind {
            0 => decision_mut(&mut document.project.clips, 0).track_id = uuid::Uuid::new_v4(),
            1 => {
                let mut occurrence = beam_editor_domain::effects::definition(
                    &document.project.definitions,
                    "beam.color",
                    1,
                )
                .unwrap()
                .instantiate();
                occurrence.id = uuid::Uuid::new_v5(
                    &decision(&document.project.clips, 0).id,
                    b"beam.v1.fx.beam.color",
                );
                decision_mut(&mut document.project.clips, 0)
                    .instances
                    .push(occurrence);
            }
            2 => decision_mut(&mut document.project.clips, 0).animation_offset_ms = i64::MAX,
            3 => {
                decision_mut(&mut document.project.clips, 0)
                    .effects
                    .brightness = f64::NAN
            }
            _ => decision_mut(&mut document.project.clips, 0).effects.x = 1.1,
        }
        let before = serde_json::to_value(&document).unwrap();
        assert!(migration::migrate_document(&mut document).is_err());
        assert_eq!(serde_json::to_value(&document).unwrap(), before);
    }
}
