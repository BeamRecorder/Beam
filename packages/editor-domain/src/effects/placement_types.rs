//! Absolute canvas placement, applied by GES after source-space pixel effects.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FramePlacement {
    pub width: i32,
    pub height: i32,
    pub x: i32,
    pub y: i32,
}
