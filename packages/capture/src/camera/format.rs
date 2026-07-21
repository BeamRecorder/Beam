use cameras::{Capabilities, PixelFormat, Resolution, StreamConfig};

use crate::{
    CaptureError,
    model::{CameraPixelFormat, CameraSelection},
};

pub fn select_format(
    capabilities: &Capabilities,
    selection: &CameraSelection,
) -> Result<StreamConfig, CaptureError> {
    let width = positive_or_default(selection.preferred_width, 1280, "camera width")?;
    let height = positive_or_default(selection.preferred_height, 720, "camera height")?;
    let framerate = positive_or_default(selection.preferred_fps, 30, "camera fps")?;
    let requested = Resolution { width, height };
    let preferred = selection.preferred_pixel_format.map(pixel_format);
    let formats = capabilities
        .formats
        .iter()
        .map(CandidateFormat::from)
        .collect::<Vec<_>>();
    select_candidate(&formats, requested, framerate, preferred)
}

fn select_candidate(
    formats: &[CandidateFormat],
    requested: Resolution,
    framerate: u32,
    preferred: Option<PixelFormat>,
) -> Result<StreamConfig, CaptureError> {
    let format = formats
        .iter()
        .min_by_key(|format| format_score(format, requested, framerate, preferred))
        .ok_or_else(|| {
            CaptureError::InvalidConfiguration("camera has no supported formats".into())
        })?;
    Ok(StreamConfig {
        resolution: Resolution {
            width: format.width,
            height: format.height,
        },
        framerate: negotiated_framerate(format, framerate),
        pixel_format: format.pixel_format,
    })
}

#[derive(Clone, Copy)]
struct CandidateFormat {
    width: u32,
    height: u32,
    min_fps: f64,
    max_fps: f64,
    pixel_format: PixelFormat,
}

impl From<&cameras::FormatDescriptor> for CandidateFormat {
    fn from(format: &cameras::FormatDescriptor) -> Self {
        Self {
            width: format.resolution.width,
            height: format.resolution.height,
            min_fps: format.framerate_range.min,
            max_fps: format.framerate_range.max,
            pixel_format: format.pixel_format,
        }
    }
}

pub fn pixel_format_name(format: PixelFormat) -> &'static str {
    match format {
        PixelFormat::Bgra8 => "bgra",
        PixelFormat::Rgb8 => "rgb",
        PixelFormat::Rgba8 => "rgba",
        PixelFormat::Yuyv => "yuyv",
        PixelFormat::Nv12 => "nv12",
        PixelFormat::Mjpeg => "mjpeg",
        _ => "unknown",
    }
}

fn positive_or_default(value: Option<u32>, default: u32, name: &str) -> Result<u32, CaptureError> {
    match value {
        Some(0) => Err(CaptureError::InvalidConfiguration(format!(
            "{name} must be non-zero"
        ))),
        Some(value) => Ok(value),
        None => Ok(default),
    }
}

const fn pixel_format(format: CameraPixelFormat) -> PixelFormat {
    match format {
        CameraPixelFormat::Mjpeg => PixelFormat::Mjpeg,
        CameraPixelFormat::Yuyv => PixelFormat::Yuyv,
        CameraPixelFormat::Nv12 => PixelFormat::Nv12,
        CameraPixelFormat::Bgra => PixelFormat::Bgra8,
        CameraPixelFormat::Rgba => PixelFormat::Rgba8,
    }
}

fn format_score(
    format: &CandidateFormat,
    requested: Resolution,
    framerate: u32,
    preferred: Option<PixelFormat>,
) -> (u8, u8, u64, u64) {
    let preference = if preferred == Some(format.pixel_format) {
        0
    } else {
        1
    };
    let native_priority = match format.pixel_format {
        PixelFormat::Nv12 | PixelFormat::Bgra8 => 0,
        PixelFormat::Rgba8 | PixelFormat::Rgb8 | PixelFormat::Yuyv => 1,
        PixelFormat::Mjpeg => 2,
        _ => 3,
    };
    let resolution_delta = u64::from(format.width.abs_diff(requested.width))
        + u64::from(format.height.abs_diff(requested.height));
    let fps_delta = (f64::from(framerate) - closest_framerate(format, framerate)).abs() as u64;
    (preference, native_priority, resolution_delta, fps_delta)
}

fn closest_framerate(format: &CandidateFormat, requested: u32) -> f64 {
    f64::from(requested).clamp(format.min_fps, format.max_fps)
}

fn negotiated_framerate(format: &CandidateFormat, requested: u32) -> u32 {
    closest_framerate(format, requested).round().max(1.0) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::SourceId;

    fn selection() -> Result<CameraSelection, CaptureError> {
        Ok(CameraSelection {
            source_id: SourceId::new("camera:test")?,
            preferred_width: Some(1280),
            preferred_height: Some(720),
            preferred_fps: Some(30),
            preferred_pixel_format: None,
        })
    }

    fn format(width: u32, height: u32, fps: f64, pixel_format: PixelFormat) -> CandidateFormat {
        CandidateFormat {
            width,
            height,
            min_fps: fps,
            max_fps: fps,
            pixel_format,
        }
    }

    #[test]
    fn selects_the_exact_requested_format() -> Result<(), CaptureError> {
        let mut selection = selection()?;
        selection.preferred_pixel_format = Some(CameraPixelFormat::Bgra);
        let config = select_candidate(
            &[format(1280, 720, 30.0, PixelFormat::Bgra8)],
            Resolution {
                width: 1280,
                height: 720,
            },
            30,
            selection.preferred_pixel_format.map(pixel_format),
        )?;
        assert_eq!(config.pixel_format, PixelFormat::Bgra8);
        assert_eq!(config.framerate, 30);
        Ok(())
    }

    #[test]
    fn prefers_native_nv12_over_mjpeg_when_no_format_is_requested() -> Result<(), CaptureError> {
        let config = select_candidate(
            &[
                format(1280, 720, 30.0, PixelFormat::Mjpeg),
                format(1280, 720, 30.0, PixelFormat::Nv12),
            ],
            Resolution {
                width: 1280,
                height: 720,
            },
            30,
            None,
        )?;
        assert_eq!(config.pixel_format, PixelFormat::Nv12);
        Ok(())
    }

    #[test]
    fn chooses_the_closest_available_resolution_and_framerate() -> Result<(), CaptureError> {
        let config = select_candidate(
            &[
                format(640, 480, 30.0, PixelFormat::Nv12),
                format(1920, 1080, 60.0, PixelFormat::Nv12),
            ],
            Resolution {
                width: 1280,
                height: 720,
            },
            30,
            None,
        )?;
        assert_eq!(
            config.resolution,
            Resolution {
                width: 640,
                height: 480
            }
        );
        assert_eq!(config.framerate, 30);
        Ok(())
    }

    #[test]
    fn rejects_an_empty_format_catalogue() {
        let result = select_candidate(
            &[],
            Resolution {
                width: 1280,
                height: 720,
            },
            30,
            None,
        );
        assert!(
            matches!(result, Err(CaptureError::InvalidConfiguration(message)) if message.contains("no supported formats"))
        );
    }

    #[test]
    fn rejects_a_zero_requested_dimension() -> Result<(), CaptureError> {
        let mut selection = selection()?;
        selection.preferred_width = Some(0);
        assert!(
            matches!(positive_or_default(selection.preferred_width, 1280, "camera width"), Err(CaptureError::InvalidConfiguration(message)) if message == "camera width must be non-zero")
        );
        Ok(())
    }
}
