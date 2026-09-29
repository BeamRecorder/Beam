use beam_editor_engine::{Edit, EditorController};
#[test]
fn unopened_controller_rejects_document_commands_and_is_idle() {
    let controller = EditorController::new().unwrap();
    assert!(controller.snapshot().is_err());
    assert!(controller.retry().is_err());
    assert!(controller.seek(0).is_err());
    assert!(controller.import(vec![]).is_err());
    assert!(controller.frame().is_none());
    assert!(!controller.transport().unwrap().playing);
}
#[test]
fn stale_revision_and_duplicate_project_creation_do_not_overwrite_saved_state() {
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    let first = controller
        .create(root.path().into(), "First".into())
        .unwrap();
    let second = controller
        .edit(
            first.revision,
            Edit::Rename {
                name: "Second".into(),
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
    assert_eq!(controller.snapshot().unwrap().revision, second.revision);
    assert!(
        controller
            .create(root.path().into(), "Overwrite".into())
            .is_err()
    );
    assert_eq!(controller.snapshot().unwrap().project.name, "Second");
}
#[test]
fn close_and_reopen_preserve_history_and_optimistic_revision() {
    let root = tempfile::tempdir().unwrap();
    {
        let controller = EditorController::new().unwrap();
        controller
            .create(root.path().into(), "First".into())
            .unwrap();
        controller
            .edit(
                0,
                Edit::Rename {
                    name: "Second".into(),
                },
            )
            .unwrap();
    }
    let controller = EditorController::new().unwrap();
    let mut opened = None;
    for _ in 0..100 {
        if let Ok(snapshot) = controller.open(root.path().into()) {
            opened = Some(snapshot);
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    let opened = opened.unwrap();
    assert_eq!(opened.project.name, "Second");
    assert!(opened.can_project_undo);
    assert_eq!(
        controller
            .edit(opened.revision, Edit::UndoProject {})
            .unwrap()
            .project
            .name,
        "First"
    );
}
