mod connection;
mod desktop;
#[cfg(test)]
mod native_tests;
mod pixels;
mod reader;
pub(super) mod recording;
#[cfg(test)]
mod tests;

pub(crate) use desktop::{catalog, preview_window, source_bounds};
pub(crate) use reader::Reader;
pub(crate) use recording::X11Recording;

/// XWayland cannot supply a complete Wayland desktop. Never select this backend there.
pub(crate) fn session_supported() -> bool {
    eligible_session(
        &std::env::var("XDG_SESSION_TYPE").unwrap_or_default(),
        &std::env::var("WAYLAND_DISPLAY").unwrap_or_default(),
        &std::env::var("DISPLAY").unwrap_or_default(),
    )
}
fn eligible_session(session: &str, wayland: &str, display: &str) -> bool {
    (session.is_empty() || session.eq_ignore_ascii_case("x11"))
        && wayland.is_empty()
        && (display.starts_with(':') || display.starts_with("unix:"))
}
