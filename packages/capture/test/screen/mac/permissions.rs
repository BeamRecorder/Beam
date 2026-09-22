#![cfg(test)]

use super::capabilities;

#[test]
fn mac_capabilities_advertise_native_screen_and_separate_cursor() {
    let capabilities = capabilities();
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(capabilities.application_capture);
    assert!(capabilities.separate_cursor);
    assert!(!capabilities.portal_selection);
}
