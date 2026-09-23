mod appkit;
mod keyboard;
mod recording;

pub(crate) use appkit::MacCursorShapeSource;
pub use keyboard::{input_access_granted, request_input_access};
pub(crate) use keyboard::{shortcut_key_pressed, shortcut_modifier_pressed};
pub use recording::*;

#[path = "../../../test/cursor/mac/mod.rs"]
mod platform_checks;

static SYSTEM_SHAPE: std::sync::OnceLock<MacCursorShapeSource> = std::sync::OnceLock::new();
pub(crate) fn system_shape_source() -> MacCursorShapeSource {
    SYSTEM_SHAPE
        .get_or_init(MacCursorShapeSource::default)
        .clone()
}
/// Call on the host's main thread while cursor shape capture is active.
pub fn refresh_system_cursor() -> bool {
    system_shape_source().refresh_on_main_thread()
}
