#![allow(clippy::expect_used)]

use capture::model::CaptureCapabilities;

#[test]
fn new_capability_flags_default_to_false_in_old_snapshots() {
    let capabilities: CaptureCapabilities =
        serde_json::from_str(r#"{"displayCapture":true}"#).expect("older capabilities");
    assert!(capabilities.display_capture);
    assert!(!capabilities.hardware_av1);
    assert!(!capabilities.cursor_shapes);
}
