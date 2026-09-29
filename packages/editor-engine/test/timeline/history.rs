use beam_editor_engine::{
    Document, Edit, Project,
    timeline::history::{edited, replaced},
};
#[test]
fn redo_is_invalidated_by_a_new_edit_and_noop_preserves_revision() {
    let original = Document::new(Project::new("First".into()));
    let next = edited(
        &original,
        &Edit::Rename {
            name: "Second".into(),
        },
    )
    .unwrap();
    assert_eq!(replaced(&next, next.project.clone()).unwrap().revision, 1);
    let undo = edited(&next, &Edit::Undo {}).unwrap();
    assert_eq!(
        edited(&undo, &Edit::Redo {}).unwrap().project.name,
        "Second"
    );
    let branch = edited(
        &undo,
        &Edit::Rename {
            name: "Third".into(),
        },
    )
    .unwrap();
    assert!(edited(&branch, &Edit::Redo {}).is_err());
}
#[test]
fn fifty_state_budget_does_not_duplicate_immutable_telemetry() {
    let mut document = Document::new(crate::fixtures::project());
    document.project.assets[0]
        .cursor
        .push(crate::fixtures::point(0, 0.5, 0.5, None));
    for index in 0..70 {
        document = edited(
            &document,
            &Edit::Rename {
                name: format!("Edit {index}"),
            },
        )
        .unwrap();
    }
    assert_eq!(document.undo.len(), 49);
    let json = serde_json::to_string(&document).unwrap();
    assert_eq!(json.matches("interactionType").count(), 0);
    assert_eq!(json.matches("\"cursor\"").count(), 1);
    for _ in 0..49 {
        document = edited(&document, &Edit::Undo {}).unwrap();
    }
    assert!(edited(&document, &Edit::Undo {}).is_err());
    assert_eq!(document.redo.len(), 49);
}
#[test]
fn empty_stacks_and_revision_overflow_are_explicit_failures() {
    let mut document = Document::new(Project::new("First".into()));
    assert!(edited(&document, &Edit::Undo {}).is_err());
    assert!(edited(&document, &Edit::Redo {}).is_err());
    document.revision = u64::MAX;
    assert!(
        edited(
            &document,
            &Edit::Rename {
                name: "Next".into()
            }
        )
        .is_err()
    );
    assert_eq!(document.project.name, "First");
}
