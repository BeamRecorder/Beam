use super::{DesktopCapabilities, DesktopOptions};
#[allow(dead_code)]
#[path = "../../../src/desktop/appearance/win.rs"]
mod implementation;

#[test]
fn unused_windows_appearance_does_not_exclude_capture_windows() {
    assert!(
        implementation::Appearance::default()
            .excluded_window_handles()
            .is_empty()
    );
}

#[test]
fn restoring_unused_windows_appearance_is_repeatable_without_changing_explorer() {
    let mut appearance = implementation::Appearance::default();
    appearance.restore().unwrap();
    appearance.restore().unwrap();
}

#[test]
fn windows_capabilities_describe_visibility_changes_instead_of_capture_only_exclusions() {
    assert!(!implementation::capabilities().unwrap().capture_only);
}
