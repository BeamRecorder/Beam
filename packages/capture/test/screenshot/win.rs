#![cfg(test)]
#![allow(clippy::expect_used)]

use super::crop_frame;
use crate::{
    model::ScreenRegion,
    screen::{OwnedVideoFrame, PixelFormat},
};
use std::sync::Arc;

#[test]
fn screenshot_crop_keeps_the_selected_bgra_pixels_and_stride() {
    let frame = OwnedVideoFrame {
        width: 2,
        height: 2,
        stride: 8,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from([1_u8, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    };
    let region = ScreenRegion {
        x: 0.5,
        y: 0.0,
        width: 0.5,
        height: 1.0,
    };
    let cropped = crop_frame(frame, region).expect("crop");
    assert_eq!((cropped.width, cropped.height, cropped.stride), (1, 2, 4));
    assert_eq!(cropped.pixels.as_ref(), &[5, 6, 7, 8, 13, 14, 15, 16]);
}
