use beam_editor_domain::{
    Document, Edit,
    animation::{Binding, Value},
    commands::{
        self,
        types::{Command, Operation},
    },
    effects::{
        definition,
        preset_types::{Preset, PresetTarget},
    },
    timing::{Time, TimeRange, TimeSpace},
};
use uuid::Uuid;

fn apply(document: &Document, target: PresetTarget, id: &str) -> commands::types::Prepared {
    let mut transaction = commands::single(document, Edit::Undo {});
    transaction.commands = vec![Command {
        command_id: "preset".into(),
        operation: Operation::ApplyPreset {
            target,
            preset_id: id.into(),
            preset_version: 1,
        },
    }];
    commands::prepare(document, &transaction).unwrap()
}
#[test]
fn repeated_named_effects_are_updated_only_by_uuid_and_undo_redo_keep_order() {
    let mut project = crate::fixtures::project();
    let first = definition(&project.definitions, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    let mut second = first.duplicate();
    second.name = Some("Same label".into());
    second.enabled = false;
    second.range = Some(TimeRange {
        space: TimeSpace::ClipLocal,
        start: Time::ZERO,
        end: Time::milliseconds(500),
    });
    crate::fixtures::clip_mut(&mut project, 0).instances = vec![first.clone(), second.clone()];
    let original = Document::new(project);
    let clip_id = crate::fixtures::clip(&original.project, 0).id;
    let prepared = apply(
        &original,
        PresetTarget::Effect {
            clip_id,
            instance_id: second.id,
        },
        "beam.opacity.fadeIn",
    );
    let clip = crate::fixtures::clip(&prepared.document.project, 0);
    assert_eq!(clip.instances[0], first);
    assert_eq!(
        (
            clip.instances[1].id,
            &clip.instances[1].name,
            clip.instances[1].enabled,
            clip.instances[1].range
        ),
        (second.id, &second.name, second.enabled, second.range)
    );
    let Binding::Curve { keys, .. } = &clip.instances[1].parameters["opacity"] else {
        panic!("expected preset curve")
    };
    assert_eq!(
        prepared.receipt.results[0].created,
        keys.iter().map(|key| key.id).collect::<Vec<_>>()
    );
    let undone = commands::prepare(
        &prepared.document,
        &commands::single(&prepared.document, Edit::Undo {}),
    )
    .unwrap();
    assert_eq!(undone.document.project.clips, original.project.clips);
    let redone = commands::prepare(
        &undone.document,
        &commands::single(&undone.document, Edit::Redo {}),
    )
    .unwrap();
    assert_eq!(
        redone.document.project.clips,
        prepared.document.project.clips
    );
}

#[test]
fn a_track_preset_updates_only_the_addressed_occurrence_and_returns_its_new_keys() {
    let mut project = beam_editor_domain::Project::new("Track preset".into());
    let track_id = project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Video)
        .unwrap()
        .id;
    let first = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    let mut second = first.duplicate();
    second.name = Some("Named lane fade".into());
    second.enabled = false;
    second.range = Some(TimeRange {
        space: TimeSpace::Sequence,
        start: Time::ZERO,
        end: Time::milliseconds(1500),
    });
    project
        .tracks
        .try_by_id_mut(track_id)
        .unwrap()
        .unwrap()
        .instances = vec![first.clone(), second.clone()];
    let document = Document::new(project);
    let target = PresetTarget::Track {
        track_id,
        instance_id: second.id,
    };
    let mut transaction = commands::single(&document, Edit::Undo {});
    transaction.commands = vec![Command {
        command_id: "track-preset".into(),
        operation: Operation::ApplyPreset {
            target: target.clone(),
            preset_id: "beam.opacity.fadeIn".into(),
            preset_version: 2,
        },
    }];
    let prepared = commands::prepare(&document, &transaction).unwrap();
    let track = prepared
        .document
        .project
        .tracks
        .try_by_id(track_id)
        .unwrap()
        .unwrap();
    assert_eq!(track.instances[0], first);
    let changed = &track.instances[1];
    assert_eq!(
        (changed.id, &changed.name, changed.enabled, changed.range),
        (second.id, &second.name, second.enabled, second.range)
    );
    let Binding::Curve { keys, space } = &changed.parameters["opacity"] else {
        panic!("curve")
    };
    assert_eq!(*space, TimeSpace::Sequence);
    assert_eq!(
        prepared.receipt.results[0].created,
        keys.iter().map(|key| key.id).collect::<Vec<_>>()
    );
    let mut rejected = document.project.clone();
    assert!(commands::presets::apply(&mut rejected, &target, "beam.opacity.fadeIn", 1).is_err());
    assert_eq!(rejected, document.project);
}

