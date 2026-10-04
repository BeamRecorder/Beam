use super::{ScreenshotRequest, backend_error};
use crate::{
    CaptureError,
    model::ScreenSelection,
    screen::{OwnedVideoFrame, PixelFormat},
};
use screencapturekit::{
    screenshot_manager::{CGImageExt, SCScreenshotManager},
    shareable_content::SCShareableContent,
    stream::configuration::SCStreamConfiguration,
};
use std::sync::Arc;

pub(super) fn capture(request: &ScreenshotRequest) -> Result<OwnedVideoFrame, CaptureError> {
    let ScreenSelection::Source { source_id } = &request.screen else {
        return Err(CaptureError::InvalidConfiguration(
            "macOS screenshot requires a direct source".into(),
        ));
    };
    let content = SCShareableContent::get().map_err(backend_error)?;
    let (filter, width, height, _) = crate::screen::mac::resolve_filter(
        &content,
        source_id,
        None,
        &request.excluded_window_handles,
        false,
        false,
    )?;
    let config = SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_shows_cursor(false);
    let image = SCScreenshotManager::capture_image(&filter, &config).map_err(backend_error)?;
    Ok(OwnedVideoFrame {
        width: u32::try_from(image.width()).map_err(backend_error)?,
        height: u32::try_from(image.height()).map_err(backend_error)?,
        stride: image.width() * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(image.bgra_data().map_err(backend_error)?),
    })
}
