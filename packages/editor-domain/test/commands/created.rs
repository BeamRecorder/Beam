use beam_editor_domain::{
    Document, EditorError,
    animation::{Binding, Interpolation, Keyframe, Value},
    collections::{LazyPage, PAGE_SIZE, PersistentCollection, PersistentItem},
    commands::{
        self, operations,
        types::{Command, Operation, Reference, Transaction},
    },
    timing::{Time, TimeSpace},
};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use uuid::Uuid;

pub(super) fn lazy_document(fail: bool) -> (Document, Arc<AtomicUsize>, Uuid, Uuid, Uuid) {
    let mut project = crate::fixtures::project();
    let template = crate::fixtures::clip(&project, 0);
    let definition = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap();
    let clips = (0..10_000)
        .map(|index| {
            let mut clip = (*template).clone();
            clip.id = Uuid::new_v4();
            clip.start_ms = index;
            clip.duration_ms = 1;
            let mut instance = definition.instantiate();
            instance.parameters.insert(
                "opacity".into(),
                Binding::Curve {
                    space: TimeSpace::ClipLocal,
                    keys: vec![Keyframe {
                        id: Uuid::new_v4(),
                        time: Time::ZERO,
                        value: Value::Number(0.5),
                        interpolation: Interpolation::Linear,
                    }],
                },
            );
            clip.instances = vec![instance];
            Arc::new(clip)
        })
        .collect::<Vec<_>>();
    let target = &clips[7_500];
    let clip_id = target.id;
    let instance_id = target.instances[0].id;
    let Binding::Curve { keys, .. } = &target.instances[0].parameters["opacity"] else {
        unreachable!()
    };
    let existing_key = keys[0].id;
    let mut blocks = HashMap::new();
    let pages = clips
        .chunks(PAGE_SIZE)
        .enumerate()
        .map(|(index, values)| {
            let hash = format!("{index:064x}");
            blocks.insert(hash.clone(), Arc::new(values.to_vec()));
            LazyPage {
                hash,
                headers: values.iter().map(|clip| clip.header()).collect(),
            }
        })
        .collect();
    let loads = Arc::new(AtomicUsize::new(0));
    let counted = loads.clone();
    project.clips = PersistentCollection::from_lazy(
        pages,
        Arc::new(move |hash| {
            counted.fetch_add(1, Ordering::SeqCst);
            if fail {
                return Err(EditorError::Invalid("decision block unavailable".into()));
            }
            blocks
                .get(hash)
                .cloned()
                .ok_or_else(|| EditorError::Invalid("missing decision block".into()))
        }),
    )
    .unwrap();
    (
        Document::new(project),
        loads,
        clip_id,
        instance_id,
        existing_key,
    )
}

#[test]
fn one_parameter_transaction_loads_one_of_seventy_nine_pages_and_returns_only_the_new_key() {
    let (document, loads, clip_id, instance_id, existing_key) = lazy_document(false);
    assert_eq!(document.project.clips.page_count(), 79);
    assert_eq!(document.project.clips.loaded_pages(), 0);
    let new_key = Uuid::new_v4();
    let prepared = commands::prepare(
        &document,
        &Transaction {
            api_version: 1,
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: 0,
            idempotency_key: "one-page".into(),
            commands: vec![Command {
                command_id: "curve".into(),
                operation: Operation::ParameterSet {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(instance_id),
                    parameter: "opacity".into(),
                    binding: Binding::Curve {
                        space: TimeSpace::ClipLocal,
                        keys: vec![
                            Keyframe {
                                id: existing_key,
                                time: Time::ZERO,
                                value: Value::Number(0.25),
                                interpolation: Interpolation::Linear,
                            },
                            Keyframe {
                                id: new_key,
                                time: Time::milliseconds(1),
                                value: Value::Number(0.75),
                                interpolation: Interpolation::Linear,
                            },
                        ],
                    },
                },
            }],
        },
    )
    .unwrap();
    assert_eq!(prepared.receipt.results[0].created, vec![new_key]);
    assert_eq!(loads.load(Ordering::SeqCst), 1);
    assert_eq!(prepared.document.project.clips.loaded_pages(), 1);
    assert_eq!(
        document
            .project
            .clips
            .try_by_id(clip_id)
            .unwrap()
            .unwrap()
            .instances[0]
            .parameters["opacity"],
        Binding::Curve {
            space: TimeSpace::ClipLocal,
            keys: vec![Keyframe {
                id: existing_key,
                time: Time::ZERO,
                value: Value::Number(0.5),
                interpolation: Interpolation::Linear,
            }]
        }
    );
}

#[test]
fn unavailable_decision_page_rejects_the_batch_instead_of_creating_an_empty_instance() {
    let (document, loads, clip_id, instance_id, _) = lazy_document(true);
    let mut candidate = document.clone();
    let error = operations::apply(
        &mut candidate,
        &document,
        &Operation::InstanceRename {
            clip: Reference::Id(clip_id),
            instance: Reference::Id(instance_id),
            name: Some("Zoom".into()),
        },
        &[],
    )
    .unwrap_err();
    assert!(error.to_string().contains("decision block unavailable"));
    assert_eq!(loads.load(Ordering::SeqCst), 1);
    assert_eq!(document.project.clips.loaded_pages(), 0);
}
