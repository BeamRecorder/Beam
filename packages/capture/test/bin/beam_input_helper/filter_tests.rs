#![cfg(test)]

use capture::input::{InputKey, InputModifier, NativeInputEvent};
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

#[test]
fn all_mouse_buttons_preserve_identity_and_release_state() {
    for (key, button) in [
        (KeyCode::BTN_LEFT, 1),
        (KeyCode::BTN_RIGHT, 2),
        (KeyCode::BTN_MIDDLE, 3),
        (KeyCode::BTN_SIDE, 4),
        (KeyCode::BTN_EXTRA, 5),
    ] {
        let mut filter = InputFilter::default();
        assert_eq!(
            filter.apply(key, 1, 10),
            Some(NativeInputEvent::MouseButton {
                monotonic_ns: 10,
                button,
                pressed: true,
            })
        );
        assert_eq!(
            filter.apply(key, 0, 11),
            Some(NativeInputEvent::MouseButton {
                monotonic_ns: 11,
                button,
                pressed: false,
            })
        );
        assert_eq!(filter.apply(key, 2, 12), None);
    }
}

#[test]
fn non_printable_keys_emit_without_modifiers_and_ignore_orphan_releases() {
    let mut filter = InputFilter::default();
    assert_eq!(filter.apply(KeyCode::KEY_ESC, 0, 1), None);
    assert_eq!(filter.apply(KeyCode::KEY_ESC, 3, 2), None);
    assert_eq!(
        filter.apply(KeyCode::KEY_ESC, 1, 3),
        Some(NativeInputEvent::Shortcut {
            monotonic_ns: 3,
            pressed: true,
            modifiers: Vec::new(),
            key: InputKey::Escape,
        })
    );
    assert_eq!(filter.apply(KeyCode::KEY_ESC, 2, 4), None);
    assert_eq!(
        filter.apply(KeyCode::KEY_ESC, 0, 5),
        Some(NativeInputEvent::Shortcut {
            monotonic_ns: 5,
            pressed: false,
            modifiers: Vec::new(),
            key: InputKey::Escape,
        })
    );
    assert_eq!(filter.apply(KeyCode::KEY_ESC, 0, 6), None);
}

#[test]
fn shortcut_release_retains_modifier_snapshot_after_modifiers_change() {
    let mut filter = InputFilter::default();
    assert_eq!(filter.apply(KeyCode::KEY_LEFTMETA, 1, 1), None);
    assert_eq!(filter.apply(KeyCode::KEY_LEFTCTRL, 1, 2), None);
    assert_eq!(
        filter.apply(KeyCode::KEY_Q, 1, 3),
        Some(NativeInputEvent::Shortcut {
            monotonic_ns: 3,
            pressed: true,
            modifiers: vec![InputModifier::Control, InputModifier::Meta],
            key: InputKey::Q,
        })
    );
    assert_eq!(filter.apply(KeyCode::KEY_LEFTCTRL, 0, 4), None);
    assert_eq!(filter.apply(KeyCode::KEY_LEFTMETA, 0, 5), None);
    assert_eq!(
        filter.apply(KeyCode::KEY_Q, 0, 6),
        Some(NativeInputEvent::Shortcut {
            monotonic_ns: 6,
            pressed: false,
            modifiers: vec![InputModifier::Control, InputModifier::Meta],
            key: InputKey::Q,
        })
    );
}

#[test]
fn alt_and_meta_allow_printable_keys_while_shift_alone_does_not() {
    for modifier in [
        KeyCode::KEY_LEFTALT,
        KeyCode::KEY_RIGHTALT,
        KeyCode::KEY_LEFTMETA,
        KeyCode::KEY_RIGHTMETA,
    ] {
        let mut filter = InputFilter::default();
        filter.apply(KeyCode::KEY_LEFTSHIFT, 1, 1);
        assert_eq!(filter.apply(KeyCode::KEY_A, 1, 2), None);
        filter.apply(modifier, 1, 3);
        assert!(matches!(
            filter.apply(KeyCode::KEY_A, 1, 4),
            Some(NativeInputEvent::Shortcut {
                key: InputKey::A,
                ..
            })
        ));
    }
}

