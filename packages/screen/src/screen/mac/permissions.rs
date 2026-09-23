use crate::model::{CaptureCapabilities, PermissionSnapshot, PermissionState};

#[path = "../../../test/screen/mac/permissions.rs"]
mod permission_checks;

#[must_use]
pub fn capabilities() -> CaptureCapabilities {
    CaptureCapabilities {
        display_capture: true,
        window_capture: true,
        application_capture: true,
        portal_selection: false,
        embedded_cursor: true,
        separate_cursor: true,
        cursor_shapes: true,
        cursor_clicks: true,
        input_shortcuts: true,
        hardware_h264: false,
        hardware_hevc: false,
        ..CaptureCapabilities::default()
    }
}

#[must_use]
pub fn permissions() -> PermissionSnapshot {
    PermissionSnapshot {
        screen: Some(
            if screencapturekit::shareable_content::SCShareableContent::get().is_ok() {
                PermissionState::Granted
            } else {
                PermissionState::PromptRequired
            },
        ),
        accessibility: Some(PermissionState::NotApplicable),
    }
}
