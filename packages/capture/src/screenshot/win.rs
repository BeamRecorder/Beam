use super::ScreenshotRequest;
use crate::{CaptureError, screen::OwnedVideoFrame};
use std::sync::Arc;

#[path = "../../test/screenshot/win.rs"]
mod screenshot_checks;

pub(super) fn capture(request: &ScreenshotRequest) -> Result<OwnedVideoFrame, CaptureError> {
    let frame = crate::screen::win::capture_screenshot(request)?;
    let Some(region) = request.region else {
        return Ok(frame);
    };
    crop_frame(frame, region)
}

fn crop_frame(
    frame: OwnedVideoFrame,
    region: crate::model::ScreenRegion,
) -> Result<OwnedVideoFrame, CaptureError> {
    let (x, y, right, bottom) = region.pixel_rect(frame.width, frame.height)?;
    let stride = (right - x) as usize * 4;
    let mut pixels = Vec::with_capacity(stride * (bottom - y) as usize);
    for row in y..bottom {
        let offset = row as usize * frame.stride + x as usize * 4;
        pixels.extend_from_slice(&frame.pixels[offset..offset + stride]);
    }
    Ok(OwnedVideoFrame {
        width: right - x,
        height: bottom - y,
        stride,
        pixel_format: frame.pixel_format,
        pixels: Arc::from(pixels),
    })
}
