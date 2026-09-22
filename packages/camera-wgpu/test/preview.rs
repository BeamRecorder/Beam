#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraFormat, CameraFrame, PixelFormat};
use beam_camera_wgpu::CameraPreview;
use beam_media_core::VideoFrame;

fn frame(width: u32, height: u32, pts: u64) -> VideoFrame<CameraFrame> {
    let stride = width * 4;
    VideoFrame {
        captured_ns: pts,
        width,
        height,
        data: CameraFrame {
            format: CameraFormat {
                width,
                height,
                fps: 30,
                pixel_format: PixelFormat::Bgra,
                stride,
            },
            native_timestamp_ns: Some(pts),
            sequence: pts,
            data: Arc::from(vec![255_u8; (stride * height) as usize]),
        },
    }
}

#[test]
fn preview_reuses_texture_until_size_or_device_lifecycle_changes() {
    let instance = wgpu::Instance::default();
    let adapter =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
            .expect("GPU adapter available for preview test");
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
            .expect("GPU device available for preview test");

    let mut preview = CameraPreview::new();
    let first = preview
        .update(&device, &queue, &frame(2, 2, 10))
        .expect("first upload");
    assert_eq!((first.captured_ns, first.width, first.height), (10, 2, 2));
    let first_stats = preview.stats();
    assert!(first_stats.cpu_buffer_reallocations > 0);
    assert!(first_stats.cpu_buffer_growth_bytes > 0);
    let second = preview
        .update(&device, &queue, &frame(2, 2, 20))
        .expect("same size");
    assert_eq!(second.captured_ns, 20);
    assert_eq!(preview.stats().texture_recreations, 1);
    assert_eq!(
        preview.stats().cpu_buffer_reallocations,
        first_stats.cpu_buffer_reallocations
    );
    assert_eq!(
        preview.stats().cpu_buffer_growth_bytes,
        first_stats.cpu_buffer_growth_bytes
    );

    let resized = preview
        .update(&device, &queue, &frame(4, 2, 30))
        .expect("resized upload");
    assert_eq!((resized.width, resized.height), (4, 2));
    assert_eq!(preview.stats().texture_recreations, 2);
    assert_eq!(preview.stats().frames_uploaded, 3);
    assert!(preview.stats().bytes_uploaded >= 3 * 256 * 2);
    assert_eq!(preview.stats().cpu_color_conversion_bytes, 64);
    assert_eq!(preview.stats().cpu_padding_copy_count, 3);
    assert_eq!(preview.stats().cpu_padding_copy_bytes, 64);

    preview.reset();
    preview
        .update(&device, &queue, &frame(4, 2, 40))
        .expect("upload after reset");
    assert_eq!(preview.stats().texture_recreations, 3);
    preview
        .update(&device, &queue, &frame(64, 2, 50))
        .expect("aligned upload");
    assert_eq!(preview.stats().cpu_color_conversion_bytes, 608);
    assert_eq!(preview.stats().cpu_padding_copy_count, 4);
    assert_eq!(preview.stats().cpu_padding_copy_bytes, 96);
}
