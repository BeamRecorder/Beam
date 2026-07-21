use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCapabilities {
    pub display_capture: bool,
    pub window_capture: bool,
    pub application_capture: bool,
    pub portal_selection: bool,
    pub embedded_cursor: bool,
    pub separate_cursor: bool,
    pub cursor_shapes: bool,
    pub cursor_clicks: bool,
    pub hardware_h264: bool,
    pub hardware_hevc: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionState {
    Granted,
    Denied,
    PromptRequired,
    NotApplicable,
    Unknown,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSnapshot {
    pub screen: Option<PermissionState>,
    pub accessibility: Option<PermissionState>,
}
