use serde::{Deserialize, Serialize};

pub use beam_media_manifest::{PermissionSnapshot, PermissionState};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct CaptureCapabilities {
    pub display_capture: bool,
    pub window_capture: bool,
    pub application_capture: bool,
    pub portal_selection: bool,
    pub embedded_cursor: bool,
    pub separate_cursor: bool,
    pub cursor_shapes: bool,
    pub cursor_clicks: bool,
    pub input_shortcuts: bool,
    pub hardware_h264: bool,
    pub hardware_hevc: bool,
    pub hardware_av1: bool,
    pub hardware_vp9: bool,
}
