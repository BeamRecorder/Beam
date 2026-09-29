//! State and typed messages for the native monitor spotlight.

use argui_core::{Color, Point, PointerId, Rect, Size};
use argui_paint::ImageAsset;
use argui_runtime::NativeMonitorInfo;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Corner {
    Nw,
    Ne,
    Sw,
    Se,
}
#[derive(Clone, Copy)]
pub(super) enum DragMode {
    Draw,
    Move,
    Resize(Corner),
    ResizeEdge(Edge),
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Edge {
    North,
    East,
    South,
    West,
}
#[derive(Clone, Copy)]
pub(super) struct Drag {
    pub id: PointerId,
    pub origin: Point,
    pub previous: Option<Rect>,
    pub mode: DragMode,
    pub grip_offset: Point,
}

/// Actual native screen pixels retained only for the current selection session.
pub(super) struct ScreenPixels {
    pub width: u32,
    pub height: u32,
    pub rgba: Arc<[u8]>,
}

/// Actual granted source, its overlay monitor and its untouched capture raster.
pub(super) struct MonitorCapture {
    pub source_id: String,
    pub monitor: NativeMonitorInfo,
    pub pixels: ScreenPixels,
}

/// Independent capture-pixel scales for the two axes of the UI viewport.
#[derive(Clone, Copy)]
pub(super) struct CaptureScale {
    pub x: f64,
    pub y: f64,
}

/// One bounded pixel sample; its center marks a physical capture boundary.
pub(super) struct Magnifier {
    pub at: Point,
    pub image: ImageAsset,
}

pub(crate) struct RegionState {
    pub created: bool,
    pub open: bool,
    pub passive: bool,
    pub monitor: Option<NativeMonitorInfo>,
    pub viewport: Size,
    pub pixel_scale: f64,
    pub input_holes: bool,
    pub crop: Option<Rect>,
    pub(super) drag: Option<Drag>,
    pub preset: String,
    pub revision: u64,
    pub border: Color,
    pub accent: Color,
    pub surface: Color,
    pub foreground: Color,
    pub dim: Color,
    pub instruction: String,
    pub source_id: Option<String>,
    pub(super) pixels: Option<ScreenPixels>,
    pub(super) magnifier: Option<Magnifier>,
}
impl Default for RegionState {
    /// Starts with no native window or crop; geometry is filled before opening.
    fn default() -> Self {
        Self {
            created: false,
            open: false,
            passive: false,
            monitor: None,
            viewport: Size::new(0.0, 0.0),
            pixel_scale: 1.0,
            input_holes: false,
            crop: None,
            drag: None,
            preset: "free".into(),
            revision: 0,
            border: Color::srgba(0.26, 0.26, 0.26, 1.0),
            accent: Color::srgba(0.918, 0.345, 0.047, 1.0),
            surface: Color::srgba(0.169, 0.169, 0.18, 1.0),
            foreground: Color::srgba(0.961, 0.961, 0.969, 1.0),
            dim: Color::srgba(0.0, 0.0, 0.0, 0.60),
            instruction: "Select an area to record".into(),
            source_id: None,
            pixels: None,
            magnifier: None,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegionSnapshot {
    pub revision: u64,
    pub open: bool,
    pub dragging: bool,
    pub width: u32,
    pub height: u32,
    pub preset: String,
    pub selected: bool,
    pub can_record: bool,
    pub controls_x: i32,
    pub controls_y: i32,
    pub controls_width: f64,
    pub controls_height: f64,
    pub actions_x: i32,
    pub actions_y: i32,
    pub actions_width: f64,
    pub actions_height: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PresetRequest {
    pub value: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ColorsRequest {
    pub border: String,
    pub accent: String,
    pub surface: String,
    pub foreground: String,
    pub dim: String,
    pub instruction: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PresentRequest {
    pub revision: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum RegionMessage {
    Refresh,
    Present { revision: u64 },
    Confirm,
    Cancel,
    Preset { value: String },
}
