use beam_editor_domain::{
    Document, Edit,
    animation::{Binding, Value},
    commands::{
        self,
        types::{Command, Operation, Reference, Transaction},
    },
    effects::{Definition, Domain, Parameter, ParameterType, Processor},
    project::validation,
};
use uuid::Uuid;

fn request(document: &Document, commands: Vec<Command>, key: &str) -> Transaction {
    Transaction {
        api_version: 1,
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: key.into(),
        commands,
    }
}
fn command(id: &str, operation: Operation) -> Command {
    Command {
        command_id: id.into(),
        operation,
    }
}

#[test]
fn batch_can_reference_a_created_clip_and_effect_and_preserves_the_original_for_dry_run() {
    let project = crate::fixtures::project();
    let asset_id = project.assets[0].id;
    let track_id = project.tracks.headers().next().unwrap().id;
    let document = Document::new(project);
    let request = request(
        &document,
        vec![
            command(
                "newClip",
                Operation::Insert {
                    asset_id,
                    track: Reference::Id(track_id),
                    start_ms: 10_000,
                    source_in_ms: 0,
                    duration_ms: 4_000,
                },
            ),
            command(
                "newFx",
                Operation::EffectAdd {
                    clip: Reference::Created {
                        index: 0,
                        created_by: "newClip".into(),
                    },
                    definition_id: "beam.opacity".into(),
                    definition_version: 1,
                    parameters: Default::default(),
                },
            ),
        ],
        "batch-1",
    );
    let prepared = commands::prepare(&document, &request).unwrap();
    assert_eq!(
        prepared.document.project.clips.len(),
        document.project.clips.len() + 1
    );
    let inserted = prepared
        .document
        .project
        .clips
        .headers()
        .find(|clip| clip.start_ms == 10_000)
        .map(|clip| clip.id)
        .and_then(|id| prepared.document.project.clips.try_by_id(id).unwrap())
        .unwrap();
    assert_eq!(inserted.instances.len(), 1);
    assert_ne!(inserted.instances[0].id, Uuid::nil());
    assert_eq!(document.project.clips.len(), 1);
    assert!(
        crate::fixtures::clip(&document.project, 0)
            .instances
            .is_empty()
    );
    assert_eq!(prepared.receipt.results[0].created[0], inserted.id);
    assert_eq!(
        prepared.receipt.results[1].created,
        vec![inserted.instances[0].id]
    );
    assert!(validation::document(&prepared.document).is_ok());
}

#[test]
fn command_batch_rejection_is_atomic_and_revision_conflicts_are_explicit() {
    let document = Document::new(crate::fixtures::project());
    let clip_id = crate::fixtures::clip(&document.project, 0).id;
    let invalid_batch = request(
        &document,
        vec![
            command(
                "change",
                Operation::Edit {
                    edit: Edit::Rename {
                        name: "Changed".into(),
                    },
                },
            ),
            command(
                "missing",
                Operation::EffectDuplicate {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(Uuid::new_v4()),
                },
            ),
        ],
        "reject-1",
    );
    assert!(commands::prepare(&document, &invalid_batch).is_err());
    assert_eq!(document.project.name, "Test");
    let mut stale = request(
        &document,
        vec![command(
            "rename",
            Operation::Edit {
                edit: Edit::Rename {
                    name: "Stale".into(),
                },
            },
        )],
        "stale-1",
    );
    stale.expected_revision += 1;
    assert!(matches!(
        commands::prepare(&document, &stale),
        Err(beam_editor_domain::EditorError::Conflict { .. })
    ));
}

#[test]
fn idempotency_replays_identical_requests_and_rejects_key_reuse() {
    let document = Document::new(crate::fixtures::project());
    let clip_id = crate::fixtures::clip(&document.project, 0).id;
    let transaction = request(
        &document,
        vec![command(
            "duplicate",
            Operation::EffectAdd {
                clip: Reference::Id(clip_id),
                definition_id: "beam.opacity".into(),
                definition_version: 1,
                parameters: Default::default(),
            },
        )],
        "stable-key",
    );
    let first = commands::prepare(&document, &transaction).unwrap();
    let replay = commands::prepare(&first.document, &transaction).unwrap();
    assert!(replay.replay);
    assert_eq!(replay.document, first.document);
    let mut changed = transaction;
    changed.commands[0] = command(
        "another",
        Operation::ParameterSet {
            clip: Reference::Id(clip_id),
            instance: Reference::Id(first.receipt.results[0].created[0]),
            parameter: "opacity".into(),
            binding: Binding::constant(beam_editor_domain::animation::Value::Number(0.5)),
        },
    );
    assert!(commands::prepare(&first.document, &changed).is_err());
}

