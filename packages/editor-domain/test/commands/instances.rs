use beam_editor_domain::{
    Document,
    commands::{
        self,
        operations::resolve,
        types::{Command, CommandResult, Operation, Reference},
    },
};
use uuid::Uuid;

#[test]
fn one_batch_can_name_a_clip_effect_and_the_generator_returned_by_insertion() {
    let original = Document::new(crate::fixtures::project());
    let clip_id = crate::fixtures::clip(&original.project, 0).id;
    let track_id = original.project.tracks.headers().next().unwrap().id;
    let earlier = |name: &str, index| Reference::Created {
        created_by: name.into(),
        index,
    };
    let mut transaction = commands::single(
        &original,
        beam_editor_domain::Edit::Rename {
            name: "unused".into(),
        },
    );
    transaction.commands = vec![
        Command {
            command_id: "effect".into(),
            operation: Operation::EffectAdd {
                clip: Reference::Id(clip_id),
                definition_id: "beam.opacity".into(),
                definition_version: 1,
                parameters: Default::default(),
            },
        },
        Command {
            command_id: "generator".into(),
            operation: Operation::GeneratorInsert {
                track: Reference::Id(track_id),
                definition_id: "beam.solid".into(),
                definition_version: 1,
                start_ms: 10_000,
                duration_ms: 1000,
                parameters: Default::default(),
            },
        },
        Command {
            command_id: "effectName".into(),
            operation: Operation::InstanceRename {
                clip: Reference::Id(clip_id),
                instance: earlier("effect", 0),
                name: Some("Opening opacity".into()),
            },
        },
        Command {
            command_id: "generatorName".into(),
            operation: Operation::InstanceRename {
                clip: earlier("generator", 0),
                instance: earlier("generator", 1),
                name: Some("Background".into()),
            },
        },
    ];
    let result = commands::prepare(&original, &transaction).unwrap();
    assert_eq!(
        crate::fixtures::clip(&result.document.project, 0).instances[0]
            .name
            .as_deref(),
        Some("Opening opacity")
    );
    let generated = crate::fixtures::clip(&result.document.project, 1);
    assert_eq!(
        generated.generator.as_ref().unwrap().name.as_deref(),
        Some("Background")
    );
    assert_eq!(
        result.receipt.results[1].created,
        vec![generated.id, generated.generator.as_ref().unwrap().id]
    );
    assert!(result.receipt.results[2].created.is_empty());
    assert!(result.receipt.results[3].created.is_empty());
    assert!(
        crate::fixtures::clip(&original.project, 0)
            .instances
            .is_empty()
    );
}

#[test]
fn missing_or_nil_references_and_instances_return_errors() {
    assert!(resolve(&Reference::Id(Uuid::nil()), &[]).is_err());
    let created = Reference::Created {
        created_by: "later".into(),
        index: 0,
    };
    assert!(resolve(&created, &[]).is_err());
    assert!(
        resolve(
            &created,
            &[CommandResult {
                command_id: "later".into(),
                created: vec![]
            }]
        )
        .is_err()
    );
    let original = Document::new(crate::fixtures::project());
    let mut request = commands::single(
        &original,
        beam_editor_domain::Edit::Rename {
            name: "unused".into(),
        },
    );
    for clip_id in [
        crate::fixtures::clip(&original.project, 0).id,
        Uuid::new_v4(),
    ] {
        request.commands = vec![Command {
            command_id: "name".into(),
            operation: Operation::InstanceRename {
                clip: Reference::Id(clip_id),
                instance: Reference::Id(Uuid::new_v4()),
                name: Some("Missing".into()),
            },
        }];
        assert!(commands::prepare(&original, &request).is_err());
    }
}
