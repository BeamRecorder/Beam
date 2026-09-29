use beam_editor_engine::{Canvas, Document, EditState, Project};
#[test]
fn empty_document_has_distinct_lanes_and_versioned_history() {
    let document = Document::new(Project::new("Empty".into()));
    assert_eq!(document.schema_version, 2);
    assert_eq!(document.revision, 0);
    assert_eq!(document.project.duration_ms(), 0);
    assert_ne!(
        document.project.tracks.headers().next().unwrap().id,
        document.project.tracks.headers().nth(1).unwrap().id
    );
    assert!(document.undo.is_empty());
}
#[test]
fn canvas_preserves_high_resolution_aspect_and_small_bounds() {
    assert_eq!(Canvas::from_source(7680, 4320).width, 4096);
    assert_eq!(Canvas::from_source(7680, 4320).height, 2304);
    assert_eq!(Canvas::from_source(0, 0).height, 16);
    assert_eq!(Canvas::from_source(320, 180).height, 180);
}
#[test]
fn history_restores_edits_without_discarding_library_sources() {
    let mut project = crate::fixtures::project();
    let state = EditState::capture(&project);
    project.name = "Changed".into();
    project.clips = Default::default();
    state.restore(&mut project);
    assert_eq!(project.name, "Test");
    assert_eq!(project.clips.len(), 1);
    assert_eq!(project.assets.len(), 1);
    assert_eq!(project.duration_ms(), 10_000);
}
