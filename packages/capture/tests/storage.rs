#![allow(clippy::expect_used)]

use capture::{model::*, storage::*};

fn manifest(project_id: ProjectId, session_id: SessionId) -> SessionManifest {
    SessionManifest {
        schema_version: SCHEMA_VERSION,
        project_id,
        session_id,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        session_start_monotonic_ns: 0,
        duration_ns: 0,
        platform: PlatformMetadata {
            os: "test".into(),
            architecture: "test".into(),
            backend: "fake".into(),
        },
        selected_sources: SelectedSources {
            screen: None,
            microphone: None,
            camera: None,
            system_audio: None,
        },
        tracks: Vec::new(),
        permissions: PermissionSnapshot::default(),
        warnings: Vec::new(),
        completed: false,
    }
}

#[test]
fn layout_checkpoint_finalize_and_recovery() {
    let temp = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    create_or_update_project(temp.path(), project, session, "2026-01-01T00:00:00Z")
        .expect("project");
    let layout = ProjectLayout::new(temp.path(), project).session(session);
    layout.create().expect("layout");
    let mut value = manifest(project, session);
    let mut writer = ManifestWriter::new(layout.clone());
    writer.checkpoint(&value).expect("checkpoint");
    assert!(
        !recover_session(&layout)
            .expect("partial recovery")
            .manifest
            .completed
    );
    writer.finalize(&mut value).expect("finalize");
    writer.finalize(&mut value).expect("idempotent finalize");
    assert!(
        recover_session(&layout)
            .expect("final recovery")
            .manifest
            .completed
    );
    assert!(!layout.partial_manifest().exists());
}

#[test]
fn segments_validate_boundaries() {
    let mut value = segment("screen/segment-0001.mp4".into(), 10);
    assert!(finish_segment(&mut value, 9).is_err());
    finish_segment(&mut value, 12).expect("finish");
    assert!(value.complete);
}

#[test]
fn atomic_write_recovers_from_a_stale_temporary_file() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let destination = temporary.path().join("manifest.json");
    let stale = temporary.path().join("manifest.json.tmp");
    std::fs::write(&stale, b"truncated").expect("create stale temporary file");
    write_atomic(&destination, b"complete").expect("atomic replacement");
    assert_eq!(
        std::fs::read(&destination).expect("read destination"),
        b"complete"
    );
    assert!(!stale.exists());
}

#[test]
fn project_editor_state_survives_a_new_recording() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project = ProjectId::new();
    let first_session = SessionId::new();
    let second_session = SessionId::new();
    let mut manifest = create_or_update_project(
        temporary.path(),
        project,
        first_session,
        "2026-01-01T00:00:00Z",
    )
    .expect("project");
    manifest
        .editor
        .zoom
        .generated_sessions
        .push(ZoomGenerationRecord {
            session_id: first_session.to_string(),
            algorithm_version: 1,
            generated_at: "2026-01-01T00:00:00Z".into(),
        });
    let path = ProjectLayout::new(temporary.path(), project).project_manifest();
    write_atomic(&path, &serde_json::to_vec_pretty(&manifest).expect("json"))
        .expect("write project");

    let updated = create_or_update_project(
        temporary.path(),
        project,
        second_session,
        "2026-01-02T00:00:00Z",
    )
    .expect("updated project");
    assert_eq!(updated.editor.zoom.generated_sessions.len(), 1);
    assert_eq!(updated.sessions.len(), 2);
}

#[test]
fn generated_project_names_receive_a_unique_positive_suffix_on_collision() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let first_project = ProjectId::from_uuid(uuid::Uuid::from_bytes([
        1, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]));
    let second_project = ProjectId::from_uuid(uuid::Uuid::from_bytes([
        1, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
    ]));
    let first = create_or_update_project(
        temporary.path(),
        first_project,
        SessionId::new(),
        "2026-01-01T00:00:00Z",
    )
    .expect("first project");
    let second = create_or_update_project(
        temporary.path(),
        second_project,
        SessionId::new(),
        "2026-01-01T00:00:00Z",
    )
    .expect("second project");
    assert_eq!(first.name, "Calm Comet");
    assert_eq!(second.name, "Calm Comet 3");
}

#[test]
fn recovery_repairs_truncated_health_timing_and_cursor_jsonl() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    ManifestWriter::new(layout.clone())
        .checkpoint(&manifest(project, session))
        .expect("checkpoint");
    let cursor = layout
        .track_dir(TrackKind::Cursor)
        .join("cursor.partial.jsonl");
    for path in [layout.health(), layout.timing(), cursor.clone()] {
        std::fs::write(&path, "{\"valid\":true}\n{\"truncated\":").expect("write truncated JSONL");
    }

    let report = recover_session(&layout).expect("recover session");
    assert_eq!(report.ignored_trailing_jsonl_lines, 3);
    for path in [layout.health(), layout.timing(), cursor] {
        assert_eq!(
            std::fs::read_to_string(path).expect("read repaired JSONL"),
            "{\"valid\":true}\n"
        );
    }
}
