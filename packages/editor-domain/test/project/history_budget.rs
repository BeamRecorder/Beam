use beam_editor_domain::{
    Document, Edit, Project,
    project::store::ProjectStore,
    timeline::{history, project_history},
};

#[test]
fn byte_retention_keeps_current_content_revision_and_nearest_undo_redo() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let first = Document::new(Project::new("First".into()));
    let second = history::edited(
        &first,
        &Edit::Canvas {
            canvas: beam_editor_domain::project::types::Canvas {
                background: 0xff123456,
                ..first.project.canvas.clone()
            },
        },
    )
    .unwrap();
    let third = history::edited(
        &second,
        &Edit::Canvas {
            canvas: beam_editor_domain::project::types::Canvas {
                background: 0xff654321,
                ..first.project.canvas.clone()
            },
        },
    )
    .unwrap();
    let retained = store.write_with_history_budget(&third, 0).unwrap();
    assert_eq!(retained.project, third.project);
    assert_eq!(retained.revision, third.revision);
    assert!(retained.undo.is_empty());
    assert!(retained.redo.is_empty());
    assert_eq!(store.read().unwrap().0, retained);
    assert_eq!(third.undo.len(), 2, "preparation must not mutate its input");
    let undone = history::edited(&third, &Edit::Undo {}).unwrap();
    let retained = store.write_with_history_budget(&undone, 0).unwrap();
    assert_eq!(retained.project, undone.project);
    assert!(retained.redo.is_empty());
}

#[test]
fn shared_current_decisions_are_excluded_and_a_sufficient_budget_preserves_history() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let mut value = Document::new(Project::new("History".into()));
    for index in 0..49 {
        value = history::edited(
            &value,
            &Edit::Canvas {
                canvas: beam_editor_domain::project::types::Canvas {
                    background: 0xff000000 + index,
                    ..value.project.canvas.clone()
                },
            },
        )
        .unwrap();
    }
    assert_eq!(value.undo.len(), 49);
    let accepted = store
        .write_with_history_budget(&value, 1024 * 1024)
        .unwrap();
    assert_eq!(accepted, value);
    let (loaded, _) = store.read().unwrap();
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
    assert_eq!(loaded.undo.len(), 49);
    assert_eq!(
        store
            .write_with_history_budget(&loaded, 1024 * 1024)
            .unwrap(),
        loaded
    );
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
}

#[test]
fn project_history_deleted_sequences_are_retained_only_within_the_separate_byte_budget() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let first = Document::new(Project::new("Project".into()));
    let added = project_history::edit(
        &first,
        &Edit::AddSequence {
            name: "Second".into(),
        },
    )
    .unwrap();
    let sequence = added.active_sequence;
    let removed = project_history::edit(&added, &Edit::RemoveSequence { id: sequence }).unwrap();
    assert!(removed.project_undo.iter().any(|action| matches!(
        action,
        beam_editor_domain::timeline::project_history_types::ProjectAction::InsertSequence { .. }
    )));
    let retained = store.write_with_history_budget(&removed, 0).unwrap();
    assert!(retained.project_undo.is_empty());
    assert!(retained.project_redo.is_empty());
    assert_eq!(retained.project, removed.project);
    assert_eq!(retained.sequences.len(), removed.sequences.len());
    assert_eq!(store.read().unwrap().0, retained);
}
