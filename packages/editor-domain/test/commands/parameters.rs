use beam_editor_domain::{
    Document,
    animation::{Binding, Interpolation, Keyframe, Value},
    commands::{
        self, projections,
        types::{Command, Operation, Reference},
    },
    effects::{Definition, Domain, Parameter, ParameterType, Processor, Transition},
    timing::{Rate, Time, TimeSpace},
};
use uuid::Uuid;

fn transition_document() -> (Document, Uuid, Uuid) {
    let mut project = crate::fixtures::project();
    let mut outgoing = crate::fixtures::clip_mut(&mut project, 0);
    outgoing.start_ms = 1000;
    outgoing.duration_ms = 2000;
    outgoing.animation_offset_ms = 777;
    outgoing.rate = Rate {
        numerator: 3,
        denominator: 2,
    };
    let from_id = outgoing.id;
    drop(outgoing);
    let mut incoming = (*crate::fixtures::clip(&project, 0)).clone();
    incoming.id = Uuid::new_v4();
    incoming.start_ms = 3000;
    incoming.source_in_ms = 2000;
    incoming.animation_offset_ms = 0;
    incoming.rate = Rate::default();
    let to_id = incoming.id;
    project.clips.try_push(incoming).unwrap();
    let definition = Definition {
        targets: beam_editor_domain::effects::scope_types::clip_targets(),
        id: "test.mask".into(),
        version: 1,
        label: "Mask".into(),
        domain: Domain::Transition,
        parameters: vec![Parameter {
            key: "strength".into(),
            label: "Strength".into(),
            group: "Mask".into(),
            unit: String::new(),
            value_type: ParameterType::Number {
                min: 0.,
                max: 1.,
                step: 0.01,
            },
            default: Value::Number(0.5),
            animatable: true,
        }],
        processor: Processor::TransitionShader {
            mask_fragment: "float beam_transition(vec2 uv,float progress) {return progress;}"
                .into(),
        },
        timeline_region: false,
    };
    let mut instance = definition.instantiate();
    let instance_id = instance.id;
    instance.parameters.insert(
        "strength".into(),
        Binding::Curve {
            space: TimeSpace::ClipLocal,
            keys: [(0, 0.), (1000, 1.)]
                .into_iter()
                .map(|(time, value)| Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(time),
                    value: Value::Number(value),
                    interpolation: Interpolation::Linear,
                })
                .collect(),
        },
    );
    project.definitions.push(definition);
    project.transitions.push(Transition {
        instance,
        from_clip: from_id,
        to_clip: to_id,
        duration_ms: 1000,
    });
    (Document::new(project), from_id, instance_id)
}

fn apply(document: &Document, operation: Operation) -> commands::types::Prepared {
    let mut request = commands::single(
        document,
        beam_editor_domain::Edit::Rename {
            name: "unused".into(),
        },
    );
    request.commands = vec![Command {
        command_id: "parameter".into(),
        operation,
    }];
    commands::prepare(document, &request).unwrap()
}

