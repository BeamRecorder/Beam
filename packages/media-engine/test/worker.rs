use beam_media_engine::{EngineError, RecordingController, SessionId};
#[test]
fn idle_worker_rejects_session_commands() {
    let root = tempfile::tempdir().unwrap();
    let engine = RecordingController::new(root.path()).unwrap();
    let id = SessionId::new();
    assert!(matches!(engine.start(id), Err(EngineError::StaleSession)));
    assert!(matches!(engine.stop(id), Err(EngineError::StaleSession)));
    assert!(matches!(engine.cancel(id), Err(EngineError::StaleSession)));
    assert!(matches!(
        engine.camera_preview(id),
        Err(EngineError::StaleSession)
    ));
}
