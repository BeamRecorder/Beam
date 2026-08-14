use crate::{cursor::Hotspot, screen::CursorSampleState};

use super::{CropRect, VideoTransform};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CursorMetadata {
    pub id: u64,
    pub x: i32,
    pub y: i32,
    pub hotspot: Option<Hotspot>,
}

#[derive(Debug)]
pub(crate) struct CursorState {
    stream_scope: String,
    native_id: Option<u64>,
}

impl CursorState {
    #[must_use]
    pub(crate) fn new(stream_scope: impl Into<String>) -> Self {
        Self {
            stream_scope: stream_scope.into(),
            native_id: None,
        }
    }

    #[must_use]
    pub(crate) fn resolve(
        &mut self,
        metadata: Option<CursorMetadata>,
        width: u32,
        height: u32,
    ) -> CursorSampleState {
        let Some(metadata) = metadata else {
            return CursorSampleState::Unknown;
        };
        if metadata.id != 0 {
            self.native_id = Some(metadata.id);
        }
        let Some(native_id) = self.native_id else {
            return CursorSampleState::Unknown;
        };
        if width == 0 || height == 0 {
            return CursorSampleState::Unknown;
        }
        let visible = metadata.x >= 0
            && metadata.y >= 0
            && u32::try_from(metadata.x).is_ok_and(|x| x < width)
            && u32::try_from(metadata.y).is_ok_and(|y| y < height);
        CursorSampleState::Known {
            native_cursor_id: format!("pipewire:{}:{native_id}", self.stream_scope),
            pixel_x: metadata.x,
            pixel_y: metadata.y,
            normalized_x: f64::from(metadata.x) / f64::from(width),
            normalized_y: f64::from(metadata.y) / f64::from(height),
            visible,
            hotspot: metadata.hotspot,
        }
    }
}

pub(crate) fn map_cursor_metadata(
    metadata: Option<CursorMetadata>,
    source_width: u32,
    source_height: u32,
    crop: Option<CropRect>,
    transform: VideoTransform,
) -> Option<CursorMetadata> {
    let mut metadata = metadata?;
    let crop = crop.unwrap_or(CropRect {
        x: 0,
        y: 0,
        width: source_width,
        height: source_height,
    });
    let x = i64::from(metadata.x) - i64::from(crop.x);
    let y = i64::from(metadata.y) - i64::from(crop.y);
    let width = i64::from(crop.width);
    let height = i64::from(crop.height);
    let (x, y) = match transform {
        VideoTransform::None => (x, y),
        VideoTransform::Rotated90 => (y, width - 1 - x),
        VideoTransform::Rotated180 => (width - 1 - x, height - 1 - y),
        VideoTransform::Rotated270 => (height - 1 - y, x),
        VideoTransform::Flipped => (width - 1 - x, y),
        VideoTransform::Flipped90 => (y, x),
        VideoTransform::Flipped180 => (x, height - 1 - y),
        VideoTransform::Flipped270 => (height - 1 - y, width - 1 - x),
    };
    metadata.x = i32::try_from(x).unwrap_or(if x < 0 { i32::MIN } else { i32::MAX });
    metadata.y = i32::try_from(y).unwrap_or(if y < 0 { i32::MIN } else { i32::MAX });
    Some(metadata)
}
