use super::{DesktopCapabilities, DesktopOptions};
#[path = "linux/icons.rs"]
mod icons;
#[allow(dead_code)]
#[path = "../../../src/desktop/appearance/linux.rs"]
mod implementation;

#[test]
fn unused_linux_appearance_restores_without_connecting_to_x11() {
    let mut appearance = implementation::Appearance::default();
    assert!(appearance.excluded_window_handles().is_empty());
    appearance.restore().unwrap();
    appearance.restore().unwrap();
}

#[test]
fn empty_linux_appearance_request_has_no_screen_or_settings_side_effects() {
    let mut appearance = implementation::Appearance::default();
    appearance.apply(DesktopOptions::default()).unwrap();
    assert!(appearance.excluded_window_handles().is_empty());
    appearance.restore().unwrap();
}

#[test]
fn linux_capabilities_never_claim_capture_only_hiding() {
    assert!(!implementation::capabilities().unwrap().capture_only);
}

#[test]
#[ignore = "requires Beam's private X11 display"]
fn panel_hiding_restores_only_the_same_window_and_preserves_wallpaper() {
    assert_eq!(std::env::var("ARGUI_HIDDEN_DISPLAY").as_deref(), Ok("1"));
    use x11rb::{
        connection::Connection,
        protocol::xproto::{
            AtomEnum, ConnectionExt, CreateWindowAux, MapState, PropMode, WindowClass,
        },
        wrapper::ConnectionExt as _,
    };
    let (connection, screen) = x11rb::connect(None).unwrap();
    let root = connection.setup().roots[screen].root;
    let atom = |name: &[u8]| {
        connection
            .intern_atom(false, name)
            .unwrap()
            .reply()
            .unwrap()
            .atom
    };
    let kind = atom(b"_NET_WM_WINDOW_TYPE");
    let dock = atom(b"_NET_WM_WINDOW_TYPE_DOCK");
    let clients = atom(b"_NET_CLIENT_LIST");
    let windows = [
        connection.generate_id().unwrap(),
        connection.generate_id().unwrap(),
    ];
    for window in windows {
        connection
            .create_window(
                x11rb::COPY_DEPTH_FROM_PARENT,
                window,
                root,
                0,
                0,
                64,
                64,
                0,
                WindowClass::INPUT_OUTPUT,
                x11rb::COPY_FROM_PARENT,
                &CreateWindowAux::default(),
            )
            .unwrap()
            .check()
            .unwrap();
        connection
            .change_property8(
                PropMode::REPLACE,
                window,
                AtomEnum::WM_CLASS,
                AtomEnum::STRING,
                b"fixture\0BeamTest\0",
            )
            .unwrap()
            .check()
            .unwrap();
        connection.map_window(window).unwrap().check().unwrap();
    }
    connection
        .change_property32(PropMode::REPLACE, windows[0], kind, AtomEnum::ATOM, &[dock])
        .unwrap()
        .check()
        .unwrap();
    connection
        .change_property32(PropMode::REPLACE, root, clients, AtomEnum::WINDOW, &windows)
        .unwrap()
        .check()
        .unwrap();
    let visible = |window| {
        connection
            .get_window_attributes(window)
            .unwrap()
            .reply()
            .unwrap()
            .map_state
            == MapState::VIEWABLE
    };
    let mut appearance = implementation::Appearance::default();
    appearance
        .apply(DesktopOptions {
            hide_taskbar: true,
            hide_desktop_icons: false,
        })
        .unwrap();
    assert!(!visible(windows[0]));
    assert!(visible(windows[1]));
    appearance.restore().unwrap();
    assert!(visible(windows[0]));
    appearance
        .apply(DesktopOptions {
            hide_taskbar: true,
            hide_desktop_icons: false,
        })
        .unwrap();
    // Replacing a panel's identity must not map an unrelated window on restore.
    connection
        .change_property8(
            PropMode::REPLACE,
            windows[0],
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            b"replacement\0Other\0",
        )
        .unwrap()
        .check()
        .unwrap();
    appearance.restore().unwrap();
    assert!(!visible(windows[0]));
    for window in windows {
        connection.destroy_window(window).unwrap().check().unwrap();
    }
    connection
        .delete_property(root, clients)
        .unwrap()
        .check()
        .unwrap();
}
