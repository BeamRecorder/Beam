use objc2::rc::Retained;
use objc2_av_foundation::{AVCaptureDevice, AVCaptureDeviceFormat, AVFrameRateRange};
use objc2_core_media::{CMTime, CMVideoFormatDescriptionGetDimensions};

use crate::{CameraError, CameraFormat, CameraRequest, PixelFormat};

pub(super) fn choose_format(
    device: &AVCaptureDevice,
    request: &CameraRequest,
) -> Result<CameraFormat, CameraError> {
    let mut best: Option<(u64, Retained<AVCaptureDeviceFormat>, CMTime, CameraFormat)> = None;
    for native in unsafe { device.formats() }.iter() {
        let description = unsafe { native.formatDescription() };
        let dimensions = unsafe { CMVideoFormatDescriptionGetDimensions(&description) };
        let (Ok(width), Ok(height)) = (
            u32::try_from(dimensions.width),
            u32::try_from(dimensions.height),
        ) else {
            continue;
        };
        let Some(stride) = width.checked_mul(4) else {
            continue;
        };
        if width == 0 || height == 0 {
            continue;
        }
        for range in unsafe { native.videoSupportedFrameRateRanges() }.iter() {
            let Some((duration, fps)) = select_frame_rate(&range, request.fps) else {
                continue;
            };
            let candidate = CameraFormat {
                width,
                height,
                fps,
                pixel_format: PixelFormat::Bgra,
                stride,
            };
            let score = format_score(request, candidate);
            if best
                .as_ref()
                .is_none_or(|(current, _, _, _)| score < *current)
            {
                best = Some((score, native.clone(), duration, candidate));
            }
        }
    }
    let Some((_, native, duration, format)) = best else {
        return Err(CameraError::UnsupportedFormat(
            "AVFoundation camera exposes no supported video format".into(),
        ));
    };
    unsafe { device.lockForConfiguration() }
        .map_err(|error| CameraError::Backend(format!("locking camera configuration: {error}")))?;
    unsafe {
        device.setActiveFormat(&native);
        device.setActiveVideoMinFrameDuration(duration);
        device.setActiveVideoMaxFrameDuration(duration);
        device.unlockForConfiguration();
    }
    Ok(format)
}

fn select_frame_rate(range: &AVFrameRateRange, requested: u32) -> Option<(CMTime, u32)> {
    let min = unsafe { range.minFrameRate() };
    let max = unsafe { range.maxFrameRate() };
    if !min.is_finite() || !max.is_finite() || min <= 0.0 || max < min {
        return None;
    }
    let requested = f64::from(requested);
    let (duration, chosen) = if requested < min {
        (unsafe { range.maxFrameDuration() }, min)
    } else if requested > max {
        (unsafe { range.minFrameDuration() }, max)
    } else {
        let timescale = i32::try_from(requested as u32).ok()?;
        (unsafe { CMTime::new(1, timescale) }, requested)
    };
    let fps = chosen.round().clamp(1.0, f64::from(u32::MAX)) as u32;
    Some((duration, fps))
}

fn format_score(request: &CameraRequest, candidate: CameraFormat) -> u64 {
    let size = u64::from(candidate.width.abs_diff(request.width))
        + u64::from(candidate.height.abs_diff(request.height));
    let rate = u64::from(candidate.fps.abs_diff(request.fps));
    size.saturating_mul(1_000_000).saturating_add(rate)
}

#[path = "../../test/macos/format.rs"]
mod format_checks;
