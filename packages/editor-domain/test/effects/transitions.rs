use crate::fixtures::decision_mut;
use beam_editor_domain::{
    Clip, Effects, Project, TrackKind,
    effects::{Transition, catalog::builtins},
    project::validation,
    timing::Rate,
};
use uuid::Uuid;

fn adjacent_project() -> (Project, Uuid, Uuid) {
    let mut project = Project::new("transition".into());
    let asset = crate::fixtures::asset(10_000);
    let asset_id = asset.id;
    let track_id = project
        .tracks
        .headers()
        .find(|track| track.kind == TrackKind::Video)
        .unwrap()
        .id;
    let from_id = Uuid::new_v4();
    let to_id = Uuid::new_v4();
    let clip = |id, start_ms, source_in_ms| Clip {
        id,
        asset_id,
        track_id,
        start_ms,
        source_in_ms,
        duration_ms: 4_000,
        effects: Effects::default(),
        cursor_style: None,
        title: None,
        instances: vec![],
        rate: Rate::default(),
        animation_offset_ms: 0,
        generator: None,
        link_group: None,
    };
    project.assets.push(asset);
    project.clips = vec![clip(from_id, 0, 0), clip(to_id, 4_000, 500)].into();
    project.definitions = builtins();
    (project, from_id, to_id)
}

#[test]
fn real_two_input_crossfade_validates_only_with_adjacent_clips_and_handles() {
    let (mut project, from_clip, to_clip) = adjacent_project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.crossfade")
        .unwrap();
    let transition = Transition {
        instance: definition.instantiate(),
        from_clip,
        to_clip,
        duration_ms: 1_000,
    };
    assert!(beam_editor_domain::effects::transitions::validate(&project, &transition).is_ok());
    project.transitions.push(transition);
    assert!(validation::project(&project).is_ok());
}

#[test]
fn transition_rejects_non_neighbor_or_missing_source_handles() {
    let (mut project, from_clip, to_clip) = adjacent_project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.crossfade")
        .unwrap();
    let mut transition = Transition {
        instance: definition.instantiate(),
        from_clip,
        to_clip,
        duration_ms: 1_000,
    };
    decision_mut(&mut project.clips, 1).source_in_ms = 0;
    assert!(beam_editor_domain::effects::transitions::validate(&project, &transition).is_err());
    decision_mut(&mut project.clips, 1).source_in_ms = 500;
    decision_mut(&mut project.clips, 1).start_ms += 1;
    assert!(beam_editor_domain::effects::transitions::validate(&project, &transition).is_err());
    decision_mut(&mut project.clips, 1).start_ms -= 1;
    transition.duration_ms = 1;
    assert!(beam_editor_domain::effects::transitions::validate(&project, &transition).is_err());
}

#[test]
fn two_transitions_cannot_claim_the_same_cut() {
    let (mut project, from_clip, to_clip) = adjacent_project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.crossfade")
        .unwrap();
    let first = Transition {
        instance: definition.instantiate(),
        from_clip,
        to_clip,
        duration_ms: 1_000,
    };
    let second = Transition {
        instance: definition.instantiate(),
        from_clip,
        to_clip,
        duration_ms: 2_000,
    };
    project.transitions.push(first);
    assert!(beam_editor_domain::effects::transitions::validate(&project, &second).is_err());
}

#[test]
fn transition_definitions_reject_fake_parameters_and_instances_reject_independent_ranges() {
    let (project, from_clip, to_clip) = adjacent_project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.crossfade")
        .unwrap()
        .clone();
    let mut parameterized = definition.clone();
    parameterized
        .parameters
        .push(beam_editor_domain::effects::types::Parameter {
            key: "strength".into(),
            label: "Strength".into(),
            group: "General".into(),
            unit: String::new(),
            value_type: beam_editor_domain::effects::types::ParameterType::Number {
                min: 0.,
                max: 1.,
                step: 0.01,
            },
            default: beam_editor_domain::animation::Value::Number(0.5),
            animatable: true,
        });
    assert!(parameterized.validate().is_err());
    let mut transition = Transition {
        instance: definition.instantiate(),
        from_clip,
        to_clip,
        duration_ms: 1_000,
    };
    transition.instance.range = Some(beam_editor_domain::timing::TimeRange {
        space: beam_editor_domain::timing::TimeSpace::Sequence,
        start: beam_editor_domain::timing::Time::milliseconds(4_000),
        end: beam_editor_domain::timing::Time::milliseconds(5_000),
    });
    assert!(beam_editor_domain::effects::transitions::validate(&project, &transition).is_err());
}
