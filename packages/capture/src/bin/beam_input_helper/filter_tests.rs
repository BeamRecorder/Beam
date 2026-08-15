use capture::input::{InputKey, NativeInputEvent};
use evdev::KeyCode;

use super::linux::InputFilter;

#[test]
fn printable_keys_require_a_non_shift_modifier() {
    let mut filter = InputFilter::default();
    assert_eq!(filter.apply(KeyCode::KEY_W, 1, 1), None);
    assert_eq!(filter.apply(KeyCode::KEY_LEFTSHIFT, 1, 2), None);
    assert_eq!(filter.apply(KeyCode::KEY_W, 1, 3), None);
    assert_eq!(filter.apply(KeyCode::KEY_LEFTCTRL, 1, 4), None);
    assert!(matches!(
        filter.apply(KeyCode::KEY_W, 1, 5),
        Some(NativeInputEvent::Shortcut {
            pressed: true,
            key: InputKey::W,
            ..
        })
    ));
}

#[test]
fn button_mapping_keeps_clicks_structured() {
    let mut filter = InputFilter::default();
    assert_eq!(
        filter.apply(KeyCode::BTN_RIGHT, 1, 42),
        Some(NativeInputEvent::MouseButton {
            monotonic_ns: 42,
            button: 2,
            pressed: true,
        })
    );
}
