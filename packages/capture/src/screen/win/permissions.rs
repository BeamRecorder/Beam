use crate::model::{CaptureCapabilities, PermissionSnapshot, PermissionState};

#[must_use]
pub fn capabilities() -> CaptureCapabilities {
    CaptureCapabilities {
        display_capture: true,
        window_capture: true,
        application_capture: false,
        portal_selection: false,
        embedded_cursor: true,
        separate_cursor: true,
        cursor_shapes: true,
        cursor_clicks: true,
        hardware_h264: true,
        hardware_hevc: true,
        ..CaptureCapabilities::default()
    }
}

#[must_use]
pub fn permissions() -> PermissionSnapshot {
    PermissionSnapshot {
        screen: Some(PermissionState::Granted),
        accessibility: Some(PermissionState::NotApplicable),
        ..PermissionSnapshot::default()
    }
}
