use beam_editor_domain::{
    Document, Edit,
    animation::{Binding, Interpolation, Keyframe, Value},
    commands::{self, types::Operation},
    effects::{Instance, definition},
    timing::{Time, TimeRange, TimeSpace},
};
use uuid::Uuid;

#[test]
fn duplicate_sequence_receipt_orders_clips_tracks_sequence_and_scoped_instances_with_keys() {
    let mut project = crate::fixtures::project();
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
            keys: vec![Keyframe {
                id: Uuid::new_v4(),
                time: Time::ZERO,
                value: Value::Number(0.5),
                interpolation: Interpolation::Linear,
            }],
        },
    );
    instance.name = Some("Clip fade".into());
    instance.range = Some(TimeRange {
        space: TimeSpace::ClipLocal,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    crate::fixtures::clip_mut(&mut project, 0)
        .instances
        .push(instance);
    let video_track = project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Video)
        .unwrap()
        .id;
    let audio_track = project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Audio)
        .unwrap()
        .id;
    for (track_id, id, parameter) in [
        (video_track, "beam.opacity", "opacity"),
        (audio_track, "beam.gain", "volume"),
    ] {
        let mut instance = definition(&project.definitions, id, 2)
            .unwrap()
            .instantiate();
        instance.name = Some(format!("Lane {parameter}"));
        instance.parameters.insert(parameter.into(), curve());
        instance.range = Some(TimeRange {
            space: TimeSpace::Sequence,
            start: Time::ZERO,
            end: Time::milliseconds(1000),
        });
        project
            .tracks
            .try_by_id_mut(track_id)
            .unwrap()
            .unwrap()
            .instances
            .push(instance);
    }
    let mut first = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    first.name = Some("Scene A".into());
    first.parameters.insert("opacity".into(), curve());
    let mut second = first.duplicate();
    second.name = Some("Scene B".into());
    second.enabled = false;
    project.sequence_instances = vec![first, second];
    let original = Document::new(project);
    let old_ids: std::collections::HashSet<_> = ordered(&original).into_iter().collect();
    let copied = commands::prepare(
        &original,
        &commands::single(
            &original,
            Edit::DuplicateSequence {
                id: original.active_sequence,
                name: "Copy".into(),
            },
        ),
    )
    .unwrap();
    let clip = crate::fixtures::clip(&copied.document.project, 0);
    assert_eq!(copied.receipt.results[0].created, ordered(&copied.document));
    assert!(
        copied.receipt.results[0]
            .created
            .iter()
            .all(|id| !old_ids.contains(id))
    );
    let unique: std::collections::HashSet<_> = copied.receipt.results[0].created.iter().collect();
    assert_eq!(unique.len(), copied.receipt.results[0].created.len());
    let undone = commands::prepare(
        &copied.document,
        &commands::single(&copied.document, Edit::UndoProject {}),
    )
    .unwrap();
    assert!(undone.receipt.results[0].created.is_empty());
    let redone = commands::prepare(
        &undone.document,
        &commands::single(&undone.document, Edit::RedoProject {}),
    )
    .unwrap();
    assert!(redone.receipt.results[0].created.is_empty());
    assert_eq!(
        crate::fixtures::clip(&redone.document.project, 0).id,
        clip.id
    );
    assert_eq!(ordered(&redone.document), ordered(&copied.document));
}

fn curve() -> Binding {
    Binding::Curve {
        space: TimeSpace::Sequence,
        keys: [(0, 0.25), (1000, 0.75)]
            .into_iter()
            .map(|(time, value)| Keyframe {
                id: Uuid::new_v4(),
                time: Time::milliseconds(time),
                value: Value::Number(value),
                interpolation: Interpolation::Linear,
            })
            .collect(),
    }
}
fn append_instance(output: &mut Vec<Uuid>, instance: &Instance) {
    output.push(instance.id);
    for binding in instance.parameters.values() {
        if let Binding::Curve { keys, .. } = binding {
            output.extend(keys.iter().map(|key| key.id));
        }
    }
}
fn ordered(document: &Document) -> Vec<Uuid> {
    let mut output: Vec<_> = document
        .project
        .clips
        .headers()
        .map(|clip| clip.id)
        .chain(document.project.tracks.headers().map(|track| track.id))
        .chain(std::iter::once(document.active_sequence))
        .collect();
    for index in 0..document.project.clips.len() {
        let clip = crate::fixtures::clip(&document.project, index);
        for instance in clip.instances.iter().chain(clip.generator.iter()) {
            append_instance(&mut output, instance);
        }
    }
    for header in document.project.tracks.headers() {
        let track = document
            .project
            .tracks
            .try_by_id(header.id)
            .unwrap()
            .unwrap();
        for instance in &track.instances {
            append_instance(&mut output, instance);
        }
    }
    for instance in &document.project.sequence_instances {
        append_instance(&mut output, instance);
    }
    output
}

#[test]
fn adding_a_sequence_orders_its_new_tracks_before_the_sequence_identity() {
    let original = Document::new(crate::fixtures::project());
    let mut request = commands::single(
        &original,
        Edit::AddSequence {
            name: "Empty".into(),
        },
    );
    assert!(matches!(
        request.commands[0].operation,
        Operation::Edit { .. }
    ));
    request.idempotency_key = "new-sequence".into();
    let result = commands::prepare(&original, &request).unwrap();
    let expected = result
        .document
        .project
        .tracks
        .headers()
        .map(|track| track.id)
        .chain(std::iter::once(result.document.active_sequence))
        .collect::<Vec<_>>();
    assert_eq!(result.receipt.results[0].created, expected);
}