#[test]
fn ten_thousand_clips_on_multiple_tracks_validate_without_a_product_limit() {
    let mut project = crate::fixtures::project();
    let source = project.assets[0].clone();
    let first_track = project.tracks.headers().next().unwrap().id;
    let extra =
        beam_editor_domain::Track::new("Video 2".into(), beam_editor_domain::TrackKind::Video);
    let second_track = extra.id;
    project.tracks.try_push(extra).unwrap();
    project.clips = Default::default();
    for index in 0..10_000u64 {
        project
            .clips
            .try_push(beam_editor_domain::Clip {
                id: Uuid::new_v4(),
                asset_id: source.id,
                track_id: if index % 2 == 0 {
                    first_track
                } else {
                    second_track
                },
                start_ms: index / 2,
                source_in_ms: 0,
                duration_ms: 1,
                effects: Default::default(),
                cursor_style: None,
                title: None,
                instances: vec![],
                rate: Default::default(),
                animation_offset_ms: 0,
                generator: None,
                link_group: None,
            })
            .unwrap();
    }
    assert_eq!(project.clips.len(), 10_000);
    assert!(validation::project(&project).is_ok());
}

#[test]
fn registered_shader_pack_is_discoverable_and_instantiable_with_generic_numeric_parameters() {
    let document = Document::new(crate::fixtures::project());
    let clip_id = crate::fixtures::clip(&document.project, 0).id;
    let definition = Definition {
        targets: beam_editor_domain::effects::scope_types::clip_targets(),
        id: "example.tint".into(),
        version: 1,
        label: "Tint".into(),
        domain: Domain::Video,
        parameters: vec![Parameter {
            key: "strength".into(),
            label: "Strength".into(),
            group: "Color".into(),
            unit: String::new(),
            value_type: ParameterType::Number {
                min: 0.,
                max: 1.,
                step: 0.01,
            },
            default: Value::Number(0.5),
            animatable: true,
        }],
        processor: Processor::Shader {
            fragment: "void main() { gl_FragColor = vec4(1.0); }".into(),
        },
        timeline_region: true,
    };
    let prepared = commands::prepare(
        &document,
        &request(
            &document,
            vec![
                command(
                    "pack",
                    Operation::RegisterPack {
                        pack: beam_editor_domain::effects::ExtensionPack::new(
                            "example.pack".into(),
                            "example".into(),
                            1,
                            vec![definition.clone()],
                            vec![],
                        )
                        .unwrap(),
                    },
                ),
                command(
                    "instance",
                    Operation::EffectAdd {
                        clip: Reference::Id(clip_id),
                        definition_id: definition.id.clone(),
                        definition_version: 1,
                        parameters: Default::default(),
                    },
                ),
            ],
            "extension",
        ),
    )
    .unwrap();
    let registered = prepared
        .document
        .project
        .definitions
        .iter()
        .find(|item| item.id == "example.tint")
        .unwrap();
    assert_eq!(registered, &definition);
    assert_eq!(
        crate::fixtures::clip(&prepared.document.project, 0).instances[0].definition_id,
        "example.tint"
    );
    assert_eq!(
        crate::fixtures::clip(&prepared.document.project, 0).instances[0].parameters["strength"],
        Binding::constant(Value::Number(0.5))
    );

    let mut invalid = definition;
    invalid.parameters[0].key = "time".into();
    let rejected = request(
        &document,
        vec![command(
            "pack",
            Operation::RegisterPack {
                pack: beam_editor_domain::effects::ExtensionPack {
                    id: "example.bad".into(),
                    namespace: "example".into(),
                    version: 1,
                    sha256: "0".repeat(64),
                    definitions: vec![invalid],
                    presets: vec![],
                },
            },
        )],
        "reserved-shader-uniform",
    );
    assert!(commands::prepare(&document, &rejected).is_err());
    assert!(
        !document
            .project
            .definitions
            .iter()
            .any(|item| item.id == "example.tint")
    );
}
