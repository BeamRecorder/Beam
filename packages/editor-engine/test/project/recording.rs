use crate::fixtures::decision;
use beam_editor_engine::project::recording::open;
use beam_media_manifest::{
    PermissionSnapshot, PlatformMetadata, ProjectId, ProjectManifest, ProjectSession, SegmentId,
    SegmentMetadata, SelectedSources, SessionId, SessionManifest, TrackFormat, TrackId, TrackKind,
    TrackMetadata, TrackMetrics, TrackStatus,
};
use std::{fs, path::Path};
fn recording(root: &Path) -> (ProjectManifest, SessionManifest) {
    let project_id = ProjectId::new();
    let session_id = SessionId::new();
    let folder = root.join(session_id.to_string());
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("screen.webm"), b"immutable recording").unwrap();
    let project = ProjectManifest {
        schema_version: 2,
        project_id,
        name: "Recording".into(),
        created_at_utc: "now".into(),
        updated_at_utc: "now".into(),
        sessions: vec![ProjectSession {
            session_id,
            relative_path: session_id.to_string(),
        }],
        editor: Default::default(),
        extra: Default::default(),
    };
    let session = SessionManifest {
        cursor_mode: Default::default(),
        schema_version: 2,
        project_id,
        session_id,
        created_at_utc: "now".into(),
        session_start_monotonic_ns: 1000,
        duration_ns: 10_000_000_000,
        platform: PlatformMetadata {
            os: "linux".into(),
            architecture: "x64".into(),
            backend: "test".into(),
        },
        selected_sources: SelectedSources {
            screen: None,
            system_audio: None,
            microphone: None,
            camera: None,
        },
        permissions: PermissionSnapshot::default(),
        warnings: vec![],
        completed: true,
        tracks: vec![TrackMetadata {
            track_id: TrackId::new(),
            kind: TrackKind::Screen,
            source_id: None,
            format: TrackFormat::Video {
                codec: "vp8".into(),
                width: 320,
                height: 180,
                nominal_fps: 30,
            },
            metrics: TrackMetrics::default(),
            status: TrackStatus::Completed,
            termination_reason: None,
            segments: vec![SegmentMetadata {
                segment_id: SegmentId::new(),
                path: "screen.webm".into(),
                start_ns: 0,
                end_ns: Some(10_000_000_000),
                complete: true,
            }],
        }],
    };
    save(root, &project, &session);
    (project, session)
}
fn save(root: &Path, project: &ProjectManifest, session: &SessionManifest) {
    fs::write(
        root.join("project.json"),
        serde_json::to_vec(project).unwrap(),
    )
    .unwrap();
    fs::write(
        root.join(project.sessions[0].relative_path.clone())
            .join("manifest.json"),
        serde_json::to_vec(session).unwrap(),
    )
    .unwrap();
}
#[test]
fn recorded_clicks_generate_source_time_zooms_and_leave_media_untouched() {
    let root = tempfile::tempdir().unwrap();
    let (project, _) = recording(root.path());
    let directory = root
        .path()
        .join(&project.sessions[0].relative_path)
        .join("cursor");
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("telemetry.json"), r#"{"version":2,"samples":[{"timeMs":1500,"cx":0.7,"cy":0.4,"interactionType":"click"},{"timeMs":1700,"cx":0.8,"cy":0.4,"interactionType":"double-click"}]}"#).unwrap();
    let editor = open(root.path()).unwrap();
    assert_eq!(editor.assets[0].zooms.len(), 1);
    assert_eq!(editor.assets[0].zooms[0].cx, 0.8);
    assert_eq!(editor.canvas.width, 320);
    assert_eq!(editor.duration_ms(), 10_000);
    assert_eq!(
        fs::read(root.path().join(&editor.assets[0].path)).unwrap(),
        b"immutable recording"
    );
}
#[test]
fn partial_optional_track_is_visible_without_fabricated_cursor_or_media() {
    let root = tempfile::tempdir().unwrap();
    let (project, mut session) = recording(root.path());
    session.tracks.push(TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::Microphone,
        source_id: None,
        format: TrackFormat::Audio {
            sample_format: "f32".into(),
            sample_rate: 48000,
            channels: 1,
        },
        segments: vec![],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Failed,
        termination_reason: Some("device disconnected".into()),
    });
    save(root.path(), &project, &session);
    let editor = open(root.path()).unwrap();
    assert_eq!(editor.assets.len(), 1);
    assert!(editor.assets[0].cursor.is_empty());
    assert!(editor.warnings.iter().any(|w| w.contains("disconnected")));
    assert_eq!(editor.tracks.len(), 2);
}
#[test]
fn mismatched_session_missing_segment_and_unfinished_segment_are_handled() {
    let root = tempfile::tempdir().unwrap();
    let (project, mut session) = recording(root.path());
    let original_id = session.project_id;
    session.project_id = ProjectId::new();
    save(root.path(), &project, &session);
    assert!(open(root.path()).is_err());
    session.project_id = original_id;
    session.tracks[0].segments[0].path = "missing.webm".into();
    save(root.path(), &project, &session);
    assert!(open(root.path()).is_err());
    session.tracks[0].segments[0].complete = false;
    save(root.path(), &project, &session);
    let editor = open(root.path()).unwrap();
    assert!(editor.assets.is_empty());
}
#[test]
fn traversal_unknown_schema_telemetry_and_empty_metadata_fail_explicitly() {
    let root = tempfile::tempdir().unwrap();
    let (mut project, session) = recording(root.path());
    let relative = project.sessions[0].relative_path.clone();
    project.schema_version = 99;
    save(root.path(), &project, &session);
    assert!(open(root.path()).is_err());
    project.schema_version = 2;
    project.sessions[0].relative_path = "..".into();
    fs::write(
        root.path().join("project.json"),
        serde_json::to_vec(&project).unwrap(),
    )
    .unwrap();
    assert!(open(root.path()).is_err());
    project.sessions[0].relative_path = relative;
    save(root.path(), &project, &session);
    let cursor = root
        .path()
        .join(&project.sessions[0].relative_path)
        .join("cursor");
    fs::create_dir(cursor.clone()).unwrap();
    fs::write(
        cursor.join("telemetry.json"),
        r#"{"version":99,"samples":[]}"#,
    )
    .unwrap();
    assert!(open(root.path()).is_err());
    fs::write(root.path().join("project.json"), b"{").unwrap();
    assert!(open(root.path()).is_err());
}

