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

#[test]
fn cancelling_a_failed_session_removes_project_and_session_artifacts() {
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
    let mut session = RecordingSession::prepare(request, snapshot).expect("prepare native session");
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
