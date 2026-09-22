#![cfg(test)]
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

#[test]
fn empty_session_can_start_pause_resume_and_complete_once() {
    let (_temporary, mut session) = prepared_session_without_screen();
    let manifest_path = session.manifest_path();
    assert_eq!(session.state(), SessionState::Armed);
    session.start().expect("start");
    assert_eq!(session.state(), SessionState::Recording);
    session.pause().expect("pause");
    assert_eq!(session.state(), SessionState::Paused);
    session.resume().expect("resume");
    assert_eq!(session.state(), SessionState::Recording);
    let first_path = session.stop().expect("stop");
    assert_eq!(first_path, manifest_path);
    assert_eq!(session.state(), SessionState::Completed);
    assert_eq!(session.stop().expect("idempotent stop"), first_path);
    let persisted: crate::model::SessionManifest =
        serde_json::from_slice(&std::fs::read(first_path).expect("read manifest"))
            .expect("valid manifest");
    assert!(persisted.completed);
    assert!(persisted.tracks.is_empty());
}

#[test]
fn invalid_session_transitions_leave_the_current_state_intact() {
    let (_temporary, mut session) = prepared_session_without_screen();
    assert!(matches!(
        session.pause(),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert!(matches!(
        session.resume(),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert_eq!(session.state(), SessionState::Armed);
    session.start().expect("start");
    assert!(matches!(
        session.start(),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert!(matches!(
        session.resume(),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert_eq!(session.state(), SessionState::Recording);
    session.pause().expect("pause");
    assert!(matches!(
        session.pause(),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert_eq!(session.state(), SessionState::Paused);
}

#[test]
fn discarding_recording_and_paused_sessions_removes_artifacts() {
    for pause in [false, true] {
        let (temporary, mut session) = prepared_session_without_screen();
        session.start().expect("start");
        if pause {
            session.pause().expect("pause");
        }
        session.discard().expect("discard");
        assert_output_root_is_empty(&temporary);
    }
}

#[test]
fn cancelling_an_armed_session_removes_artifacts() {
    let (temporary, session) = prepared_session_without_screen();
    session.cancel().expect("cancel armed session");
    assert_output_root_is_empty(&temporary);
}

#[test]
fn cancelling_a_new_session_preserves_an_existing_project_and_earlier_session() {
    let (_temporary, mut first) = prepared_session_without_screen();
    let request = first.request.clone();
    let snapshot = first.snapshot.clone();
    let first_id = first.session_id();
    let first_manifest = first.manifest_path();
    first.start().expect("first start");
    first.stop().expect("first stop");

    let second = RecordingSession::prepare(request, snapshot).expect("second session");
    let second_manifest = second.manifest_path();
    let project_manifest = second.project_layout.project_manifest();
    assert!(second.project_existed);
    second.cancel().expect("cancel second session");

    assert!(first_manifest.exists());
    assert!(!second_manifest.exists());
    let project: crate::model::ProjectManifest =
        serde_json::from_slice(&std::fs::read(project_manifest).expect("project manifest"))
            .expect("valid project");
    assert_eq!(project.sessions.len(), 1);
    assert_eq!(project.sessions[0].session_id, first_id);
}

#[test]
fn completed_session_rejects_cancel_without_deleting_manifest() {
    let (_temporary, mut session) = prepared_session_without_screen();
    let path = session.stop().expect("finalize armed session");
    assert_eq!(session.state(), SessionState::Completed);
    assert!(matches!(
        session.cancel(),
        Err(crate::CaptureError::InvalidTransition { .. })
    ));
    assert!(path.exists());
}

#[test]
fn recording_and_paused_sessions_reject_cancel_without_removing_artifacts() {
    for paused in [false, true] {
        let (temporary, mut session) = prepared_session_without_screen();
        session.start().expect("start");
        if paused {
            session.pause().expect("pause");
        }
        let manifest = session.manifest_path();
        let error = session
            .cancel()
            .expect_err("cancel requires armed or failed");
        assert_eq!(error.code(), "invalid-transition");
        assert!(manifest.exists());
        assert!(
            temporary
                .path()
                .read_dir()
                .expect("project directory")
                .next()
                .is_some()
        );
    }
}

#[test]
fn stopping_armed_session_preserves_failed_track_and_completes_healthy_track() {
    use crate::model::{TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus};
    let (_temporary, mut session) = prepared_session_without_screen();
    let track = |kind, status| TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id: None,
        format: TrackFormat::Events {
            format: "json".into(),
        },
        segments: Vec::new(),
        metrics: TrackMetrics::default(),
        status,
        termination_reason: None,
    };
    session.manifest.tracks = vec![
        track(TrackKind::Screen, TrackStatus::Failed),
        track(TrackKind::Cursor, TrackStatus::Paused),
    ];
    let path = session.stop().expect("finalize with failed track");
    assert_eq!(session.state(), SessionState::Completed);
    let manifest: crate::model::SessionManifest =
        serde_json::from_slice(&std::fs::read(path).expect("manifest")).expect("valid manifest");
    assert_eq!(manifest.tracks[0].status, TrackStatus::Failed);
    assert_eq!(manifest.tracks[1].status, TrackStatus::Completed);
    assert!(manifest.completed);
}

#[test]
fn completed_session_rejects_all_recording_transitions_and_stop_is_stable() {
    let (_temporary, mut session) = prepared_session_without_screen();
    let path = session.stop().expect("complete armed session");
    for error in [
        session.start().expect_err("restart"),
        session.pause().expect_err("pause"),
        session.resume().expect_err("resume"),
    ] {
        assert_eq!(error.code(), "invalid-transition");
        assert_eq!(session.state(), SessionState::Completed);
    }
    assert_eq!(session.stop().expect("idempotent stop"), path);
}

#[test]
fn failed_start_can_still_finalize_a_completed_manifest() {
    let (_temporary, mut session) = prepared_session_without_screen();
    let gate = Arc::new(StartGate::new());
    gate.cancel();
    session.prepared_start_gate = Some(gate);
    assert!(session.start().is_err());
    assert_eq!(session.state(), SessionState::Failed);
    let path = session.stop().expect("finalize failed start");
    assert_eq!(session.state(), SessionState::Completed);
    let manifest: crate::model::SessionManifest =
        serde_json::from_slice(&std::fs::read(path).expect("manifest")).expect("valid manifest");
    assert!(manifest.completed);
}
