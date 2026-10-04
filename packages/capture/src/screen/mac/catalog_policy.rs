// ScreenCaptureKit also reports menu-bar items and other WindowServer surfaces.
// AppKit reserves layer 0 for normal application windows.
const NORMAL_WINDOW_LAYER: i32 = 0;

// These processes own status indicators, notifications, desktop and capture UI,
// not document windows. Bundle identity remains stable when macOS is localized
// and rejects auxiliary surfaces even if Apple reports them at the normal layer.
const SYSTEM_UI_BUNDLES: &[&str] = &[
    "com.apple.controlcenter",
    "com.apple.systemuiserver",
    "com.apple.dock",
    "com.apple.notificationcenterui",
    "com.apple.screencaptureui",
    "com.apple.WindowManager",
];

pub(crate) fn is_user_window_candidate(
    window_layer: i32,
    title: &str,
    application_name: &str,
    bundle_identifier: &str,
    width: f64,
    height: f64,
) -> bool {
    window_layer == NORMAL_WINDOW_LAYER
        && !title.trim().is_empty()
        && !application_name.trim().is_empty()
        && !bundle_identifier.trim().is_empty()
        && !SYSTEM_UI_BUNDLES.contains(&bundle_identifier)
        && width.is_finite()
        && width > 0.0
        && height.is_finite()
        && height > 0.0
}
