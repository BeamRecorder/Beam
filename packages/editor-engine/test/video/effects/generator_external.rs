use super::types::Render;
use beam_editor_domain::{
    Document,
    animation::{Binding, Interpolation, Keyframe, Value},
    commands::{
        self,
        types::{Command, Operation, Reference, Transaction},
    },
    effects::{ExtensionPack, Processor},
    timing::{Time, TimeSpace},
};
use beam_editor_engine::{Project, project::store::ProjectStore, video::pipeline::prepare_update};

fn generator_project() -> Document {
    let mut project = Project::new("External generator".into());
    project.canvas.width = 64;
    project.canvas.height = 64;
    project.canvas.background = 0xff000000;
    let track = project.tracks.headers().next().unwrap().id;
    let mut solid = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.solid")
        .unwrap()
        .clone();
    solid.id = "studio.paper".into();
    solid.version = 3;
    solid.label = "Studio paper".into();
    assert_eq!(solid.processor, Processor::Solid);
    let extension = ExtensionPack::new(
        "studio.colors".into(),
        "studio".into(),
        7,
        vec![solid],
        vec![],
    )
    .unwrap();
    let curve = Binding::Curve {
        space: TimeSpace::ClipLocal,
        keys: vec![
            Keyframe {
                id: uuid::Uuid::new_v4(),
                time: Time::milliseconds(0),
                value: Value::Color([1., 0., 0., 1.]),
                interpolation: Interpolation::Linear,
            },
            Keyframe {
                id: uuid::Uuid::new_v4(),
                time: Time::milliseconds(1000),
                value: Value::Color([0., 0., 1., 1.]),
                interpolation: Interpolation::Linear,
            },
        ],
    };
    let document = Document::new(project);
    commands::prepare(
        &document,
        &Transaction {
            api_version: 1,
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: document.revision,
            idempotency_key: "external-generator".into(),
            commands: vec![
                Command {
                    command_id: "pack".into(),
                    operation: Operation::RegisterPack { pack: extension },
                },
                Command {
                    command_id: "generator".into(),
                    operation: Operation::GeneratorInsert {
                        track: Reference::Id(track),
                        definition_id: "studio.paper".into(),
                        definition_version: 3,
                        start_ms: 0,
                        duration_ms: 1000,
                        parameters: std::collections::BTreeMap::from([("color".into(), curve)]),
                    },
                },
            ],
        },
    )
    .unwrap()
    .document
}

#[test]
fn a_hashed_external_generator_animates_real_pixels_at_random_seek_order() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let document = generator_project();
        let provenance = &document.project.extension_packs[0];
        assert_eq!(
            (&provenance.namespace, provenance.version),
            (&"studio".to_string(), 7)
        );
        assert_eq!(provenance.definitions[0].version, 3);
        assert_eq!(provenance.sha256.len(), 64);
        let render = Render::new(root.path(), &document.project);
        let early = render.center(200);
        let late = render.center(800);
        assert!(early[0] > 190 && early[2] < 65, "{early:?}");
        assert!(late[2] > 190 && late[0] < 65, "{late:?}");
        assert_eq!(early, render.center(200));
        assert_eq!(late, render.center(800));
        let instance = crate::video::clip(&document.project, 0)
            .generator
            .as_ref()
            .unwrap()
            .id;
        assert!(
            beam_editor_engine::video::effects::compiled_instances(&render.pipeline)
                .contains(&instance)
        );
    });
}

#[test]
fn external_generator_parameter_publication_keeps_graph_and_persisted_hash() {
    use ges::prelude::*;
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let document = generator_project();
        let store = ProjectStore::lock(root.path()).unwrap();
        store.write(&document).unwrap();
        let (loaded, _) = store.read().unwrap();
        assert_eq!(
            loaded.project.extension_packs,
            document.project.extension_packs
        );
        let render = Render::new(root.path(), &loaded.project);
        let before = loaded.project;
        let mut after = before.clone();
        crate::video::clip_mut(&mut after, 0)
            .generator
            .as_mut()
            .unwrap()
            .parameters
            .insert(
                "color".into(),
                Binding::constant(Value::Color([0., 1., 0., 1.])),
            );
        let nodes = render
            .pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .map(|e| e.as_ptr() as usize)
            .collect::<Vec<_>>();
        let pending = prepare_update(&render.pipeline, &before, &after)
            .unwrap()
            .unwrap();
        assert!(render.center(800)[2] > 190);
        pending.apply();
        assert!(render.center(800)[1] > 240);
        assert_eq!(
            nodes,
            render
                .pipeline
                .iterate_recurse()
                .into_iter()
                .flatten()
                .map(|e| e.as_ptr() as usize)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            before.extension_packs, after.extension_packs,
            "instances cannot rewrite immutable catalogue provenance"
        );
        prepare_update(&render.pipeline, &after, &before)
            .unwrap()
            .unwrap()
            .apply();
        assert!(render.center(800)[2] > 190);
    });
}

#[test]
fn invalid_external_generator_controls_are_rejected_before_native_source_creation() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut document = generator_project();
        document
            .project
            .definitions
            .iter_mut()
            .find(|d| d.id == "studio.paper")
            .unwrap()
            .parameters[0]
            .key = "unused_color".into();
        assert!(
            beam_editor_engine::video::pipeline::build(root.path(), &document.project).is_err()
        );
        let mut document = generator_project();
        document.project.extension_packs[0].sha256 = "0".repeat(64);
        assert!(
            beam_editor_engine::video::pipeline::build(root.path(), &document.project).is_err()
        );
    });
}
