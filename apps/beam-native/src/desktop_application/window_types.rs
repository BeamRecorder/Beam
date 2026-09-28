//! Typed native window inspection responses.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WindowCapabilities {
    pub backend: &'static str,
    pub absolute_position: bool,
    pub window_level: bool,
    pub mouse_passthrough: bool,
    pub input_regions: bool,
    pub transparent_compositing: bool,
    pub native_shadow: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WindowInfo {
    pub window: String,
    pub title: String,
    pub width: f64,
    pub height: f64,
    pub visible: Option<bool>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub decorations: bool,
    pub transparent: bool,
    pub backdrop: bool,
    pub backdrop_available: bool,
    pub scale_factor: f64,
    pub ui_zoom_factor: f32,
    pub capabilities: WindowCapabilities,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MonitorInfo {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub primary: bool,
}
#[derive(Serialize)]
pub(super) struct ElementBounds {
    pub width: f32,
    pub height: f32,
}

/// One serialized desktop-selection session; thumbnails release the lock while capturing.
#[derive(Default)]
pub(super) struct PickerState {
    pub choices: Vec<super::types::WindowChoice>,
    pub previous_stack: Vec<String>,
    pub open: bool,
    pub generation: u64,
}
