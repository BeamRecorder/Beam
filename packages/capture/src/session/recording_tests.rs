#![allow(clippy::expect_used)]

use crate::{
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        ProjectId, RecordingSettings,
    },
    session::StartGate,
};
use std::sync::Arc;

use super::RecordingSession;
use crate::session::SessionState;

fn prepared_session_without_screen() -> (tempfile::TempDir, RecordingSession) {
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
    let session = RecordingSession::prepare(request, snapshot).expect("prepare native session");
    (temporary, session)
}

fn assert_output_root_is_empty(temporary: &tempfile::TempDir) {
    assert!(
        temporary
            .path()
            .read_dir()
            .expect("read output root")
            .next()
            .is_none()
    );
}

#[test]
fn screen_availability_is_true_without_a_screen_recording() {
    let (_temporary, session) = prepared_session_without_screen();

    assert!(session.screen_available());
}

#[test]
fn screen_availability_is_false_for_an_active_unavailable_screen_recording() {
    let (_temporary, mut session) = prepared_session_without_screen();
    session.active.set_screen_availability_for_test(false);

    assert!(!session.screen_available());
}

#[test]
fn cancelling_a_failed_session_removes_project_and_session_artifacts() {
    let (temporary, mut session) = prepared_session_without_screen();
    session.state = SessionState::Failed;

    session.cancel().expect("cancel failed session");

    assert_output_root_is_empty(&temporary);
}

#[test]
fn starting_releases_the_prepared_gate_at_the_session_start_time() {
    let (_temporary, mut session) = prepared_session_without_screen();
    let gate = Arc::new(StartGate::new());
    assert!(!gate.is_released());
    session.prepared_start_gate = Some(gate.clone());

    session.start().expect("start native session");

    assert!(gate.is_released());
    assert_eq!(
        gate.wait().expect("read start time"),
        session.manifest.session_start_monotonic_ns
    );
    assert_eq!(session.state(), SessionState::Recording);
}

#[test]
fn starting_with_a_cancelled_prepared_gate_fails_and_can_be_cancelled() {
    let (temporary, mut session) = prepared_session_without_screen();
    let gate = Arc::new(StartGate::new());
    gate.cancel();
    session.prepared_start_gate = Some(gate);

    assert!(session.start().is_err());
    assert_eq!(session.state(), SessionState::Failed);

    session.cancel().expect("cancel failed start");
    assert_output_root_is_empty(&temporary);
}

#[test]
fn starting_with_an_already_released_prepared_gate_fails_and_can_be_discarded() {
    let (temporary, mut session) = prepared_session_without_screen();
    let gate = Arc::new(StartGate::new());
    gate.release(7).expect("release prepared gate");
    session.prepared_start_gate = Some(gate);

    assert!(session.start().is_err());
    assert_eq!(session.state(), SessionState::Failed);

    session.discard().expect("discard failed start");
    assert_output_root_is_empty(&temporary);
}

#[test]
fn start_segment_rejects_an_invalid_gate_and_marks_the_session_failed() {
    let (temporary, mut session) = prepared_session_without_screen();
    let gate = StartGate::new();
    gate.release(7).expect("release prepared gate");

    assert!(session.start_segment(&gate, 9, 0).is_err());
    assert_eq!(session.state(), SessionState::Failed);

    session.cancel().expect("cancel failed segment start");
    assert_output_root_is_empty(&temporary);
}
