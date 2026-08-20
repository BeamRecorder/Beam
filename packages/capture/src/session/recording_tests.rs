#![allow(clippy::expect_used)]

use crate::{
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        ProjectId, RecordingSettings,
    },
};

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

    assert!(
        temporary
            .path()
            .read_dir()
            .expect("read output root")
            .next()
            .is_none()
    );
}
