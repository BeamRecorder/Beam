// ScreenCaptureKit also reports menu-bar items and other WindowServer surfaces.
// AppKit reserves layer 0 for normal application windows.
const NORMAL_WINDOW_LAYER: i32 = 0;

pub(crate) fn is_user_window_candidate(
    window_layer: i32,
    title: &str,
    application_name: &str,
    width: f64,
    height: f64,
) -> bool {
    window_layer == NORMAL_WINDOW_LAYER
        && !title.trim().is_empty()
        && !application_name.trim().is_empty()
        && width.is_finite()
        && width > 0.0
        && height.is_finite()
        && height > 0.0
}
