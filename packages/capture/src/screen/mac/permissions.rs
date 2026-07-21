use crate::model::{CaptureCapabilities, PermissionSnapshot, PermissionState};

#[must_use]
pub fn capabilities() -> CaptureCapabilities {
    CaptureCapabilities {
        display_capture: true,
        window_capture: true,
        application_capture: true,
        portal_selection: false,
        embedded_cursor: true,
        separate_cursor: true,
        cursor_shapes: false,
        cursor_clicks: true,
        system_audio: true,
        selectable_system_output: false,
        hardware_h264: true,
        hardware_hevc: true,
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
        microphone: None,
        camera: None,
        accessibility: Some(PermissionState::NotApplicable),
    }
}
