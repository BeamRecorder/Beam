#![allow(clippy::expect_used)]

use beam_media_manifest::{ProjectId, ProjectLayout, ProjectManifest, SessionId, TrackKind};

#[test]
fn existing_project_directory_is_found_by_manifest_id() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project_id = ProjectId::new();
    let existing = temporary.path().join("renamed-project");
    std::fs::create_dir(&existing).expect("directory");
    let project = ProjectManifest {
        schema_version: 2,
        project_id,
        name: "Renamed".into(),
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        updated_at_utc: "2026-01-01T00:00:00Z".into(),
        sessions: Vec::new(),
        editor: Default::default(),
        extra: Default::default(),
    };
    std::fs::write(
        existing.join("project.json"),
        serde_json::to_vec(&project).expect("JSON"),
    )
    .expect("manifest");
    let layout = ProjectLayout::new(temporary.path(), project_id);
    assert_eq!(layout.project_dir(), existing);
    assert_eq!(layout.project_manifest(), existing.join("project.json"));
}

#[test]
fn session_layout_creates_every_track_and_metadata_path() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let layout = ProjectLayout::new(temporary.path(), ProjectId::new()).session(SessionId::new());
    layout.create().expect("session layout");
    assert!(layout.manifest().starts_with(layout.root()));
    assert_eq!(layout.partial_manifest().parent(), Some(layout.root()));
    assert_eq!(layout.health().parent(), Some(layout.root()));
    assert_eq!(layout.timing().parent(), Some(layout.root()));
    for kind in [
        TrackKind::Screen,
        TrackKind::SystemAudio,
        TrackKind::Microphone,
        TrackKind::Camera,
        TrackKind::Cursor,
    ] {
        assert!(layout.track_dir(kind).is_dir(), "missing {kind:?}");
    }
    layout.create().expect("idempotent layout");
}

#[test]
fn malformed_project_manifest_cannot_claim_a_project_directory() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let candidate = temporary.path().join("bad-project");
    std::fs::create_dir(&candidate).expect("directory");
    std::fs::write(candidate.join("project.json"), b"{").expect("bad JSON");
    let id = ProjectId::new();
    let layout = ProjectLayout::new(temporary.path(), id);
    assert_eq!(
        layout.project_dir(),
        temporary.path().join(format!("project-{id}"))
    );
}
