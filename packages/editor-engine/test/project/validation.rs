use beam_editor_engine::{
    Document, EditState,
    project::validation::{self, relative_path, source_path},
};
#[test]
fn paths_reject_traversal_absolute_platform_separators_and_nul() {
    for path in [
        "",
        "../file",
        "/tmp/video",
        "media/../file",
        "C:\\file",
        "media\\file",
        "./file",
        "nul\0",
    ] {
        assert!(relative_path(path).is_err(), "{path:?}");
    }
    assert!(relative_path("media/étude clip.webm").is_ok());
}
#[test]
fn assets_cannot_escape_through_symlinks_or_directories() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("video"), b"v").unwrap();
    std::fs::write(outside.path().join("outside"), b"v").unwrap();
    assert!(source_path(root.path(), "video").is_ok());
    assert!(source_path(root.path(), "missing").is_err());
    std::fs::create_dir(root.path().join("directory")).unwrap();
    assert!(source_path(root.path(), "directory").is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside.path().join("outside"), root.path().join("escape"))
            .unwrap();
        assert!(source_path(root.path(), "escape").is_err());
    }
}
#[test]
fn invalid_canvas_identity_effects_and_ranges_are_rejected_atomically() {
    let original = crate::fixtures::project();
    assert!(validation::project(&original).is_ok());
    let mut bad = original.clone();
    bad.canvas.fps = 0;
    assert!(validation::project(&bad).is_err());
    bad = original.clone();
    bad.canvas.width = 4097;
    assert!(validation::project(&bad).is_err());
    bad = original.clone();
    bad.assets[0].id = bad.tracks.headers().next().unwrap().id;
    assert!(validation::project(&bad).is_err());
    for value in [f64::NAN, f64::INFINITY, -0.1, 1.1] {
        bad = original.clone();
        crate::fixtures::clip_mut(&mut bad, 0).effects.opacity = value;
        assert!(validation::project(&bad).is_err());
    }
    bad = original.clone();
    crate::fixtures::clip_mut(&mut bad, 0).source_in_ms = 1;
    assert!(validation::project(&bad).is_err());
    bad = original.clone();
    crate::fixtures::clip_mut(&mut bad, 0).start_ms = u64::MAX;
    assert!(validation::project(&bad).is_err());
    bad = original.clone();
    crate::fixtures::clip_mut(&mut bad, 0).duration_ms = 0;
    assert!(validation::project(&bad).is_err());
}
#[test]
fn source_cursor_and_history_boundary_paths_are_validated() {
    let mut project = crate::fixtures::project();
    project.assets[0].cursor = vec![
        crate::fixtures::point(2, 0.5, 0.5, None),
        crate::fixtures::point(1, 0.5, 0.5, None),
    ]
    .into();
    assert!(validation::project(&project).is_err());
    std::sync::Arc::make_mut(&mut project.assets[0].cursor).clear();
    project.assets[0].duration_ms = 0;
    assert!(validation::project(&project).is_err());
    let mut document = Document::new(crate::fixtures::project());
    document.schema_version = 99;
    assert!(validation::document(&document).is_err());
    document.schema_version = 2;
    document.undo = vec![EditState::capture(&document.project); 50];
    assert!(validation::document(&document).is_err());
    document.undo.truncate(1);
    document.undo[0].name.clear();
    assert!(validation::document(&document).is_err());
}
