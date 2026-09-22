#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;
use crate::windows::catalog::MfRuntime;
use windows::Win32::Media::MediaFoundation::{MFCreateMemoryBuffer, MFCreateSample};

#[test]
fn media_foundation_yuyv_stride_follows_owned_buffer_rows() {
    let format = CameraFormat {
        width: 640,
        height: 480,
        fps: 30,
        pixel_format: PixelFormat::Yuyv,
        stride: 1280,
    };
    assert_eq!(format_with_buffer_stride(format, 1344 * 480).stride, 1344);
    assert_eq!(format_with_buffer_stride(format, 1280 * 480).stride, 1280);
}

#[test]
fn media_foundation_nv12_stride_ignores_malformed_lengths() {
    let format = CameraFormat {
        width: 640,
        height: 480,
        fps: 30,
        pixel_format: PixelFormat::Nv12,
        stride: 640,
    };
    assert_eq!(
        format_with_buffer_stride(format, 672 * 480 * 3 / 2).stride,
        672
    );
    assert_eq!(format_with_buffer_stride(format, 1).stride, 640);
}

#[test]
fn compressed_camera_frame_does_not_invent_a_stride() {
    let format = CameraFormat {
        width: 640,
        height: 480,
        fps: 30,
        pixel_format: PixelFormat::Mjpeg,
        stride: 0,
    };
    assert_eq!(format_with_buffer_stride(format, 12_345), format);
}

#[test]
fn media_foundation_sample_without_a_buffer_is_rejected() {
    let _runtime = MfRuntime::start().expect("Media Foundation");
    let sample = unsafe { MFCreateSample() }.expect("sample");
    assert!(copy_sample(&sample, 1024).is_err());
}

#[test]
fn media_foundation_sample_copy_keeps_bytes_and_checks_the_limit() {
    let _runtime = MfRuntime::start().expect("Media Foundation");
    let sample = unsafe { MFCreateSample() }.expect("sample");
    let buffer = unsafe { MFCreateMemoryBuffer(4) }.expect("buffer");
    let mut pointer = std::ptr::null_mut();
    unsafe { buffer.Lock(&mut pointer, None, None) }.expect("lock");
    assert!(!pointer.is_null());
    unsafe { std::ptr::copy_nonoverlapping([1_u8, 2, 3, 4].as_ptr(), pointer, 4) };
    unsafe { buffer.Unlock() }.expect("unlock");
    unsafe { buffer.SetCurrentLength(4) }.expect("length");
    unsafe { sample.AddBuffer(&buffer) }.expect("add buffer");

    assert!(copy_sample(&sample, 3).is_err());
    assert_eq!(&*copy_sample(&sample, 4).expect("copy"), &[1, 2, 3, 4]);
}