#[test]
fn all_navigation_and_function_keys_are_mapped() {
    let keys = [
        (KeyCode::KEY_UP, InputKey::ArrowUp),
        (KeyCode::KEY_DOWN, InputKey::ArrowDown),
        (KeyCode::KEY_LEFT, InputKey::ArrowLeft),
        (KeyCode::KEY_RIGHT, InputKey::ArrowRight),
        (KeyCode::KEY_ENTER, InputKey::Enter),
        (KeyCode::KEY_TAB, InputKey::Tab),
        (KeyCode::KEY_BACKSPACE, InputKey::Backspace),
        (KeyCode::KEY_DELETE, InputKey::Delete),
        (KeyCode::KEY_INSERT, InputKey::Insert),
        (KeyCode::KEY_HOME, InputKey::Home),
        (KeyCode::KEY_END, InputKey::End),
        (KeyCode::KEY_PAGEUP, InputKey::PageUp),
        (KeyCode::KEY_PAGEDOWN, InputKey::PageDown),
        (KeyCode::KEY_F1, InputKey::F1),
        (KeyCode::KEY_F2, InputKey::F2),
        (KeyCode::KEY_F3, InputKey::F3),
        (KeyCode::KEY_F4, InputKey::F4),
        (KeyCode::KEY_F5, InputKey::F5),
        (KeyCode::KEY_F6, InputKey::F6),
        (KeyCode::KEY_F7, InputKey::F7),
        (KeyCode::KEY_F8, InputKey::F8),
        (KeyCode::KEY_F9, InputKey::F9),
        (KeyCode::KEY_F10, InputKey::F10),
        (KeyCode::KEY_F11, InputKey::F11),
        (KeyCode::KEY_F12, InputKey::F12),
    ];
    for (key, expected) in keys {
        let mut filter = InputFilter::default();
        assert!(
            matches!(filter.apply(key, 1, 8), Some(NativeInputEvent::Shortcut { key, .. }) if key == expected)
        );
    }
}

#[test]
fn letters_digits_and_space_are_mapped_with_control() {
    let keys = [
        (KeyCode::KEY_A, InputKey::A),
        (KeyCode::KEY_B, InputKey::B),
        (KeyCode::KEY_C, InputKey::C),
        (KeyCode::KEY_D, InputKey::D),
        (KeyCode::KEY_E, InputKey::E),
        (KeyCode::KEY_F, InputKey::F),
        (KeyCode::KEY_G, InputKey::G),
        (KeyCode::KEY_H, InputKey::H),
        (KeyCode::KEY_I, InputKey::I),
        (KeyCode::KEY_J, InputKey::J),
        (KeyCode::KEY_K, InputKey::K),
        (KeyCode::KEY_L, InputKey::L),
        (KeyCode::KEY_M, InputKey::M),
        (KeyCode::KEY_N, InputKey::N),
        (KeyCode::KEY_O, InputKey::O),
        (KeyCode::KEY_P, InputKey::P),
        (KeyCode::KEY_Q, InputKey::Q),
        (KeyCode::KEY_R, InputKey::R),
        (KeyCode::KEY_S, InputKey::S),
        (KeyCode::KEY_T, InputKey::T),
        (KeyCode::KEY_U, InputKey::U),
        (KeyCode::KEY_V, InputKey::V),
        (KeyCode::KEY_W, InputKey::W),
        (KeyCode::KEY_X, InputKey::X),
        (KeyCode::KEY_Y, InputKey::Y),
        (KeyCode::KEY_Z, InputKey::Z),
        (KeyCode::KEY_0, InputKey::Digit0),
        (KeyCode::KEY_1, InputKey::Digit1),
        (KeyCode::KEY_2, InputKey::Digit2),
        (KeyCode::KEY_3, InputKey::Digit3),
        (KeyCode::KEY_4, InputKey::Digit4),
        (KeyCode::KEY_5, InputKey::Digit5),
        (KeyCode::KEY_6, InputKey::Digit6),
        (KeyCode::KEY_7, InputKey::Digit7),
        (KeyCode::KEY_8, InputKey::Digit8),
        (KeyCode::KEY_9, InputKey::Digit9),
        (KeyCode::KEY_SPACE, InputKey::Space),
    ];
    for (key, expected) in keys {
        let mut filter = InputFilter::default();
        filter.apply(KeyCode::KEY_RIGHTCTRL, 1, 1);
        assert!(
            matches!(filter.apply(key, 1, 2), Some(NativeInputEvent::Shortcut { key, .. }) if key == expected)
        );
    }
}

#[test]
fn unmapped_input_key_is_ignored_without_creating_a_shortcut() {
    let mut filter = InputFilter::default();
    filter.apply(KeyCode::KEY_LEFTCTRL, 1, 1);
    assert_eq!(filter.apply(KeyCode::KEY_VOLUMEUP, 1, 2), None);
    assert_eq!(filter.apply(KeyCode::KEY_VOLUMEUP, 0, 3), None);
}
