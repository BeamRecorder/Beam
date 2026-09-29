use beam_editor_engine::{Document, Edit, Project};
mod export;
mod fixtures;
mod project;
mod shared;
mod timeline;
mod video;

#[test]
fn rename_preserves_source_and_is_undoable() {
    let original = Document::new(Project::new("First".into()));
    let edited = beam_editor_engine::timeline::history::edited(
        &original,
        &Edit::Rename {
            name: "Second".into(),
        },
    )
    .unwrap();
    assert_eq!(original.project.name, "First");
    assert_eq!(edited.project.name, "Second");
    let restored = beam_editor_engine::timeline::history::edited(&edited, &Edit::Undo {}).unwrap();
    assert_eq!(restored.project.name, "First");
    assert_eq!(restored.revision, 2);
}
