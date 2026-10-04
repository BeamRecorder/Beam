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
        hide_taskbar: false,
        hide_desktop_icons: false,
        show_real_cursor: false,
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
fn input_failure_is_latched_and_saved_once_without_stopping_video() {
    let (_temporary, mut session) = prepared_session_without_screen();
    session.request.cursor = CursorSelection::Separate {
        capture_clicks: true,
        capture_shortcuts: true,
        capture_shape: true,
    };
    session.state = SessionState::Recording;
    let failure = crate::input::InputAccessStatus::failed(&crate::CaptureError::Backend(
        "Helper stopped".into(),
    ));

    let first = session
        .update_input_health(&failure)
        .expect("persist input failure")
        .expect("input failure");
    let second = session
        .update_input_health(&crate::input::InputAccessStatus::available(
            Some(1),
            Some(1),
        ))
        .expect("read latched failure");
    assert_eq!(second, Some(first));
    assert_eq!(session.state(), SessionState::Recording);
    assert_eq!(session.manifest.warnings.len(), 1);
    let health = std::fs::read_to_string(session.layout.health()).expect("health log");
    assert_eq!(health.lines().count(), 1);
    let manifest: crate::model::SessionManifest =
        crate::storage::read_json(&session.layout.partial_manifest())
            .expect("checkpointed manifest");
    assert!(manifest.warnings[0].contains("Helper stopped"));
}

#[test]
fn paused_input_failures_remain_visible_and_completed_projects_keep_the_diagnostic() {
    let (_temporary, mut session) = prepared_session_without_screen();
    session.request.cursor = CursorSelection::Separate {
        capture_clicks: true,
        capture_shortcuts: false,
        capture_shape: true,
    };
    session.state = SessionState::Paused;
    assert!(
        session
            .update_input_health(&crate::input::InputAccessStatus::required())
            .expect("persist paused failure")
            .is_some()
    );
    let manifest_path = session
        .stop()
        .expect("complete video despite input failure");
    let manifest: crate::model::SessionManifest =
        crate::storage::read_json(&manifest_path).expect("completed manifest");
    assert!(manifest.completed);
    assert!(
        manifest
            .warnings
            .iter()
            .any(|message| message.contains("Automatic zooms"))
    );
}

#[test]
fn prepared_and_completed_sessions_do_not_monitor_input_access() {
    let (_temporary, mut session) = prepared_session_without_screen();
    session.request.cursor = CursorSelection::Separate {
        capture_clicks: true,
        capture_shortcuts: true,
        capture_shape: true,
    };
    for state in [SessionState::Armed, SessionState::Completed] {
        session.state = state;
        assert!(
            session
                .update_input_health(&crate::input::InputAccessStatus::required())
                .expect("ignore inactive input failure")
                .is_none()
        );
    }
    assert!(session.manifest.warnings.is_empty());
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
