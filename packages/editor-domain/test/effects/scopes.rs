use beam_editor_domain::{
    Project, TrackKind,
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::{self, ScopeTarget, scopes},
    timing::{SequenceClock, Time, TimeRange, TimeSpace},
};

#[test]
fn versions_preserve_clip_defaults_and_reject_unsupported_processor_scopes() {
    let project = Project::new("Scopes".into());
    let old = effects::definition(&project.definitions, "beam.opacity", 1).unwrap();
    let new = effects::definition(&project.definitions, "beam.opacity", 2).unwrap();
    assert_eq!(old.targets, vec![ScopeTarget::Clip]);
    assert_eq!(
        new.targets,
        vec![ScopeTarget::Clip, ScopeTarget::Track, ScopeTarget::Sequence]
    );
    assert!(scopes::compatible(old, ScopeTarget::Track, None).is_err());
    for id in [
        "beam.camera.zoom",
        "beam.cursor",
        "beam.framing",
        "beam.textPlacement",
        "beam.solid",
        "beam.crossfade",
    ] {
        let mut definition = effects::definition(&project.definitions, id, 1)
            .unwrap()
            .clone();
        definition.targets.push(ScopeTarget::Track);
        assert!(definition.validate().is_err(), "{id}");
    }
    for targets in [vec![], vec![ScopeTarget::Clip, ScopeTarget::Clip]] {
        let mut definition = new.clone();
        definition.targets = targets;
        assert!(definition.validate().is_err());
    }
}

#[test]
fn absolute_bindings_ranges_and_lane_media_are_checked_before_scoped_evaluation() {
    let mut project = Project::new("Scopes".into());
    let mut instance = effects::definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    instance.range = Some(TimeRange {
        space: TimeSpace::Sequence,
        start: Time::milliseconds(100),
        end: Time::milliseconds(200),
    });
    let key = Keyframe {
        id: uuid::Uuid::new_v4(),
        time: Time::milliseconds(150),
        value: Value::Number(0.3),
        interpolation: Interpolation::Linear,
    };
    instance.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::Sequence,
            keys: vec![key],
        },
    );
    scopes::validate_sequence(&project, &[instance.clone()]).unwrap();
    assert!(
        instance
            .active(&SequenceClock, Time::milliseconds(150))
            .unwrap()
    );
    assert!(
        !instance
            .active(&SequenceClock, Time::milliseconds(200))
            .unwrap()
    );
    assert_eq!(
        instance
            .evaluated(&SequenceClock, Time::milliseconds(150))
            .unwrap()["opacity"],
        Value::Number(0.3)
    );
    let audio = project
        .tracks
        .headers()
        .find(|track| track.kind == TrackKind::Audio)
        .unwrap()
        .id;
    project
        .tracks
        .try_by_id_mut(audio)
        .unwrap()
        .unwrap()
        .instances
        .push(instance.clone());
    let track = project.tracks.try_by_id(audio).unwrap().unwrap();
    assert!(scopes::validate_track(&project, &track).is_err());
    for space in [TimeSpace::ClipLocal, TimeSpace::Source] {
        let mut invalid = instance.clone();
        invalid.range.as_mut().unwrap().space = space;
        assert!(scopes::validate_sequence(&project, &[invalid]).is_err());
        let mut invalid = instance.clone();
        if let Binding::Curve { space: current, .. } =
            invalid.parameters.get_mut("opacity").unwrap()
        {
            *current = space;
        }
        assert!(scopes::validate_sequence(&project, &[invalid]).is_err());
    }
    let mut duplicate = instance.duplicate();
    duplicate.parameters = instance.parameters.clone();
    assert!(scopes::validate_sequence(&project, &[instance, duplicate]).is_err());
}
