#![allow(clippy::expect_used)]
use super::crop_frame;
use crate::{
    model::ScreenRegion,
    screen::{OwnedVideoFrame, PixelFormat},
    screenshot::write_png,
};
use std::sync::Arc;

fn frame(width: u32, height: u32, padding: usize) -> OwnedVideoFrame {
    let stride = width as usize * 4 + padding;
    let mut pixels = vec![0xee; stride * height as usize];
    for y in 0..height as usize {
        for x in 0..width as usize {
            let offset = y * stride + x * 4;
            pixels[offset..offset + 4].copy_from_slice(&[x as u8, y as u8, 42, 255]);
        }
    }
    OwnedVideoFrame {
        width,
        height,
        stride,
        pixels: Arc::from(pixels),
        pixel_format: PixelFormat::Bgra8,
    }
}

fn region(x: f64, y: f64, width: f64, height: f64) -> ScreenRegion {
    ScreenRegion {
        x,
        y,
        width,
        height,
    }
}

#[test]
fn odd_screenshot_region_keeps_every_bottom_and_right_edge_pixel_in_the_png() {
    let source = frame(8, 6, 8);
    let cropped = crop_frame(source, Some(region(0.625, 0.5, 0.375, 0.5))).expect("odd image crop");
    assert_eq!((cropped.width, cropped.height, cropped.stride), (3, 3, 12));
    let directory = tempfile::tempdir().expect("temporary PNG directory");
    let output = directory.path().join("crop.png");
    let result = write_png(&cropped, &output).expect("write selected pixels");
    assert_eq!((result.width, result.height), (3, 3));
    let file = std::io::BufReader::new(std::fs::File::open(output).expect("open PNG"));
    let mut reader = png::Decoder::new(file).read_info().expect("PNG header");
    let mut pixels = vec![0; reader.output_buffer_size().expect("PNG size")];
    let info = reader.next_frame(&mut pixels).expect("decode PNG");
    assert_eq!((info.width, info.height), (3, 3));
    for y in 0..3 {
        for x in 0..3 {
            let offset = (y * 3 + x) * 4;
            assert_eq!(
                &pixels[offset..offset + 4],
                &[42, (y + 3) as u8, (x + 5) as u8, 255]
            );
        }
    }
}

#[test]
fn one_pixel_screenshot_at_the_corner_is_not_expanded_or_shifted() {
    let cropped = crop_frame(
        frame(6, 4, 0),
        Some(region(5.0 / 6.0, 0.75, 1.0 / 6.0, 0.25)),
    )
    .expect("corner pixel");
    assert_eq!((cropped.width, cropped.height), (1, 1));
    assert_eq!(&*cropped.pixels, &[5, 3, 42, 255]);
}

#[test]
fn uncropped_and_full_frame_screenshots_share_the_original_pixel_buffer() {
    let source = frame(7, 5, 4);
    let no_region = crop_frame(source.clone(), None).expect("uncropped image");
    let full =
        crop_frame(source.clone(), Some(region(0.0, 0.0, 1.0, 1.0))).expect("odd full image");
    assert!(Arc::ptr_eq(&source.pixels, &no_region.pixels));
    assert!(Arc::ptr_eq(&source.pixels, &full.pixels));
    assert_eq!((full.width, full.height), (7, 5));
}

#[test]
fn screenshot_crop_uses_actual_frame_dimensions_at_different_display_scales() {
    for (width, height) in [(1000, 500), (1250, 625), (1500, 750), (2000, 1000)] {
        let crop = crop_frame(
            frame(width, height, 16),
            Some(region(0.201, 0.102, 0.501, 0.506)),
        )
        .expect("scaled image");
        let left = (0.201 * f64::from(width)).round() as u32;
        let top = (0.102 * f64::from(height)).round() as u32;
        let right = (0.702 * f64::from(width)).round() as u32;
        let bottom = (0.608 * f64::from(height)).round() as u32;
        assert_eq!((crop.width, crop.height), (right - left, bottom - top));
        assert_eq!(&crop.pixels[..4], &[left as u8, top as u8, 42, 255]);
        assert_eq!(
            &crop.pixels[crop.pixels.len() - 4..],
            &[(right - 1) as u8, (bottom - 1) as u8, 42, 255]
        );
    }
}

#[test]
fn invalid_crop_or_pixel_buffer_returns_an_error_without_panicking() {
    assert!(crop_frame(frame(4, 4, 0), Some(region(0.5, 0.5, 0.6, 0.5))).is_err());
    for mut source in [frame(0, 4, 0), frame(4, 0, 0), frame(4, 4, 0)] {
        source.pixels = Arc::from([]);
        assert!(crop_frame(source, Some(region(0.0, 0.0, 0.5, 0.5))).is_err());
    }
}
