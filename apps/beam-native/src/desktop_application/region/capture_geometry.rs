//! Capture-pixel geometry, separate from native window placement and DPI.

use super::{
    geometry::{pixel_point, pixel_rect, selection},
    types::{CaptureScale, RegionState},
};
use argui_core::{Point, Rect, Size};

impl RegionState {
    /// Maps the current UI viewport to the granted raster without resampling it.
    pub(super) fn capture_scale(&self) -> CaptureScale {
        match &self.pixels {
            Some(pixels) if self.viewport.width > 0.0 && self.viewport.height > 0.0 => {
                CaptureScale {
                    x: f64::from(pixels.width) / f64::from(self.viewport.width),
                    y: f64::from(pixels.height) / f64::from(self.viewport.height),
                }
            }
            _ => CaptureScale {
                x: self.pixel_scale,
                y: self.pixel_scale,
            },
        }
    }

    /// Snaps a bounded pointer to the source raster's grid in each axis.
    pub(super) fn capture_point(&self, point: Point) -> Point {
        let scale = self.capture_scale();
        if scale.x == scale.y {
            return pixel_point(point, self.viewport, scale.x);
        }
        Point::new(
            ((f64::from(point.x.clamp(0.0, self.viewport.width)) * scale.x).round() / scale.x)
                as f32,
            ((f64::from(point.y.clamp(0.0, self.viewport.height)) * scale.y).round() / scale.y)
                as f32,
        )
    }

    /// Snaps both crop edges to the same grid consumed by normalized recording.
    pub(super) fn capture_rect(&self, rect: Rect) -> Rect {
        let scale = self.capture_scale();
        if scale.x == scale.y {
            return pixel_rect(rect, self.viewport, scale.x);
        }
        selection(
            self.capture_point(rect.origin),
            self.capture_point(Point::new(
                rect.origin.x + rect.size.width,
                rect.origin.y + rect.size.height,
            )),
            self.viewport,
        )
    }

    /// Reports the recorded dimensions rather than XWayland's desktop dimensions.
    pub(super) fn capture_dimensions(&self, size: Size) -> (u32, u32) {
        let scale = self.capture_scale();
        (
            (f64::from(size.width) * scale.x).round() as u32,
            (f64::from(size.height) * scale.y).round() as u32,
        )
    }
}
