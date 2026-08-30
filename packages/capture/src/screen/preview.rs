#[cfg(any(test, target_os = "macos"))]
use base64::{Engine as _, engine::general_purpose::STANDARD};
#[cfg(any(test, target_os = "macos"))]
use jpeg_encoder::{ColorType, Encoder};
use serde::{Deserialize, Serialize};

use crate::{CaptureError, model::SourceId};

const MAX_PREVIEW_WIDTH: u32 = 640;
const MAX_PREVIEW_HEIGHT: u32 = 360;
#[cfg(any(test, target_os = "macos"))]
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
        let _ = source_id;
        Err(CaptureError::Unsupported(
            "native source previews are currently available only on macOS".into(),
        ))
    }
}

#[cfg(any(test, target_os = "macos"))]
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

#[cfg(any(test, target_os = "macos"))]
pub(crate) fn jpeg_data_url(rgba: &[u8], width: u32, height: u32) -> Result<String, CaptureError> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_landscape_portrait_and_small_sources_without_distortion() {
        assert_eq!(fit_preview_dimensions(1920, 1080, 300, 200), (300, 169));
        assert_eq!(fit_preview_dimensions(1080, 1920, 300, 200), (113, 200));
        assert_eq!(fit_preview_dimensions(120, 80, 300, 200), (120, 80));
    }

    #[test]
    fn rejects_zero_and_oversized_preview_bounds() {
        assert!(validate_preview_bounds(0, 200).is_err());
        assert!(validate_preview_bounds(300, 0).is_err());
        assert!(validate_preview_bounds(641, 200).is_err());
        assert!(validate_preview_bounds(300, 361).is_err());
    }

    #[test]
    fn encodes_valid_rgba_as_a_jpeg_data_url_and_rejects_wrong_lengths() {
        let result = jpeg_data_url(&[255, 64, 0, 255], 1, 1);
        assert!(result.is_ok(), "one RGBA pixel should encode");
        let encoded = result.unwrap_or_default();
        assert!(encoded.starts_with("data:image/jpeg;base64,/9j/"));
        assert!(jpeg_data_url(&[], 1, 1).is_err());
        assert!(jpeg_data_url(&[0; 8], 1, 1).is_err());
    }
}
