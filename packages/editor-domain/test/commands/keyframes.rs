use beam_editor_domain::{
    Document,
    animation::{Interpolation, Keyframe, Value},
    commands::{
        self,
        types::{Command, Operation, Reference, Transaction},
    },
    timing::{Time, TimeSpace},
};
use uuid::Uuid;

fn transaction(document: &Document, key: &str, operations: Vec<(&str, Operation)>) -> Transaction {
    Transaction {
        api_version: 1,
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: key.into(),
        commands: operations
            .into_iter()
            .map(|(id, operation)| Command {
                command_id: id.into(),
                operation,
            })
            .collect(),
    }
}

fn clip_and_parameter(document: &Document) -> (Uuid, Uuid) {
    let clip = crate::fixtures::clip(&document.project, 0);
    (clip.id, clip.instances[0].id)
}

#[test]
fn keyframe_add_at_update_and_remove_keep_a_sorted_typed_curve() {
    let initial = Document::new(crate::fixtures::project());
    let clip_id = crate::fixtures::clip(&initial.project, 0).id;
    let added = commands::prepare(
        &initial,
        &transaction(
            &initial,
            "key-add",
            vec![
                (
                    "effect",
                    Operation::EffectAdd {
                        clip: Reference::Id(clip_id),
                        definition_id: "beam.opacity".into(),
                        definition_version: 1,
                        parameters: Default::default(),
                    },
                ),
                (
                    "at",
                    Operation::KeyframeAt {
                        clip: Reference::Id(clip_id),
                        instance: Reference::Created {
                            index: 0,
                            created_by: "effect".into(),
                        },
                        parameter: "opacity".into(),
                        space: TimeSpace::ClipLocal,
                        sequence_time: Time::milliseconds(2_500),
                        value: Value::Number(0.8),
                        interpolation: Interpolation::Linear,
                    },
                ),
                (
                    "earlier",
                    Operation::KeyframeAdd {
                        clip: Reference::Id(clip_id),
                        instance: Reference::Created {
                            index: 0,
                            created_by: "effect".into(),
                        },
                        parameter: "opacity".into(),
                        space: TimeSpace::ClipLocal,
                        time: Time::milliseconds(1_000),
                        value: Value::Number(0.2),
                        interpolation: Interpolation::Linear,
                    },
                ),
            ],
        ),
    )
    .unwrap();
    let (clip_id, instance_id) = clip_and_parameter(&added.document);
    let added_clip = crate::fixtures::clip(&added.document.project, 0);
    let beam_editor_domain::animation::Binding::Curve { keys, .. } =
        &added_clip.instances[0].parameters["opacity"]
    else {
        panic!("numeric parameter should become an animated curve");
    };
    assert_eq!(keys.len(), 2);
    assert_eq!(
        keys[0].time.compare(Time::milliseconds(1_000)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        keys[1].time.compare(Time::milliseconds(2_500)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(added.receipt.results[1].created, vec![keys[1].id]);
    assert_eq!(added.receipt.results[2].created, vec![keys[0].id]);

    let updated_key = Keyframe {
        id: keys[0].id,
        time: Time::milliseconds(3_000),
        value: Value::Number(0.6),
        interpolation: Interpolation::Constant,
    };
    let updated = commands::prepare(
        &added.document,
        &transaction(
            &added.document,
            "key-update",
            vec![(
                "update",
                Operation::KeyframeUpdate {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(instance_id),
                    parameter: "opacity".into(),
                    keyframe: updated_key.clone(),
                },
            )],
        ),
    )
    .unwrap();
    let updated_clip = crate::fixtures::clip(&updated.document.project, 0);
    let beam_editor_domain::animation::Binding::Curve { keys: sorted, .. } =
        &updated_clip.instances[0].parameters["opacity"]
    else {
        panic!("update must retain the curve");
    };
    assert_eq!(sorted.len(), 2);
    assert_eq!(sorted[0].id, keys[1].id);
    assert_eq!(sorted[1].id, keys[0].id);

    let removed = commands::prepare(
        &updated.document,
        &transaction(
            &updated.document,
            "key-remove",
            vec![(
                "remove",
                Operation::KeyframeRemove {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(instance_id),
                    parameter: "opacity".into(),
                    keyframe_id: sorted[0].id,
                },
            )],
        ),
    )
    .unwrap();
    let removed_clip = crate::fixtures::clip(&removed.document.project, 0);
    let beam_editor_domain::animation::Binding::Curve {
        keys: remaining, ..
    } = &removed_clip.instances[0].parameters["opacity"]
    else {
        panic!("a single remaining key is still an animation curve");
    };
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].value, Value::Number(0.6));
    let flattened = commands::prepare(
        &removed.document,
        &transaction(
            &removed.document,
            "remove-final-key",
            vec![(
                "remove",
                Operation::KeyframeRemove {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(instance_id),
                    parameter: "opacity".into(),
                    keyframe_id: remaining[0].id,
                },
            )],
        ),
    )
    .unwrap();
    assert_eq!(
        crate::fixtures::clip(&flattened.document.project, 0).instances[0].parameters["opacity"],
        beam_editor_domain::animation::Binding::constant(Value::Number(0.6))
    );
}

#[test]
fn invalid_keyframe_target_space_or_value_rejects_the_whole_transaction() {
    let initial = Document::new(crate::fixtures::project());
    let clip_id = crate::fixtures::clip(&initial.project, 0).id;
    let effect = commands::prepare(
        &initial,
        &transaction(
            &initial,
            "effect",
            vec![(
                "effect",
                Operation::EffectAdd {
                    clip: Reference::Id(clip_id),
                    definition_id: "beam.opacity".into(),
                    definition_version: 1,
                    parameters: Default::default(),
                },
            )],
        ),
    )
    .unwrap();
    let (clip_id, instance_id) = clip_and_parameter(&effect.document);
    let missing_parameter = transaction(
        &effect.document,
        "missing",
        vec![(
            "bad",
            Operation::KeyframeAdd {
                clip: Reference::Id(clip_id),
                instance: Reference::Id(instance_id),
                parameter: "unknown".into(),
                space: TimeSpace::Sequence,
                time: Time::milliseconds(0),
                value: Value::Number(0.5),
                interpolation: Interpolation::Linear,
            },
        )],
    );
    assert!(commands::prepare(&effect.document, &missing_parameter).is_err());
    let missing_key = transaction(
        &effect.document,
        "missing-key",
        vec![(
            "remove",
            Operation::KeyframeRemove {
                clip: Reference::Id(clip_id),
                instance: Reference::Id(instance_id),
                parameter: "opacity".into(),
                keyframe_id: Uuid::new_v4(),
            },
        )],
    );
    assert!(commands::prepare(&effect.document, &missing_key).is_err());

    let curved = commands::prepare(
        &effect.document,
        &transaction(
            &effect.document,
            "first-key",
            vec![(
                "add",
                Operation::KeyframeAdd {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(instance_id),
                    parameter: "opacity".into(),
                    space: TimeSpace::Sequence,
                    time: Time::milliseconds(0),
                    value: Value::Number(0.25),
                    interpolation: Interpolation::Linear,
                },
            )],
        ),
    )
    .unwrap();
    let wrong_space = transaction(
        &curved.document,
        "wrong-space",
        vec![(
            "add",
            Operation::KeyframeAdd {
                clip: Reference::Id(clip_id),
                instance: Reference::Id(instance_id),
                parameter: "opacity".into(),
                space: TimeSpace::ClipLocal,
                time: Time::milliseconds(1),
                value: Value::Number(0.5),
                interpolation: Interpolation::Linear,
            },
        )],
    );
    assert!(commands::prepare(&curved.document, &wrong_space).is_err());

    let invalid_value = transaction(
        &effect.document,
        "wrong-type",
        vec![(
            "bad",
            Operation::KeyframeAdd {
                clip: Reference::Id(clip_id),
                instance: Reference::Id(instance_id),
                parameter: "opacity".into(),
                space: TimeSpace::ClipLocal,
                time: Time::milliseconds(0),
                value: Value::Boolean(true),
                interpolation: Interpolation::Constant,
            },
        )],
    );
    assert!(commands::prepare(&effect.document, &invalid_value).is_err());
    assert!(matches!(
        crate::fixtures::clip(&effect.document.project, 0).instances[0].parameters["opacity"],
        beam_editor_domain::animation::Binding::Constant { .. }
    ));
}
