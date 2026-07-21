use crate::model::{CaptureCapabilities, PermissionSnapshot, PermissionState};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinuxDisplayServer {
    Wayland,
    X11,
    Unknown,
}
#[must_use]
pub fn display_server() -> LinuxDisplayServer {
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        LinuxDisplayServer::Wayland
    } else if std::env::var_os("DISPLAY").is_some() {
        LinuxDisplayServer::X11
    } else {
        LinuxDisplayServer::Unknown
    }
}
#[must_use]
pub fn capabilities() -> CaptureCapabilities {
    let portal = matches!(display_server(), LinuxDisplayServer::Wayland);
    CaptureCapabilities {
        display_capture: true,
        window_capture: true,
        portal_selection: portal,
        embedded_cursor: true,
        separate_cursor: !portal,
        cursor_shapes: !portal,
        cursor_clicks: !portal,
        // PipeWire/portal audio is not wired into a recording backend yet. Do
        // not advertise a capture capability that would produce an empty track.
        system_audio: false,
        selectable_system_output: false,
        microphone: cfg!(feature = "microphone"),
        selectable_microphone: cfg!(feature = "microphone"),
        ..CaptureCapabilities::default()
    }
}
#[must_use]
pub fn permissions() -> PermissionSnapshot {
    PermissionSnapshot {
        screen: Some(if matches!(display_server(), LinuxDisplayServer::Wayland) {
            PermissionState::PromptRequired
        } else {
            PermissionState::Granted
        }),
        microphone: Some(PermissionState::Unknown),
        camera: None,
        accessibility: Some(PermissionState::NotApplicable),
    }
}
