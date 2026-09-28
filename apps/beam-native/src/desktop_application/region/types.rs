//! State and typed messages for the native monitor spotlight.

use argui_core::{Color, Point, PointerId, Rect, Size};
use argui_runtime::NativeMonitorInfo;
use serde::{Deserialize, Serialize};

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
}
#[derive(Clone, Copy)]
pub(super) struct Drag {
    pub id: PointerId,
    pub origin: Point,
    pub previous: Option<Rect>,
    pub mode: DragMode,
}

pub(crate) struct RegionState {
    pub created: bool,
    pub open: bool,
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
}
impl Default for RegionState {
    /// Starts with no native window or crop; geometry is filled before opening.
    fn default() -> Self {
        Self {
            created: false,
            open: false,
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
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegionSnapshot {
    pub revision: u64,
    pub width: u32,
    pub height: u32,
    pub preset: String,
    pub selected: bool,
    pub can_record: bool,
    pub controls_x: i32,
    pub controls_y: i32,
    pub actions_x: i32,
    pub actions_y: i32,
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
