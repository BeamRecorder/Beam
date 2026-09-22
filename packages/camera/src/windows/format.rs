use windows::Win32::Media::MediaFoundation::{
    IMFMediaType, IMFSourceReader, MF_E_NO_MORE_TYPES, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE,
    MF_MT_SUBTYPE, MF_SOURCE_READER_FIRST_VIDEO_STREAM, MFVideoFormat_MJPG, MFVideoFormat_NV12,
    MFVideoFormat_YUY2,
};

use crate::{CameraError, CameraFormat, CameraRequest, PixelFormat};

pub(super) struct SelectedFormat {
    pub media_type: IMFMediaType,
    pub format: CameraFormat,
}

pub(super) fn choose_format(
    reader: &IMFSourceReader,
    request: &CameraRequest,
) -> Result<CameraFormat, CameraError> {
    let mut best: Option<(u64, SelectedFormat)> = None;
    let mut index = 0_u32;
    loop {
        let media_type = unsafe {
            reader.GetNativeMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, index)
        };
        let media_type = match media_type {
            Ok(media_type) => media_type,
            Err(error) if error.code() == MF_E_NO_MORE_TYPES => break,
            Err(error) => {
                return Err(CameraError::Backend(format!(
                    "enumerating native camera formats: {error}"
                )));
            }
        };
        index = index.saturating_add(1);
        let Some(format) = read_format(&media_type) else {
            continue;
        };
        let score = format_score(request, format);
        if best.as_ref().is_none_or(|(current, _)| score < *current) {
            best = Some((score, SelectedFormat { media_type, format }));
        }
    }
    let Some((_, selected)) = best else {
        return Err(CameraError::UnsupportedFormat(
            "Media Foundation camera exposes no NV12, YUY2 or MJPEG stream".into(),
        ));
    };
    unsafe {
        reader.SetCurrentMediaType(
            MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,
            None,
            &selected.media_type,
        )
    }
    .map_err(|error| CameraError::UnsupportedFormat(format!("selecting camera format: {error}")))?;
    let actual =
        unsafe { reader.GetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32) }
            .map_err(|error| {
                CameraError::Backend(format!("reading selected camera format: {error}"))
            })?;
    if read_format(&actual) != Some(selected.format) {
        return Err(CameraError::UnsupportedFormat(
            "Media Foundation changed the selected native format".into(),
        ));
    }
    Ok(selected.format)
}

fn read_format(media_type: &IMFMediaType) -> Option<CameraFormat> {
    let subtype = unsafe { media_type.GetGUID(&MF_MT_SUBTYPE) }.ok()?;
    let packed_size = unsafe { media_type.GetUINT64(&MF_MT_FRAME_SIZE) }.ok()?;
    let (width, height) = unpack_pair(packed_size);
    let packed_rate = unsafe { media_type.GetUINT64(&MF_MT_FRAME_RATE) }.ok()?;
    let (numerator, denominator) = unpack_pair(packed_rate);
    if width == 0 || height == 0 || numerator == 0 || denominator == 0 {
        return None;
    }
    let fps = numerator
        .saturating_add(denominator / 2)
        .checked_div(denominator)?
        .max(1);
    let (pixel_format, stride) =
        if subtype == MFVideoFormat_NV12 && width.is_multiple_of(2) && height.is_multiple_of(2) {
            (PixelFormat::Nv12, width)
        } else if subtype == MFVideoFormat_YUY2 && width.is_multiple_of(2) {
            (PixelFormat::Yuyv, width.checked_mul(2)?)
        } else if subtype == MFVideoFormat_MJPG {
            (PixelFormat::Mjpeg, 0)
        } else {
            return None;
        };
    Some(CameraFormat {
        width,
        height,
        fps,
        pixel_format,
        stride,
    })
}

fn unpack_pair(value: u64) -> (u32, u32) {
    ((value >> 32) as u32, value as u32)
}

fn format_score(request: &CameraRequest, format: CameraFormat) -> u64 {
    let pixels = u64::from(format.width.abs_diff(request.width))
        + u64::from(format.height.abs_diff(request.height));
    let fps = u64::from(format.fps.abs_diff(request.fps));
    let format_priority = match format.pixel_format {
        PixelFormat::Nv12 => 0,
        PixelFormat::Yuyv => 1,
        PixelFormat::Mjpeg => 2,
        PixelFormat::Bgra => 3,
    };
    pixels
        .saturating_mul(1_000_000)
        .saturating_add(fps.saturating_mul(10))
        .saturating_add(format_priority)
}

#[path = "../../test/windows/format.rs"]
mod format_checks;
