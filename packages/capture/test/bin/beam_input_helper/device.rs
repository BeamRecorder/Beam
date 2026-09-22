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
