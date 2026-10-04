use super::super::pipewire::{CursorMetadata, NegotiatedFormat, VideoTransform};
use crate::cursor::{CursorKind, Hotspot};
use serde::Deserialize;
use std::time::Instant;

#[derive(Clone, Debug, Deserialize)]
pub(super) struct HyprlandMonitor {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    #[serde(default)]
    pub transform: u32,
}

impl HyprlandMonitor {
    pub(super) fn valid(&self) -> bool {
        !self.name.is_empty()
            && self.width > 0
            && self.height > 0
            && self.scale.is_finite()
            && self.scale > 0.0
            && self.transform <= 7
    }

    fn upright_size(&self) -> (u32, u32) {
        if self.transform % 2 == 1 {
            (self.height, self.width)
        } else {
            (self.width, self.height)
        }
    }

    pub(super) fn matches_size(&self, size: (i32, i32)) -> bool {
        let Ok(width) = u32::try_from(size.0) else {
            return false;
        };
        let Ok(height) = u32::try_from(size.1) else {
            return false;
        };
        (width, height) == self.upright_size() || (width, height) == (self.width, self.height)
    }
}

pub(super) struct CursorSnapshot {
    pub point: (i32, i32),
    pub monitor: HyprlandMonitor,
    pub received: Instant,
}

impl CursorSnapshot {
    pub(super) fn metadata(
        &self,
        format: NegotiatedFormat,
        transform: VideoTransform,
    ) -> Option<CursorMetadata> {
        if !self.monitor.valid() || format.width == 0 || format.height == 0 {
            return None;
        }
        let (upright_width, upright_height) = self.monitor.upright_size();
        let (output_width, output_height) = match transform {
            VideoTransform::Rotated90
            | VideoTransform::Rotated270
            | VideoTransform::Flipped90
            | VideoTransform::Flipped270 => (format.height, format.width),
            _ => (format.width, format.height),
        };
        let x = ((f64::from(self.point.0) - f64::from(self.monitor.x))
            * self.monitor.scale
            * f64::from(output_width)
            / f64::from(upright_width))
        .round() as i32;
        let y = ((f64::from(self.point.1) - f64::from(self.monitor.y))
            * self.monitor.scale
            * f64::from(output_height)
            / f64::from(upright_height))
        .round() as i32;
        let (width, height) = (i64::from(format.width), i64::from(format.height));
        let (x, y) = (i64::from(x), i64::from(y));
        // SPA applies this transform later; convert compositor coordinates back
        // to the raw buffer so the existing crop/rotation mapping runs once.
        let (x, y) = match transform {
            VideoTransform::None => (x, y),
            VideoTransform::Rotated90 => (width - 1 - y, x),
            VideoTransform::Rotated180 => (width - 1 - x, height - 1 - y),
            VideoTransform::Rotated270 => (y, height - 1 - x),
            VideoTransform::Flipped => (width - 1 - x, y),
            VideoTransform::Flipped90 => (y, x),
            VideoTransform::Flipped180 => (x, height - 1 - y),
            VideoTransform::Flipped270 => (width - 1 - y, height - 1 - x),
        };
        Some(CursorMetadata {
            id: 1,
            shape_id: Some(1),
            x: i32::try_from(x).ok()?,
            y: i32::try_from(y).ok()?,
            hotspot: Some(Hotspot { x: 0, y: 0 }),
            cursor_kind: Some(CursorKind::Default),
        })
    }
}
