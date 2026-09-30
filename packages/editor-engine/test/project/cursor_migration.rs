use super::cursor_import::captured;
use beam_editor_engine::project::{cursor_migration::hydrate, recording::open};
#[test]
fn native_projects_restore_capture_roles_without_changing_clip_edits() {
    let root = tempfile::tempdir().unwrap();
    captured(root.path());
    let mut project = open(root.path()).unwrap();
    let clips = project.clips.clone();
    project.assets[0].cursor = vec![
        crate::fixtures::point(0, 0.2, 0.3, None),
        crate::fixtures::point(1000, 0.8, 0.7, None),
    ]
    .into();
    hydrate(root.path(), &mut project).unwrap();
    assert_eq!(project.clips, clips);
    assert_eq!(
        project.assets[0].cursor[1].cursor_type.as_deref(),
        Some("textcursor")
    );
    let first = project.clone();
    hydrate(root.path(), &mut project).unwrap();
    assert_eq!(first, project);
}
#[test]
fn unrelated_imports_and_missing_sidecars_keep_accepted_telemetry() {
    let root = tempfile::tempdir().unwrap();
    let mut project = crate::fixtures::project();
    let original = project.clone();
    hydrate(root.path(), &mut project).unwrap();
    assert_eq!(project, original);
    let folder = captured(root.path());
    let mut project = open(root.path()).unwrap();
    project.assets[0].cursor = vec![crate::fixtures::point(0, 0.2, 0.3, None)].into();
    std::fs::remove_file(folder.join("cursor.json")).unwrap();
    let before = project.clone();
    hydrate(root.path(), &mut project).unwrap();
    assert_eq!(project, before);
}
#[test]
fn corrupt_sidecars_fail_explicitly_without_rewriting_accepted_edits() {
    let root = tempfile::tempdir().unwrap();
    let folder = captured(root.path());
    let mut project = open(root.path()).unwrap();
    project.assets[0].cursor = vec![crate::fixtures::point(0, 0.2, 0.3, None)].into();
    let before = project.clone();
    std::fs::write(folder.join("cursor.json"), b"{").unwrap();
    assert!(hydrate(root.path(), &mut project).is_err());
    assert_eq!(project, before);
}

#[test]
fn cursor_outside_the_recorded_frame_restores_roles_without_invalidating_the_project() {
    let root = tempfile::tempdir().unwrap();
    let folder = captured(root.path());
    let telemetry = br#"{"version":2,"samples":[{"timeMs":0,"cx":-0.1,"cy":0.3},{"timeMs":1000,"cx":0.8,"cy":1.3118686868686869,"interactionType":"click"}]}"#;
    std::fs::write(folder.join("telemetry.json"), telemetry).unwrap();
    let mut project = open(root.path()).unwrap();
    let clips = project.clips.clone();
    project.assets[0].cursor = project.assets[0]
        .cursor
        .iter()
        .cloned()
        .map(|mut point| {
            point.cursor_type = None;
            point.visible = None;
            point
        })
        .collect::<Vec<_>>()
        .into();

    hydrate(root.path(), &mut project).unwrap();
    beam_editor_engine::project::validation::project(&project).unwrap();
    assert_eq!(project.clips, clips);
    assert_eq!(project.assets[0].cursor[0].cx, 0.);
    let last = project.assets[0].cursor.last().unwrap();
    assert_eq!(last.cy, 1.);
    assert_eq!(last.cursor_type.as_deref(), Some("textcursor"));
    assert_eq!(last.visible, Some(true));
    assert_eq!(
        last.interaction_type,
        Some(beam_editor_domain::recording::types::CursorInteractionType::Click)
    );
    assert_eq!(
        std::fs::read(folder.join("telemetry.json")).unwrap(),
        telemetry
    );
}

#[test]
#[ignore = "requires an existing recording project supplied through BEAM_CURSOR_AUDIT_PROJECT"]
fn existing_project_cursor_migration_is_read_only() {
    use beam_editor_engine::project::{store::read_document, types::DOCUMENT_FILE, validation};
    let root = std::path::PathBuf::from(
        std::env::var_os("BEAM_CURSOR_AUDIT_PROJECT").expect("recording project path"),
    );
    let path = root.join(DOCUMENT_FILE);
    let original = std::fs::read(&path).unwrap();
    let mut document = read_document(&path).unwrap();
    let clips = document.project.clips.clone();
    let before: usize = document.project.assets.iter().map(|a| a.cursor.len()).sum();
    hydrate(&root, &mut document.project).unwrap();
    validation::document(&document).unwrap();
    assert_eq!(document.project.clips, clips);
    assert_eq!(std::fs::read(path).unwrap(), original);
    let after: usize = document.project.assets.iter().map(|a| a.cursor.len()).sum();
    println!(
        "Validated cursor migration: {before} accepted samples, {after} restored samples; document unchanged on disk"
    );
}
