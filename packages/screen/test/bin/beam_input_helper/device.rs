#![cfg(test)]

use super::supports_mouse_capabilities;

#[test]
fn accepts_button_and_relative_pointer_devices() {
    assert!(supports_mouse_capabilities(
        true, false, false, false, false
    ));
    assert!(supports_mouse_capabilities(
        false, true, false, false, false
    ));
}

#[test]
fn accepts_absolute_indirect_pointer_devices() {
    assert!(supports_mouse_capabilities(false, false, true, true, false));
}

#[test]
fn rejects_direct_touchscreens_and_non_pointer_absolute_devices() {
    assert!(!supports_mouse_capabilities(false, false, true, true, true));
    assert!(!supports_mouse_capabilities(
        false, false, true, false, false
    ));
}
#[test]
fn native_capability_sets_distinguish_pointers_touchscreens_and_keyboards() {
    use evdev::{
        AbsoluteAxisCode as A, AttributeSet, KeyCode as K, PropType as P, RelativeAxisCode as R,
    };
    let empty = AttributeSet::<P>::new();
    assert!(!super::supports_mouse_state(None, None, None, &empty));
    for key in [
        K::BTN_LEFT,
        K::BTN_RIGHT,
        K::BTN_MIDDLE,
        K::BTN_SIDE,
        K::BTN_EXTRA,
    ] {
        let mut keys = AttributeSet::<K>::new();
        keys.insert(key);
        assert!(super::supports_mouse_state(Some(&keys), None, None, &empty));
        assert!(!super::supports_shortcut_keys(Some(&keys)));
    }
    let mut relative = AttributeSet::<R>::new();
    relative.insert(R::REL_X);
    assert!(!super::supports_mouse_state(
        None,
        Some(&relative),
        None,
        &empty
    ));
    relative.insert(R::REL_Y);
    assert!(super::supports_mouse_state(
        None,
        Some(&relative),
        None,
        &empty
    ));
    let mut absolute = AttributeSet::<A>::new();
    absolute.insert(A::ABS_X);
    absolute.insert(A::ABS_Y);
    let mut properties = AttributeSet::<P>::new();
    properties.insert(P::POINTER);
    assert!(super::supports_mouse_state(
        None,
        None,
        Some(&absolute),
        &properties
    ));
    properties.insert(P::DIRECT);
    assert!(!super::supports_mouse_state(
        None,
        None,
        Some(&absolute),
        &properties
    ));
    assert!(!super::supports_shortcut_keys(None));
    for key in [
        K::KEY_LEFTCTRL,
        K::KEY_RIGHTCTRL,
        K::KEY_LEFTALT,
        K::KEY_RIGHTALT,
        K::KEY_LEFTMETA,
        K::KEY_RIGHTMETA,
    ] {
        let mut keys = AttributeSet::<K>::new();
        keys.insert(key);
        assert!(super::supports_shortcut_keys(Some(&keys)));
    }
}
