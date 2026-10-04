use super::*;

fn separate() -> CursorSelection {
    CursorSelection::Separate {
        capture_clicks: false,
        capture_shape: true,
        capture_shortcuts: false,
    }
}

#[test]
fn metadata_is_preferred_even_when_hyprland_ipc_is_available() {
    let modes = CursorMode::Metadata | CursorMode::Hidden;
    assert_eq!(
        select_cursor_mode(separate(), &modes, true),
        CursorMode::Metadata
    );
    assert_eq!(
        select_cursor_mode(separate(), &modes, false),
        CursorMode::Metadata
    );
}

#[test]
fn hidden_capture_is_only_selected_for_hyprland_without_metadata() {
    let modes = CursorMode::Hidden | CursorMode::Embedded;
    assert_eq!(
        select_cursor_mode(separate(), &modes, true),
        CursorMode::Hidden
    );
    assert_eq!(
        select_cursor_mode(separate(), &modes, false),
        CursorMode::Metadata
    );
    assert_eq!(
        select_cursor_mode(separate(), &CursorMode::Embedded.into(), true),
        CursorMode::Metadata
    );
}

#[test]
fn disabled_and_embedded_capture_never_enable_separate_cursor_sampling() {
    let modes = CursorMode::Hidden | CursorMode::Embedded;
    for hyprland in [false, true] {
        assert_eq!(
            select_cursor_mode(CursorSelection::Disabled, &modes, hyprland),
            CursorMode::Hidden
        );
        assert_eq!(
            select_cursor_mode(CursorSelection::Embedded, &modes, hyprland),
            CursorMode::Embedded
        );
    }
}
