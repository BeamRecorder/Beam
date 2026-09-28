#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::Selection;

#[test]
fn xwayland_requires_portal_discovery_for_native_wayland_clients() {
    assert!(super::desktop_session(Some(":1"), None, Some("x11")));
    assert!(super::desktop_session(Some(":1"), Some(""), None));
    assert!(!super::desktop_session(None, None, None));
    assert!(!super::desktop_session(Some(""), None, Some("x11")));
    assert!(!super::desktop_session(
        Some(":0"),
        Some("wayland-0"),
        Some("wayland")
    ));
    assert!(!super::desktop_session(Some(":0"), None, Some("WAYLAND")));
    assert!(!super::desktop_session(Some(":0"), Some("wayland-0"), None));
}
use x11rb::{
    connection::Connection,
    protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, PropMode, WindowClass},
    rust_connection::RustConnection,
    wrapper::ConnectionExt as _,
};

pub(super) struct Fixture {
    pub connection: RustConnection,
    pub window: u32,
}
impl Fixture {
    pub(super) fn new(color: u32) -> Self {
        assert_eq!(std::env::var("ARGUI_HIDDEN_DISPLAY").as_deref(), Ok("1"));
        let (connection, screen) = super::connect().unwrap();
        let root = &connection.setup().roots[screen];
        let window = connection.generate_id().unwrap();
        connection
            .create_window(
                root.root_depth,
                window,
                root.root,
                50,
                60,
                160,
                120,
                0,
                WindowClass::INPUT_OUTPUT,
                root.root_visual,
                &CreateWindowAux::new().background_pixel(color),
            )
            .unwrap()
            .check()
            .unwrap();
        connection
            .change_property8(
                PropMode::REPLACE,
                window,
                AtomEnum::WM_NAME,
                AtomEnum::STRING,
                b"X11 capture fixture",
            )
            .unwrap();
        connection
            .change_property32(
                PropMode::REPLACE,
                window,
                super::atom(&connection, b"_NET_WM_PID").unwrap(),
                AtomEnum::CARDINAL,
                &[u32::MAX],
            )
            .unwrap();
        connection.map_window(window).unwrap().check().unwrap();
        connection.flush().unwrap();
        Self { connection, window }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.connection.destroy_window(self.window);
        let _ = self.connection.flush();
    }
}

#[test]
fn resolved_sources_keep_their_native_handles() {
    assert_eq!(
        Selection::parse("x11:window:42").unwrap(),
        Selection::Window(42)
    );
    assert_eq!(
        Selection::parse("x11:monitor:21:7").unwrap(),
        Selection::Monitor { root: 21, name: 7 }
    );
    assert_eq!(
        Selection::parse("x11:monitor:21:0").unwrap(),
        Selection::Monitor { root: 21, name: 0 }
    );
}
#[test]
fn malformed_and_zero_handles_are_rejected() {
    for id in [
        "portal:window",
        "x11:window:0",
        "x11:window:42:3",
        "x11:monitor:0:7",
        "x11:window:-1",
        "x11:window:4294967296",
        "x11:monitor:1:x",
    ] {
        assert!(Selection::parse(id).is_err(), "{id}");
    }
}