#[test]
fn importer_uses_manifest_cursor_mode_and_never_guesses_from_telemetry() {
    let root = tempfile::tempdir().unwrap();
    let (project, mut session) = recording(root.path());
    let directory = root
        .path()
        .join(&project.sessions[0].relative_path)
        .join("cursor");
    fs::create_dir(&directory).unwrap();
    fs::write(
        directory.join("telemetry.json"),
        r#"{"version":2,"samples":[{"timeMs":1500,"cx":0.7,"cy":0.4,"interactionType":"click"}]}"#,
    )
    .unwrap();
    for (stored, expected) in [
        (
            beam_media_manifest::CursorMode::Unknown,
            beam_editor_domain::recording::style_types::CursorMode::Unknown,
        ),
        (
            beam_media_manifest::CursorMode::Separated,
            beam_editor_domain::recording::style_types::CursorMode::Separated,
        ),
        (
            beam_media_manifest::CursorMode::BakedIn,
            beam_editor_domain::recording::style_types::CursorMode::BakedIn,
        ),
    ] {
        session.cursor_mode = stored;
        save(root.path(), &project, &session);
        let editor = open(root.path()).unwrap();
        assert_eq!(editor.assets[0].cursor_mode, expected);
        assert!(!editor.assets[0].cursor.is_empty());
        assert!(!decision(&editor.clips, 0).instances.is_empty());
        assert!(!decision(&editor.clips, 0).effects.auto_zoom);
    }
}
