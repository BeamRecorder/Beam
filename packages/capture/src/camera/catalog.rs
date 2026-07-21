use crate::model::{MediaFormat, SourceDescriptor};
#[cfg(feature = "camera")]
use crate::model::{SourceCapabilities, SourceId, SourceKind, SourceSelectionMode};

pub fn closest_video_format(
    formats: &[MediaFormat],
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<u32>,
) -> Option<&MediaFormat> {
    formats
        .iter()
        .filter(|format| matches!(format, MediaFormat::Video { .. }))
        .min_by_key(|format| match format {
            MediaFormat::Video {
                width: actual_width,
                height: actual_height,
                fps: actual_fps,
                ..
            } => {
                u64::from(width.unwrap_or(*actual_width).abs_diff(*actual_width))
                    + u64::from(height.unwrap_or(*actual_height).abs_diff(*actual_height))
                    + u64::from(fps.unwrap_or(*actual_fps).abs_diff(*actual_fps)) * 1_000
            }
            MediaFormat::Audio { .. } => u64::MAX,
        })
}

#[cfg(feature = "camera")]
pub fn discover_cameras() -> Result<Vec<SourceDescriptor>, crate::CaptureError> {
    let devices =
        cameras::devices().map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
    devices
        .into_iter()
        .enumerate()
        .map(|(position, device)| {
            let formats = camera_formats(cameras::probe(&device).map_err(|error| {
                crate::CaptureError::Backend(format!("could not probe {}: {error}", device.name))
            })?);
            Ok(SourceDescriptor {
                id: SourceId::new(format!("camera:{}", device.id.0))?,
                kind: SourceKind::Camera,
                label: device.name,
                is_default: position == 0,
                selection_mode: SourceSelectionMode::Direct,
                capabilities: SourceCapabilities {
                    formats,
                    ..SourceCapabilities::default()
                },
            })
        })
        .collect()
}

#[cfg(feature = "camera")]
fn camera_formats(capabilities: cameras::Capabilities) -> Vec<MediaFormat> {
    let mut formats = capabilities
        .formats
        .into_iter()
        .map(|format| MediaFormat::Video {
            width: format.resolution.width,
            height: format.resolution.height,
            fps: format.framerate_range.max.round().max(1.0) as u32,
            pixel_format: Some(super::pixel_format_name(format.pixel_format).into()),
        })
        .collect::<Vec<_>>();
    formats.sort_by_key(|format| match format {
        MediaFormat::Video {
            width, height, fps, ..
        } => (*width, *height, *fps),
        MediaFormat::Audio { .. } => (0, 0, 0),
    });
    formats.dedup();
    formats
}

#[cfg(not(feature = "camera"))]
pub fn discover_cameras() -> Result<Vec<SourceDescriptor>, crate::CaptureError> {
    Ok(Vec::new())
}
