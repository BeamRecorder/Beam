#![allow(clippy::expect_used)]

use capture::input::{INPUT_SIDECAR_VERSION, InputEvent, InputEventSidecar, NativeInputEvent};

#[test]
fn input_events_keep_native_and_session_timestamps_separate() {
    let native = NativeInputEvent::MouseMotion {
        monotonic_ns: 500,
        delta_x: -2,
        delta_y: 3,
    };
    let session = InputEvent::MouseButton {
        session_ns: 20,
        button: 1,
        pressed: true,
    };
    assert_eq!(native.monotonic_ns(), 500);
    assert_eq!(session.session_ns(), 20);
    let sidecar = InputEventSidecar::new(vec![session]);
    assert_eq!(sidecar.version, INPUT_SIDECAR_VERSION);
    assert_eq!(
        serde_json::to_value(&sidecar).expect("JSON")["events"][0]["event"],
        "mouse-button"
    );
}
