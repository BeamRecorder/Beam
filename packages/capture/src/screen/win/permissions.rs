use crate::model::{CaptureCapabilities, PermissionSnapshot, PermissionState};

use super::compatibility::supports_cursor_exclusion;

#[must_use]
pub fn capabilities() -> CaptureCapabilities {
    let separate_cursor = supports_cursor_exclusion();
    CaptureCapabilities {
        display_capture: true,
        window_capture: true,
        application_capture: false,
        portal_selection: false,
        embedded_cursor: true,
        separate_cursor,
        cursor_shapes: separate_cursor,
        cursor_clicks: separate_cursor,
        input_shortcuts: separate_cursor,
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
    }
}
