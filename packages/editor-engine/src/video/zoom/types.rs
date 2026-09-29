//! Camera data stored in source time, preserving zooms through trims and splits.
pub use beam_screen::cursor::{CursorInteractionType, CursorTelemetryPoint as CursorPoint};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Zoom {
    pub start_ms: u64,
    pub end_ms: u64,
    pub cx: f64,
    pub cy: f64,
    pub scale: f64,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}
impl Default for Camera {
    fn default() -> Self {
        Self {
            x: 0.5,
            y: 0.5,
            scale: 1.,
        }
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct Velocity {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Interval {
    pub start_ms: u64,
    pub end_ms: u64,
}
#[derive(Default)]
pub struct Follow {
    pub initialized: bool,
    pub full: bool,
    pub last_ms: f64,
    pub lock_until_ms: f64,
    pub target: Camera,
    pub frozen: Camera,
}
#[derive(Clone, Copy, Debug)]
pub struct CameraKey {
    pub time_ms: u64,
    pub camera: Camera,
}
