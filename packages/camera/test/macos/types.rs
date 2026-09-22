#![cfg(test)]

use super::*;
use crate::PixelFormat;

#[test]
fn owned_sample_keeps_native_timestamp_and_format() {
    let sample = OwnedSample {
        format: CameraFormat {
            width: 1,
            height: 1,
            fps: 30,
            pixel_format: PixelFormat::Bgra,
            stride: 4,
        },
        native_timestamp_ns: Some(42),
        sequence: 3,
        bytes: vec![1, 2, 3, 4],
    };
    assert_eq!(sample.native_timestamp_ns, Some(42));
    assert_eq!(sample.bytes.len(), 4);
}
