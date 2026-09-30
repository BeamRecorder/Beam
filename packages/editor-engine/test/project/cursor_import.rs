use super::recording::recording;
use beam_editor_engine::project::recording::open;
use serde_json::json;
pub(super) fn captured(root: &std::path::Path) -> std::path::PathBuf {
    let (project, _) = recording(root);
    let folder = root.join(&project.sessions[0].relative_path).join("cursor");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("telemetry.json"),r#"{"version":2,"samples":[{"timeMs":0,"cx":0.2,"cy":0.3},{"timeMs":1000,"cx":0.8,"cy":0.7}]}"#).unwrap();
    std::fs::write(folder.join("cursor.json"),serde_json::to_vec(&json!([
        {"event":"shape","sessionNs":0,"cursorId":"arrow","nativeCursorId":"arrow","cursorKind":"default","hotspot":{"x":0,"y":0}},
        {"event":"shape","sessionNs":250000000,"cursorId":"text","nativeCursorId":"text","cursorKind":"textcursor","hotspot":{"x":0,"y":0}},
        {"event":"visibility","sessionNs":500000000,"visible":false},
        {"event":"visibility","sessionNs":750000000,"visible":true}
    ])).unwrap()).unwrap();
    folder
}
#[test]
fn stationary_role_changes_and_visibility_boundaries_are_retained() {
    let root = tempfile::tempdir().unwrap();
    captured(root.path());
    let project = open(root.path()).unwrap();
    let points = &project.assets[0].cursor;
    assert_eq!(
        points.iter().map(|p| p.time_ms).collect::<Vec<_>>(),
        [0, 250, 500, 750, 1000]
    );
    assert_eq!(points[1].cursor_type.as_deref(), Some("textcursor"));
    assert_eq!(points[2].visible, Some(false));
    assert_eq!(points[3].visible, Some(true));
    assert!((points[1].cx - 0.35).abs() < 1e-12);
}
#[test]
fn resumed_segment_carries_prior_shape_visibility_and_position() {
    let root = tempfile::tempdir().unwrap();
    captured(root.path());
    let path = root.path().join("project.json");
    let manifest: beam_media_manifest::ProjectManifest =
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let session_path = root
        .path()
        .join(&manifest.sessions[0].relative_path)
        .join("manifest.json");
    let mut session: beam_media_manifest::SessionManifest =
        serde_json::from_slice(&std::fs::read(&session_path).unwrap()).unwrap();
    session.tracks[0].segments[0].start_ns = 600000000;
    std::fs::write(session_path, serde_json::to_vec(&session).unwrap()).unwrap();
    let project = open(root.path()).unwrap();
    let first = &project.assets[0].cursor[0];
    assert_eq!(first.time_ms, 0);
    assert_eq!(first.visible, Some(false));
    assert_eq!(first.cursor_type.as_deref(), Some("textcursor"));
    assert!((first.cx - 0.56).abs() < 1e-12);
}
#[test]
fn corrupt_full_cursor_metadata_is_reported_and_absent_metadata_keeps_telemetry() {
    let root = tempfile::tempdir().unwrap();
    let folder = captured(root.path());
    std::fs::write(folder.join("cursor.json"), b"{").unwrap();
    assert!(open(root.path()).is_err());
    std::fs::remove_file(folder.join("cursor.json")).unwrap();
    let project = open(root.path()).unwrap();
    assert_eq!(project.assets[0].cursor.len(), 2);
    assert!(project.assets[0].cursor[0].cursor_type.is_none());
}
