use base64::{Engine as _, engine::general_purpose::STANDARD};
use jpeg_encoder::{ColorType, Encoder};
use serde::{Deserialize, Serialize};

use crate::{CaptureError, model::SourceId};

const MAX_PREVIEW_WIDTH: u32 = 640;
const MAX_PREVIEW_HEIGHT: u32 = 360;
const JPEG_QUALITY: u8 = 72;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePreview {
    pub source_id: SourceId,
    pub thumbnail: String,
}

pub fn capture_source_preview(
    source_id: &SourceId,
    max_width: u32,
    max_height: u32,
) -> Result<SourcePreview, CaptureError> {
    validate_preview_bounds(max_width, max_height)?;
    #[cfg(target_os = "macos")]
    {
        super::mac::capture_source_preview(source_id, max_width, max_height)
    }
    #[cfg(not(target_os = "macos"))]
    {
        use crate::model::{PortalSourceKind, ScreenSelection};
        let screen = match source_id.as_str() {
            "portal:monitor" => ScreenSelection::Portal {
                kind: PortalSourceKind::Monitor,
                restore_token: None,
            },
            "portal:window" => ScreenSelection::Portal {
                kind: PortalSourceKind::Window,
                restore_token: None,
            },
            _ => ScreenSelection::Source {
                source_id: source_id.clone(),
            },
        };
        let frame = crate::screenshot::capture_frame(&crate::screenshot::ScreenshotRequest {
            screen,
            region: None,
            output: std::path::PathBuf::new(),
            excluded_window_handles: Vec::new(),
        })?;
        let rgba = crate::rgba_pixels(&frame)?;
        Ok(SourcePreview {
            source_id: source_id.clone(),
            thumbnail: rgba_thumbnail(&rgba, frame.width, frame.height, max_width, max_height)?,
        })
    }
}

pub(crate) fn fit_preview_dimensions(
    source_width: u32,
    source_height: u32,
    max_width: u32,
    max_height: u32,
) -> (u32, u32) {
    let source_width = source_width.max(1);
    let source_height = source_height.max(1);
    if source_width <= max_width && source_height <= max_height {
        return (source_width, source_height);
    }
    if u64::from(max_width) * u64::from(source_height)
        <= u64::from(max_height) * u64::from(source_width)
    {
        let height = (u64::from(source_height) * u64::from(max_width)
            + u64::from(source_width) / 2)
            / u64::from(source_width);
        return (
            max_width,
            u32::try_from(height).map_or(1, |value| value.max(1)),
        );
    }
    let width = (u64::from(source_width) * u64::from(max_height) + u64::from(source_height) / 2)
        / u64::from(source_height);
    (
        u32::try_from(width).map_or(1, |value| value.max(1)),
        max_height,
    )
}

pub fn jpeg_data_url(rgba: &[u8], width: u32, height: u32) -> Result<String, CaptureError> {
    let expected = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration("preview dimensions overflowed".into())
        })?;
    if rgba.len() != expected {
        return Err(CaptureError::InvalidConfiguration(format!(
            "preview RGBA data has {} bytes; expected {expected}",
            rgba.len()
        )));
    }
    let width = u16::try_from(width)
        .map_err(|_| CaptureError::InvalidConfiguration("preview width is too large".into()))?;
    let height = u16::try_from(height)
        .map_err(|_| CaptureError::InvalidConfiguration("preview height is too large".into()))?;
    let mut jpeg = Vec::new();
    Encoder::new(&mut jpeg, JPEG_QUALITY)
        .encode(rgba, width, height, ColorType::Rgba)
        .map_err(|error| CaptureError::Backend(format!("JPEG preview encoding failed: {error}")))?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)))
}

fn validate_preview_bounds(max_width: u32, max_height: u32) -> Result<(), CaptureError> {
    if max_width == 0 || max_height == 0 {
        return Err(CaptureError::InvalidConfiguration(
            "preview dimensions must be positive".into(),
        ));
    }
    if max_width > MAX_PREVIEW_WIDTH || max_height > MAX_PREVIEW_HEIGHT {
        return Err(CaptureError::InvalidConfiguration(format!(
            "preview dimensions must not exceed {MAX_PREVIEW_WIDTH}x{MAX_PREVIEW_HEIGHT}"
        )));
    }
    Ok(())
}

#[path = "../../test/screen/preview.rs"]
mod preview_checks;

pub fn rgba_thumbnail(
    rgba: &[u8],
    source_width: u32,
    source_height: u32,
    max_width: u32,
    max_height: u32,
) -> Result<String, CaptureError> {
    validate_preview_bounds(max_width, max_height)?;
    let expected = u64::from(source_width)
        .checked_mul(u64::from(source_height))
        .and_then(|pixels| pixels.checked_mul(4));
    if source_width == 0 || source_height == 0 || u64::try_from(rgba.len()).ok() != expected {
        return Err(CaptureError::InvalidConfiguration(
            "invalid thumbnail frame".into(),
        ));
    }
    let (width, height) =
        fit_preview_dimensions(source_width, source_height, max_width, max_height);
    let mut scaled = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            let sx = u64::from(x) * u64::from(source_width) / u64::from(width);
            let sy = u64::from(y) * u64::from(source_height) / u64::from(height);
            let offset = (sy * u64::from(source_width) + sx) as usize * 4;
            scaled.extend_from_slice(&rgba[offset..offset + 4]);
        }
    }
    jpeg_data_url(&scaled, width, height)
}
