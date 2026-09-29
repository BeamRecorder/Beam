//! A native graph owns only sources needed by its absolute playback interval.
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct RenderPlan {
    pub start_ms: u64,
    pub end_ms: u64,
    pub duration_ms: u64,
    pub reload_margin_ms: u64,
    pub clips: HashSet<Uuid>,
    pub transitions: HashSet<Uuid>,
}

/// Defaults cover the measured six-second preroll of a hundred full-HD effects.
pub const LOOK_BEHIND_MS: u64 = 10_000;
pub const LOOK_AHEAD_MS: u64 = 30_000;
pub const RELOAD_MARGIN_MS: u64 = 8_000;
#[derive(Clone, Copy, Debug)]
pub struct PreviewWindow {
    pub behind_ms: u64,
    pub ahead_ms: u64,
    pub reload_margin_ms: u64,
}
impl Default for PreviewWindow {
    fn default() -> Self {
        Self {
            behind_ms: LOOK_BEHIND_MS,
            ahead_ms: LOOK_AHEAD_MS,
            reload_margin_ms: RELOAD_MARGIN_MS,
        }
    }
}
