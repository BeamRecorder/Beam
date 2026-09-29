use beam_editor_domain::{
    Document, Edit,
    commands::{self, types::*},
    timeline::history,
};
use uuid::Uuid;
fn copy_request(
    doc: &Document,
    clips: Vec<Uuid>,
    tracks: std::collections::BTreeMap<Uuid, Reference>,
) -> Transaction {
    Transaction {
        api_version: 1,
        project_id: doc.project.id,
        sequence_id: doc.active_sequence,
        expected_revision: doc.revision,
        idempotency_key: Uuid::new_v4().to_string(),
        commands: vec![Command {
            command_id: "paste".into(),
            operation: Operation::PasteMapped {
                clips,
                source_sequence: doc.active_sequence,
                track_map: tracks,
                start_ms: 10_000,
            },
        }],
    }
}
#[test]
fn mapped_copy_keeps_lanes_and_decisions_independent_in_one_history_step() {
    let mut p = crate::fixtures::project();
    p.assets[0].has_audio = true;
    let mut audio = (*crate::fixtures::clip(&p, 0)).clone();
    audio.id = Uuid::new_v4();
    audio.track_id = p.tracks.headers().nth(1).unwrap().id;
    p.clips.try_push(audio).unwrap();
    let ids: Vec<_> = p.clips.headers().map(|c| c.id).collect();
    beam_editor_domain::timeline::links::link(&mut p, &ids).unwrap();
    let instance = p
        .definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap()
        .instantiate();
    crate::fixtures::clip_mut(&mut p, 0)
        .instances
        .push(instance);
    let doc = Document::new(p);
    let tracks = doc
        .project
        .tracks
        .headers()
        .map(|t| (t.id, Reference::Id(t.id)))
        .collect();
    let result = commands::prepare(&doc, &copy_request(&doc, ids, tracks)).unwrap();
    assert_eq!(result.document.undo.len(), 1);
    assert_eq!(result.document.project.clips.len(), 4);
    let copies: Vec<_> = result
        .document
        .project
        .clips
        .headers()
        .filter(|c| c.start_ms == 10_000)
        .collect();
    assert_eq!(copies[0].link_group, copies[1].link_group);
    assert_ne!(
        copies[0].link_group,
        crate::fixtures::clip(&doc.project, 0).link_group
    );
    assert_ne!(
        copies[0].instances[0].id,
        crate::fixtures::clip(&doc.project, 0).instances[0].id
    );
    assert_eq!(
        history::edited(&result.document, &Edit::Undo {})
            .unwrap()
            .project
            .clips,
        doc.project.clips
    );
}
#[test]
fn partial_link_copy_unlinks_new_occurrence_without_modifying_original_group() {
    let mut p = crate::fixtures::project();
    p.assets[0].has_audio = true;
    let mut c = (*crate::fixtures::clip(&p, 0)).clone();
    c.id = Uuid::new_v4();
    c.track_id = p.tracks.headers().nth(1).unwrap().id;
    p.clips.try_push(c).unwrap();
    let ids: Vec<_> = p.clips.headers().map(|c| c.id).collect();
    beam_editor_domain::timeline::links::link(&mut p, &ids).unwrap();
    let doc = Document::new(p);
    let map = doc
        .project
        .tracks
        .headers()
        .map(|t| (t.id, Reference::Id(t.id)))
        .collect();
    let result = commands::prepare(&doc, &copy_request(&doc, vec![ids[0]], map)).unwrap();
    assert!(
        crate::fixtures::clip(
            &result.document.project,
            result.document.project.clips.len() - 1
        )
        .link_group
        .is_none()
    );
    assert!(
        crate::fixtures::clip(&result.document.project, 0)
            .link_group
            .is_some()
    );
}
#[test]
fn bad_mapping_missing_clip_duplicate_selection_and_overflow_reject_entire_batch() {
    let doc = Document::new(crate::fixtures::project());
    let id = crate::fixtures::clip(&doc.project, 0).id;
    assert!(commands::prepare(&doc, &copy_request(&doc, vec![id], Default::default())).is_err());
    let map = || {
        doc.project
            .tracks
            .headers()
            .map(|t| (t.id, Reference::Id(t.id)))
            .collect()
    };
    assert!(commands::prepare(&doc, &copy_request(&doc, vec![id, id], map())).is_err());
    assert!(commands::prepare(&doc, &copy_request(&doc, vec![Uuid::new_v4()], map())).is_err());
    let wrong = [(
        doc.project.tracks.headers().next().unwrap().id,
        Reference::Id(doc.project.tracks.headers().nth(1).unwrap().id),
    )]
    .into_iter()
    .collect();
    assert!(commands::prepare(&doc, &copy_request(&doc, vec![id], wrong)).is_err());
    let mut request = copy_request(&doc, vec![id], map());
    if let Operation::PasteMapped { start_ms, .. } = &mut request.commands[0].operation {
        *start_ms = u64::MAX;
    }
    assert!(commands::prepare(&doc, &request).is_err());
    assert_eq!(doc.revision, 0);
}
