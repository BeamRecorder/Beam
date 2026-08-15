use super::SessionState;

#[test]
fn only_armed_and_failed_sessions_can_be_cancelled() {
    assert!(SessionState::Armed.can_cancel());
    assert!(SessionState::Failed.can_cancel());

    for state in [
        SessionState::Idle,
        SessionState::Discovering,
        SessionState::Preparing,
        SessionState::Recording,
        SessionState::Paused,
        SessionState::Stopping,
        SessionState::Finalizing,
        SessionState::Completed,
        SessionState::Degraded,
        SessionState::Recoverable,
    ] {
        assert!(!state.can_cancel());
    }
}
