//! Compositor-space source metadata, independent of the negotiated pixel raster.

use super::OwnedVideoFrame;

/// A portal monitor's desktop position and displayed size, when provided.
///
/// These coordinates belong to the compositor. They are not physical pixel
/// coordinates and must not be used as the dimensions of a captured frame.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScreenSourceGeometry {
    pub position: Option<(i32, i32)>,
    pub size: Option<(u32, u32)>,
}

/// One native raster together with the source geometry granted by its backend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturedScreenFrame {
    pub frame: OwnedVideoFrame,
    pub geometry: Option<ScreenSourceGeometry>,
}
