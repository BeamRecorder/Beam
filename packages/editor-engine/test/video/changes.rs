use beam_editor_engine::{Edit, EditorController};
use std::sync::{Arc, Mutex};

#[test]
fn accepted_commits_emit_exact_revisions_and_failed_requests_emit_nothing() {
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    let received = Arc::new(Mutex::new(vec![]));
    let output = received.clone();
    controller.set_change_consumer(move |change| output.lock().unwrap().push(change));
    let first = controller
        .create(root.path().into(), "Changes".into())
        .unwrap();
    controller
        .edit(
            first.revision,
            Edit::Rename {
                name: "Accepted".into(),
            },
        )
        .unwrap();
    assert!(
        controller
            .edit(
                first.revision,
                Edit::Rename {
                    name: "Stale".into()
                }
            )
            .is_err()
    );
    let events = received.lock().unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].revision, 0);
    assert_eq!(events[1].revision, 1);
    assert_eq!(events[1].project_id, first.project.id);
    assert_eq!(events[1].sequence_id, first.active_sequence);
}
#[test]
fn replay_and_preview_rebuild_do_not_notify_an_unchanged_document() {
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Replay".into())
        .unwrap();
    let received = Arc::new(Mutex::new(vec![]));
    let output = received.clone();
    controller.set_change_consumer(move |change| output.lock().unwrap().push(change));
    let transaction = beam_editor_engine::domain::commands::single(
        &controller.document().unwrap(),
        Edit::Rename {
            name: "Changed".into(),
        },
    );
    controller.transaction(transaction.clone()).unwrap();
    controller.transaction(transaction).unwrap();
    controller.retry().unwrap();
    controller
        .preview_quality(beam_editor_engine::video::types::PreviewQuality::Half)
        .unwrap();
    assert_eq!(received.lock().unwrap().len(), 1);
}
#[test]
fn panicking_notification_consumers_cannot_roll_back_an_accepted_commit() {
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller.set_change_consumer(|_| panic!("failed observer"));
    controller
        .create(root.path().into(), "Observer".into())
        .unwrap();
    controller
        .edit(
            0,
            Edit::Rename {
                name: "Durable".into(),
            },
        )
        .unwrap();
    assert_eq!(controller.document().unwrap().project.name, "Durable");
    assert_eq!(controller.document().unwrap().revision, 1);
}
