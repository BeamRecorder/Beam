#![cfg_attr(not(windows), allow(dead_code))]

use crate::{CaptureError, model::ScreenRegion};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PixelCrop {
    pub(crate) start_x: u32,
    pub(crate) start_y: u32,
    pub(crate) end_x: u32,
    pub(crate) end_y: u32,
}

impl PixelCrop {
    pub(crate) const fn width(self) -> u32 {
        self.end_x - self.start_x
    }

    pub(crate) const fn height(self) -> u32 {
        self.end_y - self.start_y
    }
}

pub(crate) fn normalize_crop(
    region: ScreenRegion,
    frame_width: u32,
    frame_height: u32,
) -> Result<PixelCrop, CaptureError> {
    if frame_width < 2 || frame_height < 2 {
        return Err(CaptureError::InvalidConfiguration(
            "captured frame is smaller than the minimum encodable dimensions".into(),
        ));
    }
    let (start_x, start_y, end_x, end_y) = region.pixel_rect(frame_width, frame_height)?;
    let width = normalized_crop_dimension(end_x - start_x, frame_width)?;
    let height = normalized_crop_dimension(end_y - start_y, frame_height)?;

    // A one-pixel selection cannot be made H.264-compatible by trimming. Keep
    // it valid by taking the smallest even crop and move it inward at an edge.
    let start_x = start_x.min(frame_width - width);
    let start_y = start_y.min(frame_height - height);
    Ok(PixelCrop {
        start_x,
        start_y,
        end_x: start_x + width,
        end_y: start_y + height,
    })
}

pub(crate) fn even_dimension(val: u32) -> u32 {
    (val & !1).max(2)
}

fn normalized_crop_dimension(value: u32, frame_dimension: u32) -> Result<u32, CaptureError> {
    let dimension = even_dimension(value);
    if dimension > frame_dimension {
        return Err(CaptureError::InvalidConfiguration(
            "screen crop is smaller than the minimum encodable dimensions".into(),
        ));
    }
    Ok(dimension)
}

#[path = "../../test/screen/crop.rs"]
mod crop_checks;
