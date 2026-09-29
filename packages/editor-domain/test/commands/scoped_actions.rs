use beam_editor_domain::{
    Document, Project,
    animation::{Binding, Interpolation, Value},
    commands::{
        operations,
        scope_types::{ScopeAddress, ScopedAction},
        types::{Operation, Reference},
    },
    timing::{Time, TimeRange, TimeSpace},
};

fn apply(
    document: &mut Document,
    action: ScopedAction,
) -> beam_editor_domain::Result<Vec<uuid::Uuid>> {
    let original = document.clone();
    operations::apply(
        document,
        &original,
        &Operation::ScopedEffect {
            target: ScopeAddress::Sequence {
                sequence_id: document.active_sequence,
            },
            action,
        },
        &[],
    )
}
#[test]
fn stack_actions_keep_order_and_address_only_one_named_animated_occurrence() {
    let mut document = Document::new(Project::new("Actions".into()));
    for _ in 0..2 {
        apply(
            &mut document,
            ScopedAction::Add {
                definition_id: "beam.opacity".into(),
                definition_version: 2,
                parameters: Default::default(),
            },
        )
        .unwrap();
    }
    let first = document.project.sequence_instances[0].id;
    let second = document.project.sequence_instances[1].id;
    apply(
        &mut document,
        ScopedAction::Rename {
            instance: Reference::Id(second),
            name: Some("Last fade".into()),
        },
    )
    .unwrap();
    apply(
        &mut document,
        ScopedAction::Bypass {
            instance: Reference::Id(second),
            enabled: false,
        },
    )
    .unwrap();
    apply(
        &mut document,
        ScopedAction::Range {
            instance: Reference::Id(second),
            range: Some(TimeRange {
                space: TimeSpace::Sequence,
                start: Time::ZERO,
                end: Time::milliseconds(500),
            }),
        },
    )
    .unwrap();
    apply(
        &mut document,
        ScopedAction::Reorder {
            instance: Reference::Id(second),
            index: 0,
        },
    )
    .unwrap();
    assert_eq!(
        document
            .project
            .sequence_instances
            .iter()
            .map(|i| i.id)
            .collect::<Vec<_>>(),
        vec![second, first]
    );
    assert!(!document.project.sequence_instances[0].enabled);
    let key_ids = apply(
        &mut document,
        ScopedAction::KeyframeAdd {
            instance: Reference::Id(second),
            parameter: "opacity".into(),
            time: Time::ZERO,
            value: Value::Number(0.2),
            interpolation: Interpolation::Linear,
        },
    )
    .unwrap();
    assert_eq!(key_ids.len(), 1);
    let Binding::Curve { keys, .. } = &document.project.sequence_instances[0].parameters["opacity"]
    else {
        panic!("curve")
    };
    let mut key = keys[0].clone();
    key.time = Time::milliseconds(200);
    key.value = Value::Number(0.7);
    assert!(
        apply(
            &mut document,
            ScopedAction::KeyframeUpdate {
                instance: Reference::Id(second),
                parameter: "opacity".into(),
                keyframe: key
            }
        )
        .unwrap()
        .is_empty()
    );
    apply(
        &mut document,
        ScopedAction::KeyframeRemove {
            instance: Reference::Id(second),
            parameter: "opacity".into(),
            keyframe_id: key_ids[0],
        },
    )
    .unwrap();
    assert_eq!(
        document.project.sequence_instances[0].parameters["opacity"],
        Binding::constant(Value::Number(0.7))
    );
    apply(
        &mut document,
        ScopedAction::ParameterSet {
            instance: Reference::Id(first),
            parameter: "opacity".into(),
            binding: Binding::constant(Value::Number(0.4)),
        },
    )
    .unwrap();
    let mut replacement = document.project.sequence_instances[1].clone();
    replacement.name = Some("Updated".into());
    apply(
        &mut document,
        ScopedAction::Update {
            instance: replacement,
        },
    )
    .unwrap();
    apply(
        &mut document,
        ScopedAction::Remove {
            instance: Reference::Id(second),
        },
    )
    .unwrap();
    assert_eq!(document.project.sequence_instances[0].id, first);
    assert_eq!(
        document.project.sequence_instances[0].name.as_deref(),
        Some("Updated")
    );
    assert!(
        apply(
            &mut document,
            ScopedAction::Reorder {
                instance: Reference::Id(first),
                index: 1
            }
        )
        .is_err()
    );
    assert!(
        apply(
            &mut document,
            ScopedAction::Remove {
                instance: Reference::Id(second)
            }
        )
        .is_err()
    );
}

#[test]
fn invalid_stack_and_parameter_addresses_never_publish_partial_scoped_mutations() {
    use beam_editor_domain::{
        Edit,
        commands::{self, types::Command},
    };
    let mut project = Project::new("Failures".into());
    let effect = beam_editor_domain::effects::definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    let id = effect.id;
    project.sequence_instances.push(effect.clone());
    let original = Document::new(project);
    let mut missing = effect;
    missing.id = uuid::Uuid::new_v4();
    for action in [
        ScopedAction::Add {
            definition_id: "missing".into(),
            definition_version: 2,
            parameters: Default::default(),
        },
        ScopedAction::Update { instance: missing },
        ScopedAction::ParameterSet {
            instance: Reference::Id(id),
            parameter: "missing".into(),
            binding: Binding::constant(Value::Number(0.5)),
        },
        ScopedAction::Rename {
            instance: Reference::Id(id),
            name: Some("  ".into()),
        },
        ScopedAction::Range {
            instance: Reference::Id(id),
            range: Some(TimeRange {
                space: TimeSpace::Sequence,
                start: Time::ZERO,
                end: Time::ZERO,
            }),
        },
        ScopedAction::KeyframeRemove {
            instance: Reference::Id(id),
            parameter: "opacity".into(),
            keyframe_id: uuid::Uuid::new_v4(),
        },
        ScopedAction::Reorder {
            instance: Reference::Id(id),
            index: usize::MAX,
        },
        ScopedAction::Duplicate {
            instance: Reference::Id(uuid::Uuid::new_v4()),
        },
    ] {
        let mut transaction = commands::single(&original, Edit::Undo {});
        transaction.commands = vec![Command {
            command_id: "bad".into(),
            operation: Operation::ScopedEffect {
                target: ScopeAddress::Sequence {
                    sequence_id: original.active_sequence,
                },
                action,
            },
        }];
        assert!(commands::prepare(&original, &transaction).is_err());
        assert_eq!(original.project.sequence_instances.len(), 1);
        assert_eq!(
            original.project.sequence_instances[0].parameters["opacity"],
            Binding::constant(Value::Number(1.))
        );
    }
}
