use super::validate_frame;
use crate::{CaptureError, model::ScreenRegion, screen::OwnedVideoFrame};
use std::sync::Arc;

pub(super) fn crop_frame(
    frame: OwnedVideoFrame,
    region: Option<ScreenRegion>,
) -> Result<OwnedVideoFrame, CaptureError> {
    let Some(region) = region else {
        return Ok(frame);
    };
    validate_frame(&frame)?;
    let (left, top, right, bottom) = region.pixel_rect(frame.width, frame.height)?;
    if (left, top, right, bottom) == (0, 0, frame.width, frame.height) {
        return Ok(frame);
    }
    let stride = (right - left) as usize * 4;
    let mut pixels = Vec::with_capacity(stride * (bottom - top) as usize);
    for row in top..bottom {
        let offset = row as usize * frame.stride + left as usize * 4;
        pixels.extend_from_slice(&frame.pixels[offset..offset + stride]);
    }
    Ok(OwnedVideoFrame {
        width: right - left,
        height: bottom - top,
        stride,
        pixel_format: frame.pixel_format,
        pixels: Arc::from(pixels),
    })
}

#[cfg(test)]
mod tests;
