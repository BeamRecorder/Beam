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
    use nokhwa::{
        Camera,
        pixel_format::RgbAFormat,
        utils::{RequestedFormat, RequestedFormatType},
    };

    let devices = nokhwa::query(nokhwa::utils::ApiBackend::Auto)
        .map_err(|e| crate::CaptureError::Backend(e.to_string()))?;
    devices
        .into_iter()
        .enumerate()
        .map(|(position, device)| {
            let formats = Camera::new(
                device.index().clone(),
                RequestedFormat::new::<RgbAFormat>(RequestedFormatType::None),
            )
            .and_then(|mut camera| camera.compatible_camera_formats())
            .map(|formats| {
                let mut formats = formats
                    .into_iter()
                    .map(|format| MediaFormat::Video {
                        width: format.width(),
                        height: format.height(),
                        fps: format.frame_rate(),
                        pixel_format: Some(format.format().to_string().to_ascii_lowercase()),
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
            })
            .unwrap_or_default();
            Ok(SourceDescriptor {
                id: SourceId::new(format!("nokhwa:{}", device.index()))?,
                kind: SourceKind::Camera,
                label: device.human_name().to_owned(),
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

#[cfg(not(feature = "camera"))]
pub fn discover_cameras() -> Result<Vec<SourceDescriptor>, crate::CaptureError> {
    Ok(Vec::new())
}
