#![cfg(test)]

use super::backend_error;

#[test]
fn graphics_capture_catalog_errors_retain_the_backend_context() {
    let error = backend_error("enumeration failed");
    assert_eq!(error.code(), "capture-error");
    assert!(
        error
            .to_string()
            .contains("Windows Graphics Capture discovery failed")
    );
    assert!(error.to_string().contains("enumeration failed"));
}
