#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;
use crate::windows::catalog::MfRuntime;
use windows::Win32::Media::MediaFoundation::MFCreateMediaType;

fn request() -> CameraRequest {
    CameraRequest {
        device_id: "camera".into(),
        width: 1280,
        height: 720,
        fps: 30,
    }
}

fn format(width: u32, height: u32, fps: u32, pixel_format: PixelFormat) -> CameraFormat {
    CameraFormat {
        width,
        height,
        fps,
        pixel_format,
        stride: width,
    }
}

#[test]
fn media_foundation_packed_size_and_rate_use_high_then_low_words() {
    assert_eq!(unpack_pair((1280_u64 << 32) | 720), (1280, 720));
    assert_eq!(unpack_pair((30_000_u64 << 32) | 1001), (30_000, 1001));
    assert_eq!(unpack_pair(0), (0, 0));
}

#[test]
fn format_selection_prefers_requested_dimensions_and_frame_rate() {
    let exact = format(1280, 720, 30, PixelFormat::Nv12);
    assert!(
        format_score(&request(), exact)
            < format_score(&request(), format(640, 480, 30, PixelFormat::Nv12))
    );
    assert!(
        format_score(&request(), exact)
            < format_score(&request(), format(1280, 720, 15, PixelFormat::Nv12))
    );
}

#[test]
fn equal_native_formats_prefer_nv12_then_yuyv_then_mjpeg() {
    let nv12 = format_score(&request(), format(1280, 720, 30, PixelFormat::Nv12));
    let yuyv = format_score(&request(), format(1280, 720, 30, PixelFormat::Yuyv));
    let mjpeg = format_score(&request(), format(1280, 720, 30, PixelFormat::Mjpeg));
    assert!(nv12 < yuyv && yuyv < mjpeg);
}

#[test]
fn native_media_type_reports_frame_geometry_and_rounded_rate() {
    let _runtime = MfRuntime::start().expect("Media Foundation");
    let media_type = unsafe { MFCreateMediaType() }.expect("media type");
    unsafe {
        media_type
            .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12)
            .expect("subtype");
        media_type
            .SetUINT64(&MF_MT_FRAME_SIZE, (1280_u64 << 32) | 720)
            .expect("size");
        media_type
            .SetUINT64(&MF_MT_FRAME_RATE, (30_000_u64 << 32) | 1001)
            .expect("rate");
    }
    let selected = read_format(&media_type).expect("NV12 format");
    assert_eq!(
        (selected.width, selected.height, selected.fps),
        (1280, 720, 30)
    );
    assert_eq!(selected.pixel_format, PixelFormat::Nv12);
}

#[test]
fn zero_rate_and_unsupported_native_formats_are_rejected() {
    let _runtime = MfRuntime::start().expect("Media Foundation");
    let media_type = unsafe { MFCreateMediaType() }.expect("media type");
    unsafe {
        media_type
            .SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_YUY2)
            .expect("subtype");
        media_type
            .SetUINT64(&MF_MT_FRAME_SIZE, (640_u64 << 32) | 480)
            .expect("size");
        media_type
            .SetUINT64(&MF_MT_FRAME_RATE, 1)
            .expect("zero numerator");
    }
    assert!(read_format(&media_type).is_none());
    unsafe { media_type.SetUINT64(&MF_MT_FRAME_RATE, (30_u64 << 32) | 1) }.expect("valid rate");
    assert_eq!(
        read_format(&media_type).expect("YUY2").pixel_format,
        PixelFormat::Yuyv
    );
}
