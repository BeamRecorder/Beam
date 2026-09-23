use beam_media_engine::{EngineError, RecordingState};
#[test]
fn errors_preserve_context() {
    assert!(
        EngineError::InvalidConfiguration("bad crop".into())
            .to_string()
            .contains("bad crop")
    );
    assert!(
        EngineError::InvalidTransition {
            state: RecordingState::Armed,
            operation: "prepare"
        }
        .to_string()
        .contains("Armed")
    );
    assert!(
        EngineError::Media("encoder stopped".into())
            .to_string()
            .contains("encoder stopped")
    );
}
#[test]
fn error_codes_are_actionable_across_the_process_boundary() {
    let errors = [
        (EngineError::Cancelled, "cancelled"),
        (
            EngineError::InvalidConfiguration("bad".into()),
            "invalid-configuration",
        ),
        (
            EngineError::InvalidTransition {
                state: RecordingState::Idle,
                operation: "pause",
            },
            "invalid-transition",
        ),
        (EngineError::StaleSession, "stale-session"),
        (EngineError::WorkerUnavailable, "worker-unavailable"),
        (EngineError::Busy, "busy"),
        (EngineError::Media("lost".into()), "media-error"),
        (
            EngineError::Storage(std::io::Error::other("disk")),
            "storage-error",
        ),
    ];
    for (error, code) in errors {
        assert_eq!(error.code(), code);
    }
}
