use crate::fixtures::{clip, clip_mut};
use beam_editor_domain::{
    Edit,
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::catalog::builtins,
    timeline::edit,
    timing::{Time, TimeSpace},
};
use uuid::Uuid;

#[test]
fn split_keeps_clip_local_and_source_curve_values_continuous_across_the_cut() {
    let mut project = crate::fixtures::project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap()
        .clone();
    let mut instance = definition.instantiate();
    instance.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::ClipLocal,
            keys: vec![
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(0),
                    value: Value::Number(0.),
                    interpolation: Interpolation::Linear,
                },
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(10_000),
                    value: Value::Number(1.),
                    interpolation: Interpolation::Linear,
                },
            ],
        },
    );
    clip_mut(&mut project, 0).instances.push(instance);
    let original = clip(&project, 0);
    let original_id = original.id;
    let before_value = original.instances[0]
        .evaluated(&original, Time::milliseconds(6_000))
        .unwrap()["opacity"]
        .clone();
    let split = edit::apply(
        &project,
        &Edit::Split {
            id: original_id,
            time_ms: 5_000,
        },
    )
    .unwrap();
    let right = split
        .clips
        .headers()
        .find(|clip| clip.start_ms == 5_000)
        .and_then(|clip| split.clips.try_by_id(clip.id).unwrap())
        .unwrap();
    let after_value = right.instances[0]
        .evaluated(&right, Time::milliseconds(6_000))
        .unwrap()["opacity"]
        .clone();
    assert_eq!(before_value, after_value);
    assert_ne!(original.instances[0].id, right.instances[0].id);
    assert_ne!(
        original.instances[0].parameters["opacity"],
        right.instances[0].parameters["opacity"]
    );
}

#[test]
fn trim_preserves_source_addressed_animation_while_changing_the_visible_window() {
    let mut project = crate::fixtures::project();
    let definition = builtins()
        .into_iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap();
    let mut instance = definition.instantiate();
    instance.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::Source,
            keys: vec![
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(0),
                    value: Value::Number(0.),
                    interpolation: Interpolation::Linear,
                },
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(10_000),
                    value: Value::Number(1.),
                    interpolation: Interpolation::Linear,
                },
            ],
        },
    );
    clip_mut(&mut project, 0).instances.push(instance);
    let original = clip(&project, 0);
    let id = original.id;
    let expected = original.instances[0]
        .evaluated(&original, Time::milliseconds(2_500))
        .unwrap()["opacity"]
        .clone();
    let trimmed = edit::apply(
        &project,
        &Edit::Trim {
            id,
            source_in_ms: 2_000,
            duration_ms: 5_000,
            start_ms: 500,
        },
    )
    .unwrap();
    let clip = clip(&trimmed, 0);
    assert_eq!(
        clip.instances[0]
            .evaluated(&clip, Time::milliseconds(1_000))
            .unwrap()["opacity"],
        expected
    );
    assert_eq!(clip.source_in_ms, 2_000);
}

#[test]
fn copy_and_paste_remap_clip_effect_and_link_ids_but_keep_curves_and_source_refs() {
    let mut project = crate::fixtures::project();
    let track_id = project.tracks.headers().next().unwrap().id;
    let audio_track = project.tracks.headers().nth(1).unwrap().id;
    project.assets[0].has_audio = true;
    let first_id = clip(&project, 0).id;
    let definition = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .clone();
    let mut first_effect = definition.instantiate();
    first_effect.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::ClipLocal,
            keys: vec![
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(0),
                    value: Value::Number(0.25),
                    interpolation: Interpolation::Linear,
                },
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(10_000),
                    value: Value::Number(0.75),
                    interpolation: Interpolation::Linear,
                },
            ],
        },
    );
    clip_mut(&mut project, 0).instances.push(first_effect);
    let mut second = (*clip(&project, 0)).clone();
    second.instances.clear();
    let link = Uuid::new_v4();
    clip_mut(&mut project, 0).link_group = Some(link);
    second.id = Uuid::new_v4();
    second.track_id = audio_track;
    second.link_group = Some(link);
    project.clips.try_push(second.clone()).unwrap();
    let document = beam_editor_domain::Document::new(project);
    let prepared = beam_editor_domain::commands::prepare(
        &document,
        &beam_editor_domain::commands::types::Transaction {
            api_version: 1,
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: document.revision,
            idempotency_key: "paste-temporal".into(),
            commands: vec![beam_editor_domain::commands::types::Command {
                command_id: "paste".into(),
                operation: beam_editor_domain::commands::types::Operation::PasteMapped {
                    clips: vec![first_id, second.id],
                    source_sequence: document.active_sequence,
                    track_map: std::collections::BTreeMap::from([
                        (
                            track_id,
                            beam_editor_domain::commands::types::Reference::Id(track_id),
                        ),
                        (
                            audio_track,
                            beam_editor_domain::commands::types::Reference::Id(audio_track),
                        ),
                    ]),
                    start_ms: 20_000,
                },
            }],
        },
    )
    .unwrap();
    let pasted: Vec<_> = prepared
        .document
        .project
        .clips
        .try_iter()
        .map(Result::unwrap)
        .filter(|clip| clip.start_ms >= 20_000)
        .collect();
    assert_eq!(pasted.len(), 2);
    assert_ne!(pasted[0].id, first_id);
    assert_eq!(pasted[0].asset_id, clip(&document.project, 0).asset_id);
    assert_eq!(pasted[0].link_group, pasted[1].link_group);
    assert_ne!(pasted[0].link_group, Some(link));
    assert_ne!(
        pasted[0].instances[0].id,
        clip(&document.project, 0).instances[0].id
    );
    assert_eq!(
        pasted[0].instances[0]
            .evaluated(&pasted[0], Time::milliseconds(22_000))
            .unwrap()["opacity"],
        Value::Number(0.35)
    );
}
