use beam_editor_engine::{
    Document, Edit, Project,
    timeline::{history, sequences},
};
use uuid::Uuid;
fn edit(document: &Document, edit: Edit) -> Document {
    history::edited(document, &edit).unwrap()
}
#[test]
fn timelines_share_sources_but_keep_tracks_clips_canvas_and_history_independent() {
    let first = Document::new(crate::fixtures::project());
    let id = first.active_sequence;
    let changed = edit(
        &first,
        Edit::Remove {
            id: crate::fixtures::clip(&first.project, 0).id,
        },
    );
    let second = edit(
        &changed,
        Edit::AddSequence {
            name: "Second".into(),
        },
    );
    assert_eq!(second.project.assets, first.project.assets);
    assert!(second.project.clips.is_empty());
    assert!(second.undo.is_empty());
    assert_ne!(
        second.project.tracks.headers().next().unwrap().id,
        first.project.tracks.headers().next().unwrap().id
    );
    let second_id = second.active_sequence;
    let second = edit(
        &second,
        Edit::AddTrack {
            name: "Music".into(),
            kind: beam_editor_engine::TrackKind::Audio,
        },
    );
    let restored = edit(&second, Edit::SelectSequence { id });
    assert_eq!(restored.undo, changed.undo);
    assert!(restored.project.clips.is_empty());
    let undone = edit(&restored, Edit::Undo {});
    assert_eq!(undone.project.clips, first.project.clips);
    let second = edit(&undone, Edit::SelectSequence { id: second_id });
    assert_eq!(second.project.tracks.len(), 3);
    assert_eq!(second.undo.len(), 1);
    let back = edit(&second, Edit::SelectSequence { id });
    assert_eq!(back.redo.len(), 1);
}
#[test]
fn sequence_switch_is_atomic_and_does_not_consume_history_or_revision_when_unchanged() {
    let first = Document::new(Project::new("Project".into()));
    assert_eq!(
        edit(
            &first,
            Edit::SelectSequence {
                id: first.active_sequence
            }
        ),
        first
    );
    for operation in [
        Edit::SelectSequence { id: Uuid::new_v4() },
        Edit::RemoveSequence {
            id: first.active_sequence,
        },
        Edit::RenameSequence {
            id: Uuid::new_v4(),
            name: "Valid".into(),
        },
    ] {
        assert!(history::edited(&first, &operation).is_err());
        assert_eq!(first.sequences.len(), 1);
    }
    let second = edit(&first, Edit::AddSequence { name: " B ".into() });
    let renamed = edit(
        &second,
        Edit::RenameSequence {
            id: second.active_sequence,
            name: " C ".into(),
        },
    );
    assert_eq!(renamed.sequences[1].name, "C");
    assert!(renamed.undo.is_empty());
    let removed = edit(
        &renamed,
        Edit::RemoveSequence {
            id: renamed.active_sequence,
        },
    );
    assert_eq!(removed.active_sequence, first.active_sequence);
}
#[test]
fn sequence_limits_names_overflow_and_corrupt_histories_are_rejected() {
    let mut document = Document::new(Project::new("Project".into()));
    for name in ["".into(), "  ".into(), "bad\0name".into(), "x".repeat(129)] {
        assert!(history::edited(&document, &Edit::AddSequence { name }).is_err());
    }
    for index in 1..16 {
        document = edit(
            &document,
            Edit::AddSequence {
                name: format!("{index}"),
            },
        );
    }
    assert!(history::edited(&document, &Edit::AddSequence { name: "17".into() }).is_ok());
    let mut invalid = document.clone();
    invalid.sequences[1].id = invalid.sequences[0].id;
    assert!(sequences::validate(&invalid).is_err());
    invalid = document.clone();
    invalid.active_sequence = Uuid::nil();
    assert!(sequences::validate(&invalid).is_err());
    invalid = document.clone();
    invalid.sequences[0].state.canvas.width = 0;
    assert!(sequences::validate(&invalid).is_err());
    invalid = document.clone();
    invalid.revision = u64::MAX;
    assert!(
        history::edited(
            &invalid,
            &Edit::RenameSequence {
                id: invalid.active_sequence,
                name: "X".into()
            }
        )
        .is_err()
    );
}
#[test]
fn legacy_single_timeline_documents_migrate_and_all_sequences_survive_disk_roundtrip() {
    let root = tempfile::tempdir().unwrap();
    let original = Document::new(crate::fixtures::project());
    let mut legacy = serde_json::to_value(&original).unwrap();
    legacy.as_object_mut().unwrap().remove("sequences");
    legacy.as_object_mut().unwrap().remove("activeSequence");
    let path = root.path().join("legacy.json");
    std::fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
    let migrated = beam_editor_engine::project::store::read_document(&path).unwrap();
    assert_eq!(migrated, original);
    let next = edit(
        &migrated,
        Edit::AddSequence {
            name: "Second".into(),
        },
    );
    let store = beam_editor_engine::project::store::ProjectStore::lock(root.path()).unwrap();
    store.write(&next).unwrap();
    assert_eq!(store.read().unwrap().0, next);
}
