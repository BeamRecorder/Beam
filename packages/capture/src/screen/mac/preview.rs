use screencapturekit::{
    screenshot_manager::{CGImageExt, SCScreenshotManager},
    shareable_content::SCShareableContent,
    stream::configuration::{PixelFormat, SCStreamConfiguration},
};

use crate::{
    CaptureError,
    model::SourceId,
    screen::{SourcePreview, fit_preview_dimensions, jpeg_data_url},
};

pub fn capture_source_preview(
    source_id: &SourceId,
    max_width: u32,
    max_height: u32,
) -> Result<SourcePreview, CaptureError> {
    let content = SCShareableContent::create()
        .with_on_screen_windows_only(false)
        .with_exclude_desktop_windows(true)
        .get()
        .map_err(preview_error)?;
    let (filter, source_width, source_height, _) =
        super::resolve_filter(&content, source_id, None)?;
    let (width, height) =
        fit_preview_dimensions(source_width, source_height, max_width, max_height);
    let configuration = SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_shows_cursor(false)
        .with_pixel_format(PixelFormat::BGRA);
    let image =
        SCScreenshotManager::capture_image(&filter, &configuration).map_err(preview_error)?;
    let actual_width = u32::try_from(image.width())
        .map_err(|error| CaptureError::Backend(format!("preview width is invalid: {error}")))?;
    let actual_height = u32::try_from(image.height())
        .map_err(|error| CaptureError::Backend(format!("preview height is invalid: {error}")))?;
    let rgba = image.rgba_data().map_err(preview_error)?;
    Ok(SourcePreview {
        source_id: source_id.clone(),
        thumbnail: jpeg_data_url(&rgba, actual_width, actual_height)?,
    })
}

fn preview_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("ScreenCaptureKit preview failed: {error}"))
}
