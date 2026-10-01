use super::{
    CursorMetadata, FrameGeometry, NegotiatedFormat, VideoTransform, transform_cursor_point,
};
use crate::{cursor::Hotspot, screen::OwnedVideoFrame};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub(super) struct NativeCursorBitmap {
    pub width: u32,
    pub height: u32,
    pub hotspot: Hotspot,
    /// PipeWire's native premultiplied RGBA pixels, never persisted as Beam artwork.
    pub pixels: Arc<[u8]>,
}

pub(super) struct NativeCursorOverlay {
    enabled: bool,
    bitmap: Option<NativeCursorBitmap>,
    position: Option<CursorMetadata>,
    clean_frame: Option<OwnedVideoFrame>,
    target_fps: u32,
    last_frame_bucket: Option<u128>,
}
impl NativeCursorOverlay {
    pub(super) const fn new(enabled: bool, target_fps: u32) -> Self {
        Self {
            enabled,
            bitmap: None,
            position: None,
            clean_frame: None,
            target_fps,
            last_frame_bucket: None,
        }
    }
    pub(super) const fn enabled(&self) -> bool {
        self.enabled
    }
    pub(super) fn clear_frame(&mut self) {
        self.clean_frame = None;
        self.last_frame_bucket = None;
    }
    pub(super) fn frame_due_at(&self, session_ns: u64) -> bool {
        !self.enabled
            || self.last_frame_bucket
                != Some(u128::from(session_ns) * u128::from(self.target_fps) / 1_000_000_000)
    }
    pub(super) fn record_frame_at(&mut self, session_ns: u64) {
        self.last_frame_bucket =
            Some(u128::from(session_ns) * u128::from(self.target_fps) / 1_000_000_000);
    }
    pub(super) fn update(
        &mut self,
        metadata: Option<CursorMetadata>,
        bitmap: Option<NativeCursorBitmap>,
    ) {
        if !self.enabled {
            return;
        }
        let Some(metadata) = metadata.filter(|cursor| cursor.id != 0) else {
            return;
        };
        self.position = Some(metadata);
        if metadata.shape_id == Some(super::HIDDEN_CURSOR_SHAPE_ID) {
            self.bitmap = None;
        } else if metadata.shape_id.is_some() {
            self.bitmap = bitmap;
        }
    }
    pub(super) fn frame(
        &mut self,
        frame: OwnedVideoFrame,
        geometry: FrameGeometry,
        format: NegotiatedFormat,
    ) -> OwnedVideoFrame {
        if !self.enabled {
            return frame;
        }
        self.clean_frame = Some(frame.clone());
        self.paint(frame, geometry, format)
    }
    /// Cursor-only buffers repaint the clean image, preventing trails on a static desktop.
    pub(super) fn cursor_frame(
        &self,
        geometry: FrameGeometry,
        format: NegotiatedFormat,
    ) -> Option<OwnedVideoFrame> {
        self.clean_frame
            .as_ref()
            .map(|frame| self.paint(frame.clone(), geometry, format))
    }
    fn paint(
        &self,
        mut frame: OwnedVideoFrame,
        geometry: FrameGeometry,
        format: NegotiatedFormat,
    ) -> OwnedVideoFrame {
        let Some(bitmap) = &self.bitmap else {
            return frame;
        };
        let Some(cursor) = geometry.map_cursor(self.position, format) else {
            return frame;
        };
        let (width, height, hotspot, rgba) = bitmap.transformed(geometry.transform);
        let (scale_x, scale_y) = geometry.cursor_scale(format);
        let origin_x = f64::from(cursor.x) - f64::from(hotspot.x) * scale_x;
        let origin_y = f64::from(cursor.y) - f64::from(hotspot.y) * scale_y;
        let left = origin_x.floor().max(0.0).min(f64::from(frame.width)) as u32;
        let top = origin_y.floor().max(0.0).min(f64::from(frame.height)) as u32;
        let right = (origin_x + f64::from(width) * scale_x)
            .ceil()
            .max(0.0)
            .min(f64::from(frame.width)) as u32;
        let bottom = (origin_y + f64::from(height) * scale_y)
            .ceil()
            .max(0.0)
            .min(f64::from(frame.height)) as u32;
        if left >= right || top >= bottom {
            return frame;
        }
        let pixels = Arc::make_mut(&mut frame.pixels);
        for y in top..bottom {
            let source_y =
                (((f64::from(y) + 0.5 - origin_y) / scale_y).floor() as u32).min(height - 1);
            for x in left..right {
                let source_x =
                    (((f64::from(x) + 0.5 - origin_x) / scale_x).floor() as u32).min(width - 1);
                let offset = ((source_y * width + source_x) * 4) as usize;
                let source = &rgba[offset..offset + 4];
                let destination = y as usize * frame.stride + x as usize * 4;
                let pixel = &mut pixels[destination..destination + 4];
                let alpha = u16::from(source[3]);
                for (channel, native) in [source[2], source[1], source[0]].into_iter().enumerate() {
                    pixel[channel] = (u16::from(native)
                        + (u16::from(pixel[channel]) * (255 - alpha) + 127) / 255)
                        .min(255) as u8;
                }
                pixel[3] =
                    (alpha + (u16::from(pixel[3]) * (255 - alpha) + 127) / 255).min(255) as u8;
            }
        }
        frame
    }
}
impl NativeCursorBitmap {
    fn transformed(&self, transform: VideoTransform) -> (u32, u32, Hotspot, Arc<[u8]>) {
        if transform == VideoTransform::None {
            return (self.width, self.height, self.hotspot, self.pixels.clone());
        }
        let rotated = matches!(
            transform,
            VideoTransform::Rotated90
                | VideoTransform::Rotated270
                | VideoTransform::Flipped90
                | VideoTransform::Flipped270
        );
        let (width, height) = if rotated {
            (self.height, self.width)
        } else {
            (self.width, self.height)
        };
        let map = |x: u32, y: u32| {
            transform_cursor_point(
                i64::from(x),
                i64::from(y),
                self.width,
                self.height,
                transform,
            )
        };
        let (x, y) = map(self.hotspot.x, self.hotspot.y);
        let hotspot = Hotspot {
            x: x as u32,
            y: y as u32,
        };
        let mut pixels = vec![0; self.pixels.len()];
        for y in 0..self.height {
            for x in 0..self.width {
                let (mapped_x, mapped_y) = map(x, y);
                let destination = ((mapped_y as u32 * width + mapped_x as u32) * 4) as usize;
                let source = ((y * self.width + x) * 4) as usize;
                pixels[destination..destination + 4]
                    .copy_from_slice(&self.pixels[source..source + 4]);
            }
        }
        (width, height, hotspot, pixels.into())
    }
}
#[cfg(test)]
mod tests;
