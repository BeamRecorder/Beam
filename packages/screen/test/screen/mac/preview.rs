#![cfg(test)]

use super::preview_error;

#[test]
fn preview_failure_retains_the_platform_context() {
    assert_eq!(preview_error("bad image").code(), "capture-error");
    assert!(
        preview_error("bad image")
            .to_string()
            .contains("ScreenCaptureKit preview")
    );
}
