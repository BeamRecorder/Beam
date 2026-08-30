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
fn project_editor_auto_follow_and_unknown_fields_survive_a_new_recording() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let first_session = SessionId::new();
    let second_session = SessionId::new();
    create_or_update_project(
        temporary.path(),
        project,
        first_session,
        "2026-01-01T00:00:00Z",
    )
    .expect("project");

    let path = ProjectLayout::new(temporary.path(), project).project_manifest();
    let mut value: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).expect("read project")).expect("json");
    let editor = value
        .get_mut("editor")
        .and_then(serde_json::Value::as_object_mut)
        .expect("editor object");
    editor.insert(
        "futureEditorSetting".into(),
        serde_json::json!({ "enabled": true, "version": 3 }),
    );
    let zoom = editor
        .get_mut("zoom")
        .and_then(serde_json::Value::as_object_mut)
        .expect("zoom object");
    zoom.insert(
        "autoFollow".into(),
        serde_json::json!({
            "safeZone": 0.42,
            "responsiveness": 0.8,
            "directionLock": false
        }),
    );
    zoom.insert(
        "futureZoomSetting".into(),
        serde_json::json!({ "mode": "experimental" }),
    );
    write_atomic(
        &path,
        &serde_json::to_vec_pretty(&value).expect("serialize project"),
    )
    .expect("write project");

    let updated = create_or_update_project(
        temporary.path(),
        project,
        second_session,
        "2026-01-02T00:00:00Z",
    )
    .expect("updated project");

    assert_eq!(
        updated.editor.extra.get("futureEditorSetting"),
        Some(&serde_json::json!({ "enabled": true, "version": 3 }))
    );
    assert_eq!(
        updated.editor.zoom.extra.get("autoFollow"),
        Some(&serde_json::json!({
            "safeZone": 0.42,
            "responsiveness": 0.8,
            "directionLock": false
        }))
    );
    assert_eq!(
        updated.editor.zoom.extra.get("futureZoomSetting"),
        Some(&serde_json::json!({ "mode": "experimental" }))
    );

    let persisted: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).expect("read updated project"))
            .expect("updated json");
    assert_eq!(persisted["editor"]["zoom"]["autoFollow"]["safeZone"], 0.42);
    assert_eq!(persisted["editor"]["futureEditorSetting"]["version"], 3);
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
    assert_eq!(second.name, "Calm Comet 2");
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
    let input = layout
        .track_dir(TrackKind::Cursor)
        .join("input.partial.jsonl");
    for path in [
        layout.health(),
        layout.timing(),
        cursor.clone(),
        input.clone(),
    ] {
        std::fs::write(&path, "{\"valid\":true}\n{\"truncated\":").expect("write truncated JSONL");
    }

    let report = recover_session(&layout).expect("recover session");
    assert_eq!(report.ignored_trailing_jsonl_lines, 4);
    for path in [layout.health(), layout.timing(), cursor, input] {
        assert_eq!(
            std::fs::read_to_string(path).expect("read repaired JSONL"),
            "{\"valid\":true}\n"
        );
    }
}

#[test]
fn recovery_marks_a_missing_or_incomplete_media_segment_interrupted() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    let mut value = manifest(project, session);
    value.tracks.push(TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Screen,
        source_id: None,
        format: TrackFormat::Video {
            codec: "h264".into(),
            width: 1920,
            height: 1080,
            nominal_fps: 60,
        },
        segments: vec![segment("screen/segment-0001.mp4".into(), 0)],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Recording,
        termination_reason: None,
    });
    ManifestWriter::new(layout.clone())
        .checkpoint(&value)
        .expect("checkpoint");

    let report = recover_session(&layout).expect("recover interrupted session");
    assert_eq!(report.manifest.tracks[0].status, TrackStatus::Interrupted);
    assert!(
        report.manifest.tracks[0]
            .termination_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("finalized"))
    );
    assert!(!report.manifest.tracks[0].segments[0].complete);
}

#[test]
fn recovery_preserves_a_failed_cursor_track_and_its_diagnostic_reason() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    let reason = "macOS cursor worker stopped: CGEventCreate failed";
    let mut value = manifest(project, session);
    value.tracks.push(TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Cursor,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: vec![segment("cursor/cursor.json".into(), 0)],
        metrics: TrackMetrics {
            frames_received: 1,
            ..TrackMetrics::default()
        },
        status: TrackStatus::Failed,
        termination_reason: Some(reason.into()),
    });

    ManifestWriter::new(layout.clone())
        .checkpoint(&value)
        .expect("checkpoint failed cursor track");
    let report = recover_session(&layout).expect("recover failed cursor session");
    let track = &report.manifest.tracks[0];
    assert_eq!(track.status, TrackStatus::Failed);
    assert_eq!(track.termination_reason.as_deref(), Some(reason));
    assert_eq!(track.metrics.frames_received, 1);
}
