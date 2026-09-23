#![allow(clippy::expect_used)]

use beam_screen::{
    CaptureError,
    input::{InputAccessState, InputAccessStatus},
};

#[test]
fn failed_input_access_keeps_the_native_error_code_without_claiming_permissions() {
    let status = InputAccessStatus::failed(&CaptureError::PermissionDenied("input".into()));
    assert_eq!(status.state, InputAccessState::Unavailable);
    assert!(status.can_request);
    assert!(!status.clicks);
    assert!(!status.records_text);
    let error = status.error.expect("error details");
    assert_eq!(error.code, "permission-denied");
}
