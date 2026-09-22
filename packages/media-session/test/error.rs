use beam_media_core::GateError;
use beam_media_session::SessionError;

#[test]
fn gate_failures_keep_their_source_and_context() {
    let error = SessionError::from(GateError::AlreadyReleased);
    assert!(matches!(
        error,
        SessionError::Clock(GateError::AlreadyReleased)
    ));
    assert!(error.to_string().contains("already released"));
}
