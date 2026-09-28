//! Direct X11 sources, independent of the Wayland screen-cast Portal.

mod capture;
mod catalog;
mod pixels;
mod reader;

pub(crate) use capture::X11Recording;
pub use catalog::{activate_window, discover_sources, raise_window, window_bounds, window_stack};
use x11rb::{connection::Connection, rust_connection::RustConnection};

use crate::CaptureError;

pub use crate::desktop::DesktopBounds;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Selection {
    Window(u32),
    Monitor { root: u32, name: u32 },
}

impl Selection {
    /// Decodes a direct X11 source identity, rejecting zero or extra components.
    pub(crate) fn parse(id: &str) -> Result<Self, CaptureError> {
        let parts = id.split(':').collect::<Vec<_>>();
        let number = |value: &str| value.parse::<u32>().map_err(backend_error);
        let selection = match parts.as_slice() {
            ["x11", "window", id] => Self::Window(number(id)?),
            ["x11", "monitor", root, name] => Self::Monitor {
                root: number(root)?,
                name: number(name)?,
            },
            _ => {
                return Err(CaptureError::InvalidConfiguration(
                    "invalid X11 source ID".into(),
                ));
            }
        };
        if matches!(selection, Self::Window(0) | Self::Monitor { root: 0, .. }) {
            return Err(CaptureError::InvalidConfiguration(
                "X11 source handle must be nonzero".into(),
            ));
        }
        Ok(selection)
    }
}

/// Whether a direct X11 display is available to this process.
#[must_use]
pub fn available() -> bool {
    std::env::var("DISPLAY").is_ok_and(|display| !display.is_empty())
}

/// Whether X11 can enumerate the whole desktop, rather than an Xwayland subset.
pub(crate) fn desktop_available() -> bool {
    desktop_session(
        std::env::var("DISPLAY").ok().as_deref(),
        std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
    )
}

fn desktop_session(display: Option<&str>, wayland: Option<&str>, session: Option<&str>) -> bool {
    display.is_some_and(|value| !value.is_empty())
        && !wayland.is_some_and(|value| !value.is_empty())
        && !session.is_some_and(|value| value.eq_ignore_ascii_case("wayland"))
}

pub(crate) fn connect() -> Result<(RustConnection, usize), CaptureError> {
    x11rb::connect(None).map_err(backend_error)
}

pub(crate) fn atom(connection: &RustConnection, name: &[u8]) -> Result<u32, CaptureError> {
    use x11rb::protocol::xproto::ConnectionExt;
    Ok(connection
        .intern_atom(false, name)
        .map_err(backend_error)?
        .reply()
        .map_err(backend_error)?
        .atom)
}

pub(crate) fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("X11: {error}"))
}

pub(crate) fn root(connection: &RustConnection, screen: usize) -> u32 {
    connection.setup().roots[screen].root
}

#[path = "../../../../test/screen/linux/x11/mod.rs"]
mod checks;