#[test]
fn sequence_presets_require_the_correct_document_context_and_existing_instance() {
    let mut project = beam_editor_domain::Project::new("Context".into());
    let instance = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    let id = instance.id;
    project.sequence_instances.push(instance);
    let document = Document::new(project);
    let actual = PresetTarget::Sequence {
        sequence_id: document.active_sequence,
        instance_id: id,
    };
    assert!(
        commands::presets::apply(
            &mut document.project.clone(),
            &actual,
            "beam.opacity.fadeIn",
            2
        )
        .is_err()
    );
    for target in [
        PresetTarget::Sequence {
            sequence_id: Uuid::new_v4(),
            instance_id: id,
        },
        PresetTarget::Sequence {
            sequence_id: document.active_sequence,
            instance_id: Uuid::new_v4(),
        },
        PresetTarget::Track {
            track_id: Uuid::new_v4(),
            instance_id: id,
        },
    ] {
        let mut rejected = document.clone();
        assert!(
            commands::presets::apply_document(&mut rejected, &target, "beam.opacity.fadeIn", 2)
                .is_err()
        );
        assert_eq!(rejected, document);
    }
}
#[test]
fn generators_and_transitions_accept_explicit_target_ids_without_replacing_instances() {
    let mut project = crate::fixtures::project();
    let generator = definition(&project.definitions, "beam.solid", 1)
        .unwrap()
        .instantiate();
    let mut generated = (*crate::fixtures::clip(&project, 0)).clone();
    generated.id = Uuid::new_v4();
    generated.asset_id = Uuid::nil();
    generated.start_ms = 10_000;
    generated.duration_ms = 1000;
    generated.generator = Some(generator.clone());
    let generated_id = generated.id;
    project.clips.try_push(generated).unwrap();
    project.presets.push(Preset {
        id: "test.solid.blue".into(),
        version: 1,
        label: "Blue".into(),
        definition_id: "beam.solid".into(),
        definition_version: 1,
        parameters: [(
            "color".into(),
            Binding::constant(Value::Color([0., 0., 1., 1.])),
        )]
        .into_iter()
        .collect(),
    });
    let original = Document::new(project);
    let prepared = apply(
        &original,
        PresetTarget::Generator {
            clip_id: generated_id,
            instance_id: generator.id,
        },
        "test.solid.blue",
    );
    let result = prepared
        .document
        .project
        .clips
        .try_by_id(generated_id)
        .unwrap()
        .unwrap();
    assert_eq!(result.generator.as_ref().unwrap().id, generator.id);
    assert_eq!(
        result.generator.as_ref().unwrap().parameters["color"],
        Binding::constant(Value::Color([0., 0., 1., 1.]))
    );
    let mut project = crate::fixtures::project();
    let source = crate::fixtures::clip(&project, 0).id;
    project = beam_editor_domain::timeline::edit::apply(
        &project,
        &Edit::Split {
            id: source,
            time_ms: 5000,
        },
    )
    .unwrap();
    let instance = definition(&project.definitions, "beam.crossfade", 1)
        .unwrap()
        .instantiate();
    project
        .transitions
        .push(beam_editor_domain::effects::Transition {
            instance: instance.clone(),
            from_clip: source,
            to_clip: crate::fixtures::clip(&project, 1).id,
            duration_ms: 300,
        });
    project.presets.push(Preset {
        id: "test.crossfade".into(),
        version: 1,
        label: "Crossfade".into(),
        definition_id: "beam.crossfade".into(),
        definition_version: 1,
        parameters: Default::default(),
    });
    let document = Document::new(project);
    let prepared = apply(
        &document,
        PresetTarget::Transition {
            instance_id: instance.id,
        },
        "test.crossfade",
    );
    assert_eq!(
        prepared.document.project.transitions,
        document.project.transitions
    );
}
#[test]
fn wrong_ids_kind_definition_or_preset_version_reject_the_entire_transaction() {
    let mut project = crate::fixtures::project();
    let instance = definition(&project.definitions, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    crate::fixtures::clip_mut(&mut project, 0)
        .instances
        .push(instance.clone());
    let document = Document::new(project);
    let clip_id = crate::fixtures::clip(&document.project, 0).id;
    for target in [
        PresetTarget::Effect {
            clip_id: Uuid::nil(),
            instance_id: instance.id,
        },
        PresetTarget::Effect {
            clip_id,
            instance_id: Uuid::nil(),
        },
        PresetTarget::Generator {
            clip_id,
            instance_id: instance.id,
        },
        PresetTarget::Transition {
            instance_id: instance.id,
        },
    ] {
        assert!(
            commands::presets::apply(
                &mut document.project.clone(),
                &target,
                "beam.opacity.fadeIn",
                1
            )
            .is_err()
        );
    }
    for (id, version) in [
        ("beam.opacity.fadeIn", 99),
        ("missing", 1),
        ("beam.color.warm", 1),
    ] {
        let mut request = commands::single(
            &document,
            Edit::Move {
                id: clip_id,
                track_id: crate::fixtures::clip(&document.project, 0).track_id,
                start_ms: 100,
            },
        );
        request.commands.push(Command {
            command_id: "preset".into(),
            operation: Operation::ApplyPreset {
                target: PresetTarget::Effect {
                    clip_id,
                    instance_id: instance.id,
                },
                preset_id: id.into(),
                preset_version: version,
            },
        });
        assert!(commands::prepare(&document, &request).is_err());
        assert_eq!(document.revision, 0);
    }
}
