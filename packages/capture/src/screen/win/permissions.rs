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
        system_audio: true,
        selectable_system_output: true,
        microphone: cfg!(feature = "microphone"),
        selectable_microphone: cfg!(feature = "microphone"),
        camera: cfg!(feature = "camera"),
        selectable_camera: cfg!(feature = "camera"),
        hardware_h264: true,
        hardware_hevc: true,
    }
}

#[must_use]
pub fn permissions() -> PermissionSnapshot {
    PermissionSnapshot {
        screen: Some(PermissionState::Granted),
        microphone: Some(PermissionState::Unknown),
        camera: Some(PermissionState::Unknown),
        accessibility: Some(PermissionState::NotApplicable),
    }
}
