#![cfg(test)]

use super::backend_error;

#[test]
fn screenshot_capture_errors_keep_the_native_detail() {
    let error = backend_error("first frame timeout");
    assert_eq!(error.code(), "capture-error");
    assert!(error.to_string().contains("first frame timeout"));
}