#[test]
fn transition_keyframes_and_curve_space_conversion_share_the_centered_cut_clock_with_queries() {
    let (original, clip, instance) = transition_document();
    let added = apply(
        &original,
        Operation::KeyframeAt {
            clip: Reference::Id(clip),
            instance: Reference::Id(instance),
            parameter: "strength".into(),
            space: TimeSpace::ClipLocal,
            sequence_time: Time::milliseconds(2750),
            value: Value::Number(0.25),
            interpolation: Interpolation::Linear,
        },
    );
    let Binding::Curve { keys, .. } =
        &added.document.project.transitions[0].instance.parameters["strength"]
    else {
        unreachable!()
    };
    assert_eq!(
        keys[1].time.compare(Time::milliseconds(250)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(added.receipt.results[0].created, vec![keys[1].id]);
    let sequence = apply(
        &added.document,
        Operation::CurveSpace {
            clip: Reference::Id(clip),
            instance: Reference::Id(instance),
            parameter: "strength".into(),
            space: TimeSpace::Sequence,
        },
    );
    let Binding::Curve { keys, .. } =
        &sequence.document.project.transitions[0].instance.parameters["strength"]
    else {
        unreachable!()
    };
    assert_eq!(
        keys[0].time.compare(Time::milliseconds(2500)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        keys[2].time.compare(Time::milliseconds(3500)),
        std::cmp::Ordering::Equal
    );
    assert!(sequence.receipt.results[0].created.is_empty());
    for document in [&original, &added.document, &sequence.document] {
        assert_eq!(
            projections::parameter_values(
                document,
                document.active_sequence,
                clip,
                Time::milliseconds(2750)
            )
            .unwrap()[&instance]["strength"],
            Value::Number(0.25)
        );
    }
    let restored = apply(
        &sequence.document,
        Operation::CurveSpace {
            clip: Reference::Id(clip),
            instance: Reference::Id(instance),
            parameter: "strength".into(),
            space: TimeSpace::ClipLocal,
        },
    );
    let Binding::Curve {
        keys: restored_keys,
        space,
    } = &restored.document.project.transitions[0].instance.parameters["strength"]
    else {
        unreachable!()
    };
    let Binding::Curve {
        keys: original_keys,
        ..
    } = &added.document.project.transitions[0].instance.parameters["strength"]
    else {
        unreachable!()
    };
    assert_eq!(*space, TimeSpace::ClipLocal);
    for (restored, original) in restored_keys.iter().zip(original_keys) {
        assert_eq!(restored.id, original.id);
        assert_eq!(
            restored.time.compare(original.time),
            std::cmp::Ordering::Equal
        );
        assert_eq!(restored.value, original.value);
        assert_eq!(restored.interpolation, original.interpolation);
    }
}

#[test]
fn transitions_reject_independent_ranges_and_shared_source_curves_atomically() {
    let (original, clip, instance) = transition_document();
    for operation in [
        Operation::EffectRangeAt {
            clip: Reference::Id(clip),
            instance: Reference::Id(instance),
            start: Time::milliseconds(2600),
            end: Time::milliseconds(2800),
        },
        Operation::CurveSpace {
            clip: Reference::Id(clip),
            instance: Reference::Id(instance),
            parameter: "strength".into(),
            space: TimeSpace::Source,
        },
        Operation::InstanceRename {
            clip: Reference::Id(clip),
            instance: Reference::Id(instance),
            name: Some("\0invalid".into()),
        },
    ] {
        let mut request = commands::single(
            &original,
            beam_editor_domain::Edit::Rename {
                name: "unused".into(),
            },
        );
        request.commands = vec![Command {
            command_id: "invalid".into(),
            operation,
        }];
        assert!(commands::prepare(&original, &request).is_err());
        assert!(original.project.transitions[0].instance.name.is_none());
        assert!(original.project.transitions[0].instance.range.is_none());
    }
}

#[test]
fn sequence_range_is_converted_through_clip_local_offset_and_preserved_when_renamed() {
    let mut project = crate::fixtures::project();
    let instance = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .instantiate();
    let instance_id = instance.id;
    let mut clip = crate::fixtures::clip_mut(&mut project, 0);
    clip.start_ms = 2000;
    clip.duration_ms = 4000;
    clip.animation_offset_ms = 500;
    clip.instances.push(instance);
    let clip_id = clip.id;
    drop(clip);
    let original = Document::new(project);
    let ranged = apply(
        &original,
        Operation::EffectRangeAt {
            clip: Reference::Id(clip_id),
            instance: Reference::Id(instance_id),
            start: Time::milliseconds(2200),
            end: Time::milliseconds(3000),
        },
    );
    let renamed = apply(
        &ranged.document,
        Operation::InstanceRename {
            clip: Reference::Id(clip_id),
            instance: Reference::Id(instance_id),
            name: Some("Opening".into()),
        },
    );
    let clip = crate::fixtures::clip(&renamed.document.project, 0);
    let range = clip.instances[0].range.unwrap();
    assert_eq!(
        range.start.compare(Time::milliseconds(700)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        range.end.compare(Time::milliseconds(1500)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(clip.instances[0].name.as_deref(), Some("Opening"));
    assert!(
        clip.instances[0]
            .active(&clip, Time::milliseconds(2200))
            .unwrap()
    );
    assert!(
        !clip.instances[0]
            .active(&clip, Time::milliseconds(3000))
            .unwrap()
    );
    assert!(renamed.receipt.results[0].created.is_empty());
}

#[test]
fn values_reject_a_corrupt_clean_page_curve_before_the_evaluator_can_panic() {
    use beam_editor_domain::collections::{LazyPage, PersistentCollection, PersistentItem};
    use std::sync::Arc;
    let mut project = crate::fixtures::project();
    let mut clip = (*crate::fixtures::clip(&project, 0)).clone();
    let mut instance = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .instantiate();
    instance.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::ClipLocal,
            keys: vec![],
        },
    );
    clip.instances.push(instance);
    let clip_id = clip.id;
    let header = clip.header();
    let payload = Arc::new(vec![Arc::new(clip)]);
    project.clips = PersistentCollection::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers: vec![header],
        }],
        Arc::new(move |_| Ok(payload.clone())),
    )
    .unwrap();
    let document = Document::new(project);
    assert_eq!(document.project.clips.loaded_pages(), 0);
    beam_editor_domain::project::validation::document(&document).unwrap();
    let error =
        projections::parameter_values(&document, document.active_sequence, clip_id, Time::ZERO)
            .unwrap_err();
    assert!(error.to_string().contains("curve requires keyframes"));
    assert_eq!(document.project.clips.loaded_pages(), 1);
}
