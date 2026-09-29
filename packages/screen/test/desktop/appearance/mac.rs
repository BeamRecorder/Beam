use super::{DesktopCapabilities, DesktopOptions};
#[allow(dead_code)]
#[path = "../../../src/desktop/appearance/mac.rs"]
mod implementation;

#[test]
fn macos_hiding_is_advertised_as_capture_exclusion() {
    let supported = implementation::capabilities().unwrap();
    assert!(supported.taskbar && supported.desktop_icons && supported.capture_only);
}

#[test]
fn unused_macos_appearance_excludes_no_windows() {
    assert!(
        implementation::Appearance::default()
            .excluded_window_handles()
            .is_empty()
    );
}

#[test]
fn restoring_unused_macos_appearance_is_repeatable_without_screen_permission() {
    let mut appearance = implementation::Appearance::default();
    appearance.restore().unwrap();
    appearance.restore().unwrap();
    assert!(appearance.excluded_window_handles().is_empty());
}
