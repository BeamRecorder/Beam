#![allow(clippy::expect_used)]

use std::sync::Arc;

use capture::{
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        ProjectId, RecordingSettings,
    },
    session::{RecordingSession, SessionState, StartGate},
};

#[test]
fn native_session_finalizes_storage_and_supports_pause_segments() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings {
            output_root: temporary.path().into(),
            minimum_free_bytes: 0,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    let mut session = RecordingSession::prepare(request, snapshot).expect("prepare native session");
    let partial = session
        .manifest_path()
        .with_file_name("manifest.partial.json");
    assert!(partial.exists());
    session.start().expect("start native session");
    session.pause().expect("pause native session");
    session.resume().expect("resume native session");
    let manifest_path = session.stop().expect("stop native session");
    assert_eq!(session.state(), SessionState::Completed);
    assert!(manifest_path.exists());
    assert!(!partial.exists());
    let manifest: capture::model::SessionManifest =
        serde_json::from_slice(&std::fs::read(manifest_path).expect("read final manifest"))
            .expect("parse final manifest");
    assert!(manifest.completed);
    assert!(manifest.tracks.is_empty());
}

#[test]
fn native_session_discard_removes_the_project_and_session() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings {
            output_root: temporary.path().into(),
            minimum_free_bytes: 0,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::FailFast,
        region: None,
        excluded_process_id: None,
        excluded_window_handles: vec![],
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    let mut session = RecordingSession::prepare(request, snapshot).expect("prepare native session");
    session.start().expect("start native session");
    session.discard().expect("discard native session");

    assert!(
        temporary
            .path()
            .read_dir()
            .expect("read projects")
            .next()
            .is_none()
    );
}

#[test]
fn shared_start_gate_releases_every_waiter_with_the_same_t0() {
    let gate = Arc::new(StartGate::new());
    let waiters = (0..3)
        .map(|_| {
            let gate = gate.clone();
            std::thread::spawn(move || gate.wait())
        })
        .collect::<Vec<_>>();
    assert!(!gate.is_released());
    gate.release(42).expect("release start gate");
    for waiter in waiters {
        assert_eq!(waiter.join().expect("waiter thread").expect("wait"), 42);
    }
}

#[test]
fn cancelling_start_gate_wakes_prepared_backends() {
    let gate = Arc::new(StartGate::new());
    let waiter_gate = gate.clone();
    let waiter = std::thread::spawn(move || waiter_gate.wait());
    gate.cancel();
    assert!(waiter.join().expect("waiter thread").is_err());
    assert!(gate.release(1).is_err());
}
