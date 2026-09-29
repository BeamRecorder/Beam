use beam_editor_domain::{
    Document, Edit,
    commands::{self, types::*},
    project::store::ProjectStore,
};
use uuid::Uuid;
fn apply(doc: &Document, edit: Edit) -> Document {
    commands::prepare(doc, &commands::single(doc, edit))
        .unwrap()
        .document
}
#[test]
fn project_rename_history_does_not_overwrite_later_clip_edits() {
    let original = Document::new(crate::fixtures::project());
    let renamed = apply(
        &original,
        Edit::Rename {
            name: "Renamed".into(),
        },
    );
    assert!(renamed.undo.is_empty());
    assert_eq!(renamed.project_undo.len(), 1);
    let moved = apply(
        &renamed,
        Edit::Move {
            id: crate::fixtures::clip(&original.project, 0).id,
            track_id: original.project.tracks.headers().next().unwrap().id,
            start_ms: 1000,
        },
    );
    let restored = apply(&moved, Edit::UndoProject {});
    assert_eq!(restored.project.name, original.project.name);
    assert_eq!(crate::fixtures::clip(&restored.project, 0).start_ms, 1000);
    assert_eq!(restored.undo.len(), 1);
    let redone = apply(&restored, Edit::RedoProject {});
    assert_eq!(redone.project.name, "Renamed");
}
#[test]
fn deleted_sequence_restores_content_and_independent_undo_after_reopening() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, b"video");
    let original = Document::new(project);
    let source = original.active_sequence;
    let duplicated = apply(
        &original,
        Edit::DuplicateSequence {
            id: source,
            name: "Copy".into(),
        },
    );
    let copy = duplicated.active_sequence;
    assert_ne!(
        crate::fixtures::clip(&duplicated.project, 0).id,
        crate::fixtures::clip(&original.project, 0).id
    );
    let moved = apply(
        &duplicated,
        Edit::Move {
            id: crate::fixtures::clip(&duplicated.project, 0).id,
            track_id: duplicated.project.tracks.headers().next().unwrap().id,
            start_ms: 1000,
        },
    );
    let removed = apply(&moved, Edit::RemoveSequence { id: copy });
    assert_eq!(removed.active_sequence, source);
    store.write(&removed).unwrap();
    let (loaded, _) = store.read().unwrap();
    let restored = apply(&loaded, Edit::UndoProject {});
    assert_eq!(restored.active_sequence, copy);
    assert_eq!(crate::fixtures::clip(&restored.project, 0).start_ms, 1000);
    assert_eq!(restored.undo.len(), 1);
    let undo_clip = apply(&restored, Edit::Undo {});
    assert_eq!(crate::fixtures::clip(&undo_clip.project, 0).start_ms, 0);
    let removed_again = apply(&restored, Edit::RedoProject {});
    assert_eq!(removed_again.sequences.len(), 1);
}
#[test]
fn rename_sequence_undo_retains_clip_history_and_add_undo_captures_modified_sequence() {
    let original = Document::new(crate::fixtures::project());
    let id = original.active_sequence;
    let renamed = apply(
        &original,
        Edit::RenameSequence {
            id,
            name: "New title".into(),
        },
    );
    let moved = apply(
        &renamed,
        Edit::Move {
            id: crate::fixtures::clip(&original.project, 0).id,
            track_id: original.project.tracks.headers().next().unwrap().id,
            start_ms: 100,
        },
    );
    let restored = apply(&moved, Edit::UndoProject {});
    assert_eq!(restored.sequences[0].name, "Timeline 1");
    assert_eq!(crate::fixtures::clip(&restored.project, 0).start_ms, 100);
    let copy = apply(
        &restored,
        Edit::DuplicateSequence {
            id,
            name: "Temporary".into(),
        },
    );
    let edited = apply(
        &copy,
        Edit::Trim {
            id: crate::fixtures::clip(&copy.project, 0).id,
            source_in_ms: 500,
            duration_ms: 500,
            start_ms: 100,
        },
    );
    let removed = apply(&edited, Edit::UndoProject {});
    assert_eq!(removed.sequences.len(), 1);
    let returned = apply(&removed, Edit::RedoProject {});
    let restored_copy = returned
        .sequences
        .iter()
        .find(|s| s.id == copy.active_sequence)
        .unwrap();
    assert_eq!(
        crate::fixtures::decision(&restored_copy.state.clips, 0).source_in_ms,
        500
    );
}
#[test]
fn project_commands_cannot_switch_a_batch_undo_scope_and_failures_are_atomic() {
    let doc = Document::new(crate::fixtures::project());
    let mut request = commands::single(&doc, Edit::AddSequence { name: "New".into() });
    request.commands.push(Command {
        command_id: "rename".into(),
        operation: Operation::Edit {
            edit: Edit::Rename {
                name: "bad scope".into(),
            },
        },
    });
    assert!(commands::prepare(&doc, &request).is_err());
    assert_eq!(doc.sequences.len(), 1);
    assert!(commands::prepare(&doc, &commands::single(&doc, Edit::UndoProject {})).is_err());
    assert!(
        commands::prepare(
            &doc,
            &commands::single(
                &doc,
                Edit::DuplicateSequence {
                    id: Uuid::new_v4(),
                    name: "Missing".into()
                }
            )
        )
        .is_err()
    );
    assert!(
        commands::prepare(
            &doc,
            &commands::single(
                &doc,
                Edit::RemoveSequence {
                    id: doc.active_sequence
                }
            )
        )
        .is_err()
    );
}
