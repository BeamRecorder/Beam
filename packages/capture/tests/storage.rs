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
            system_audio: None,
            microphone: None,
            camera: None,
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
