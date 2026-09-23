use beam_media_engine::{API_VERSION, RecordingController, RecordingState};
#[test]
fn idle_snapshot_is_typed_and_empty() {
    assert_eq!(API_VERSION, 1);
    let root = tempfile::tempdir().unwrap();
    let engine = RecordingController::new(root.path()).unwrap();
    let status = engine.status();
    assert_eq!(status.state, RecordingState::Idle);
    assert!(status.session_id.is_none());
    assert!(status.manifest.is_none());
    assert!(status.error.is_none());
}
