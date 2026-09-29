use beam_editor_domain::{
    Document, Edit, Project,
    animation::{Binding, Interpolation, Value},
    commands::{
        self,
        scope_types::{ScopeAddress, ScopedAction},
        types::{Command, Operation, Reference},
    },
    effects::preset_types::PresetTarget,
    timing::{Time, TimeSpace},
};

fn prepare(
    document: &Document,
    target: ScopeAddress,
    actions: Vec<ScopedAction>,
) -> commands::types::Prepared {
    let mut request = commands::single(document, Edit::Undo {});
    request.commands = actions
        .into_iter()
        .enumerate()
        .map(|(index, action)| Command {
            command_id: format!("c{index}"),
            operation: Operation::ScopedEffect {
                target: target.clone(),
                action,
            },
        })
        .collect();
    commands::prepare(document, &request).unwrap()
}
fn add() -> ScopedAction {
    ScopedAction::Add {
        definition_id: "beam.opacity".into(),
        definition_version: 2,
        parameters: Default::default(),
    }
}
fn created(command: &str) -> Reference {
    Reference::Created {
        created_by: command.into(),
        index: 0,
    }
}

#[test]
fn track_receipts_return_only_new_instances_and_keys_without_loading_ten_thousand_clips() {
    let (document, loads, _, _, _) = super::created::lazy_document(true);
    let track_id = document
        .project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Video)
        .unwrap()
        .id;
    let prepared = prepare(
        &document,
        ScopeAddress::Track {
            track: Reference::Id(track_id),
        },
        vec![
            add(),
            ScopedAction::KeyframeAdd {
                instance: created("c0"),
                parameter: "opacity".into(),
                time: Time::milliseconds(500),
                value: Value::Number(0.5),
                interpolation: Interpolation::Linear,
            },
            ScopedAction::Duplicate {
                instance: created("c0"),
            },
        ],
    );
    let track = prepared
        .document
        .project
        .tracks
        .try_by_id(track_id)
        .unwrap()
        .unwrap();
    let Binding::Curve {
        keys: first_keys,
        space,
    } = &track.instances[0].parameters["opacity"]
    else {
        panic!("curve")
    };
    let Binding::Curve {
        keys: second_keys, ..
    } = &track.instances[1].parameters["opacity"]
    else {
        panic!("curve")
    };
    assert_eq!(*space, TimeSpace::Sequence);
    assert_eq!(
        prepared.receipt.results[0].created,
        vec![track.instances[0].id]
    );
    assert_eq!(prepared.receipt.results[1].created, vec![first_keys[0].id]);
    assert_eq!(
        prepared.receipt.results[2].created,
        vec![track.instances[1].id, second_keys[0].id]
    );
    assert_eq!(loads.load(std::sync::atomic::Ordering::SeqCst), 0);
    assert_eq!(prepared.document.project.clips.loaded_pages(), 0);
    assert!(
        document
            .project
            .tracks
            .try_by_id(track_id)
            .unwrap()
            .unwrap()
            .instances
            .is_empty()
    );
}

#[test]
fn sequence_and_track_stacks_presets_reopen_and_undo_with_independent_identity() {
    let original = Document::new(Project::new("Scoped history".into()));
    let sequence = original.active_sequence;
    let added = prepare(
        &original,
        ScopeAddress::Sequence {
            sequence_id: sequence,
        },
        vec![add(), add()],
    );
    let second = added.document.project.sequence_instances[1].id;
    let mut request = commands::single(&added.document, Edit::Undo {});
    request.commands = vec![Command {
        command_id: "preset".into(),
        operation: Operation::ApplyPreset {
            target: PresetTarget::Sequence {
                sequence_id: sequence,
                instance_id: second,
            },
            preset_id: "beam.opacity.fadeIn".into(),
            preset_version: 2,
        },
    }];
    let preset = commands::prepare(&added.document, &request).unwrap();
    assert_eq!(
        preset.document.project.sequence_instances[0],
        added.document.project.sequence_instances[0]
    );
    let Binding::Curve { space, keys } =
        &preset.document.project.sequence_instances[1].parameters["opacity"]
    else {
        panic!("curve")
    };
    assert_eq!(*space, TimeSpace::Sequence);
    assert_eq!(
        preset.receipt.results[0].created,
        keys.iter().map(|key| key.id).collect::<Vec<_>>()
    );
    let track_id = preset
        .document
        .project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Video)
        .unwrap()
        .id;
    let tracked = prepare(
        &preset.document,
        ScopeAddress::Track {
            track: Reference::Id(track_id),
        },
        vec![add()],
    );
    let root = tempfile::tempdir().unwrap();
    let index = beam_editor_domain::project::blocks::index(root.path(), &tracked.document).unwrap();
    let loaded = beam_editor_domain::project::blocks::load(root.path(), index).unwrap();
    assert_eq!(loaded, tracked.document);
    let undone = commands::prepare(&loaded, &commands::single(&loaded, Edit::Undo {})).unwrap();
    assert_eq!(
        undone.document.project.sequence_instances,
        preset.document.project.sequence_instances
    );
    assert!(
        undone
            .document
            .project
            .tracks
            .try_by_id(track_id)
            .unwrap()
            .unwrap()
            .instances
            .is_empty()
    );
    let undone = commands::prepare(
        &undone.document,
        &commands::single(&undone.document, Edit::Undo {}),
    )
    .unwrap();
    assert_eq!(
        undone.document.project.sequence_instances,
        added.document.project.sequence_instances
    );
}

#[test]
fn invalid_scope_clock_definition_and_context_reject_the_transaction_atomically() {
    let document = Document::new(Project::new("Rejected scopes".into()));
    for action in [
        ScopedAction::Add {
            definition_id: "beam.opacity".into(),
            definition_version: 1,
            parameters: Default::default(),
        },
        ScopedAction::Add {
            definition_id: "beam.camera.zoom".into(),
            definition_version: 1,
            parameters: Default::default(),
        },
        ScopedAction::Add {
            definition_id: "beam.solid".into(),
            definition_version: 1,
            parameters: Default::default(),
        },
        ScopedAction::Add {
            definition_id: "beam.opacity".into(),
            definition_version: 2,
            parameters: [(
                "opacity".into(),
                Binding::Curve {
                    space: TimeSpace::ClipLocal,
                    keys: vec![],
                },
            )]
            .into(),
        },
    ] {
        let mut request = commands::single(&document, Edit::Undo {});
        request.commands = vec![Command {
            command_id: "reject".into(),
            operation: Operation::ScopedEffect {
                target: ScopeAddress::Sequence {
                    sequence_id: document.active_sequence,
                },
                action,
            },
        }];
        assert!(commands::prepare(&document, &request).is_err());
        assert!(document.project.sequence_instances.is_empty());
    }
    let mut request = commands::single(&document, Edit::Undo {});
    request.commands = vec![Command {
        command_id: "wrong".into(),
        operation: Operation::ScopedEffect {
            target: ScopeAddress::Sequence {
                sequence_id: uuid::Uuid::new_v4(),
            },
            action: add(),
        },
    }];
    assert!(commands::prepare(&document, &request).is_err());
}
