use super::super::appearance::{DesktopAppearance, DesktopCapabilities, DesktopOptions};

#[cfg(target_os = "linux")]
#[path = "appearance/linux.rs"]
mod linux;
#[cfg(target_os = "macos")]
#[path = "appearance/mac.rs"]
mod mac;
#[path = "appearance/types.rs"]
mod types;
#[cfg(windows)]
#[path = "appearance/win.rs"]
mod win;

#[test]
fn no_hiding_options_need_no_desktop_permission_or_mutation() {
    let mut appearance = DesktopAppearance::begin(DesktopOptions::default()).unwrap();
    assert!(appearance.excluded_window_handles().is_empty());
    appearance.restore().unwrap();
    appearance.restore().unwrap();
}

#[test]
fn dropping_an_unused_desktop_guard_is_safe() {
    let appearance = DesktopAppearance::default();
    assert!(appearance.excluded_window_handles().is_empty());
    drop(appearance);
}

#[test]
fn unsupported_desktop_options_are_rejected_before_mutation() {
    let supported = super::super::appearance::capabilities().unwrap();
    for options in [
        DesktopOptions {
            hide_taskbar: !supported.taskbar,
            hide_desktop_icons: false,
        },
        DesktopOptions {
            hide_taskbar: false,
            hide_desktop_icons: !supported.desktop_icons,
        },
    ] {
        if options.hide_taskbar || options.hide_desktop_icons {
            assert!(matches!(
                DesktopAppearance::begin(options),
                Err(crate::CaptureError::InvalidConfiguration(_))
            ));
        }
    }
}
