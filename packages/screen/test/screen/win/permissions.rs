#![cfg(test)]

use super::{capabilities, permissions};
use crate::model::PermissionState;

#[test]
fn windows_capabilities_and_permissions_share_the_native_contract() {
    let capabilities = capabilities();
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(!capabilities.application_capture);
    assert!(!capabilities.portal_selection);
    assert_eq!(permissions().screen, Some(PermissionState::Granted));
}
