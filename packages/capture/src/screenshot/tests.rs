#![allow(clippy::expect_used)]

use std::{path::PathBuf, sync::Arc};

use super::{ScreenshotRequest, capture, rgba_pixels};
use crate::{
    CaptureError,
    model::{PortalSourceKind, ScreenRegion, ScreenSelection, SourceId},
    screen::{OwnedVideoFrame, PixelFormat},
};

fn frame(width: u32, height: u32, stride: usize, pixels: impl Into<Vec<u8>>) -> OwnedVideoFrame {
    OwnedVideoFrame {
        width,
        height,
        stride,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(pixels.into()),
    }
}

fn request(output: &str, region: Option<ScreenRegion>) -> ScreenshotRequest {
    ScreenshotRequest {
        screen: ScreenSelection::Portal {
            kind: PortalSourceKind::Monitor,
            restore_token: None,
        },
        region,
        output: PathBuf::from(output),
        excluded_window_handles: Vec::new(),
    }
}

#[test]
fn rgba_pixels_reorders_bgra_channels_and_writes_opaque_alpha() {
    let input = frame(2, 1, 8, vec![10, 20, 30, 40, 50, 60, 70, 80]);

    let output = rgba_pixels(&input).expect("valid BGRA frame");

    assert_eq!(output, [30, 20, 10, 255, 70, 60, 50, 255]);
}

#[test]
fn rgba_pixels_skips_padding_at_the_end_of_each_row() {
    let input = frame(
        1,
        2,
        8,
        vec![10, 20, 30, 40, 90, 91, 92, 93, 1, 2, 3, 4, 80, 81, 82, 83],
    );

    let output = rgba_pixels(&input).expect("valid padded BGRA frame");

    assert_eq!(output, [30, 20, 10, 255, 3, 2, 1, 255]);
}

#[test]
fn rgba_pixels_rejects_zero_and_oversized_dimensions() {
    let invalid_frames = [
        frame(0, 1, 0, Vec::new()),
        frame(1, 0, 4, Vec::new()),
        frame(16_385, 1, 16_385 * 4, Vec::new()),
        frame(8_193, 8_193, 8_193 * 4, Vec::new()),
    ];

    for input in invalid_frames {
        assert!(matches!(rgba_pixels(&input), Err(CaptureError::Backend(_))));
    }
}

#[test]
fn rgba_pixels_rejects_short_stride_and_incomplete_pixel_buffers() {
    let short_stride = frame(2, 1, 7, vec![0; 7]);
    let short_buffer = frame(1, 2, 4, vec![0; 7]);
    let incomplete_padded_buffer = frame(1, 2, 8, vec![0; 15]);

    for input in [short_stride, short_buffer, incomplete_padded_buffer] {
        assert!(matches!(rgba_pixels(&input), Err(CaptureError::Backend(_))));
    }
}

#[test]
fn rgba_pixels_rejects_stride_height_size_overflow() {
    let input = frame(1, 2, usize::MAX, Vec::new());

    assert!(matches!(rgba_pixels(&input), Err(CaptureError::Backend(_))));
}

#[test]
fn screenshot_capture_rejects_non_png_output_before_opening_a_capture_backend() {
    for output in ["capture.webp", "capture", "capture.PNG"] {
        let error =
            capture(request(output, None)).expect_err("non-PNG output must fail validation");
        assert!(
            matches!(error, CaptureError::InvalidConfiguration(message) if message.contains("must be PNG"))
        );
    }
}

#[test]
fn screenshot_capture_rejects_invalid_regions_before_opening_a_capture_backend() {
    let region = ScreenRegion {
        x: 0.8,
        y: 0.2,
        width: 0.3,
        height: 0.4,
    };

    let error = capture(request("capture.png", Some(region)))
        .expect_err("an out-of-bounds region must fail before native capture");

    assert!(
        matches!(error, CaptureError::InvalidConfiguration(message) if message.contains("finite rectangle"))
    );
}

#[test]
fn screenshot_request_round_trips_through_the_capture_engine_json_shape() {
    let original = ScreenshotRequest {
        screen: ScreenSelection::Source {
            source_id: SourceId::new("sck:display:42").expect("valid test source id"),
        },
        region: Some(ScreenRegion {
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.6,
        }),
        output: PathBuf::from("/tmp/beam screenshot.png"),
        excluded_window_handles: vec!["1234".into(), "5678".into()],
    };

    let encoded = serde_json::to_vec(&original).expect("serialize screenshot request");
    let decoded: ScreenshotRequest =
        serde_json::from_slice(&encoded).expect("deserialize screenshot request");

    assert_eq!(
        serde_json::to_value(decoded).expect("serialize decoded request"),
        serde_json::to_value(original).expect("serialize original request"),
    );
}

#[test]
fn fast_png_encoding_preserves_pixels_and_commits_the_output() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let output = directory.path().join("source.png");
    let input = frame(2, 1, 8, vec![10, 20, 30, 0, 50, 60, 70, 255]);
    let dimensions = super::write_png(&input, &output).expect("encode PNG");
    assert_eq!((dimensions.width, dimensions.height), (2, 1));
    assert!(!output.with_extension("png.tmp").exists());
    let file = std::io::BufReader::new(std::fs::File::open(output).expect("source file"));
    let mut reader = png::Decoder::new(file).read_info().expect("PNG header");
    let mut pixels = vec![0; reader.output_buffer_size().expect("bounded PNG")];
    let info = reader.next_frame(&mut pixels).expect("PNG pixels");
    assert_eq!(
        &pixels[..info.buffer_size()],
        &[30, 20, 10, 255, 70, 60, 50, 255]
    );
}

#[test]
fn png_write_rejects_invalid_frames_without_creating_files() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let output = directory.path().join("source.png");
    assert!(super::write_png(&frame(0, 1, 0, vec![]), &output).is_err());
    assert!(!output.exists());
    assert!(!output.with_extension("png.tmp").exists());
}

#[test]
fn png_write_cleans_temporary_output_if_publication_fails() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let output = directory.path().join("source.png");
    std::fs::create_dir(&output).expect("directory blocking rename");
    assert!(super::write_png(&frame(1, 1, 4, vec![1, 2, 3, 4]), &output).is_err());
    assert!(output.is_dir());
    assert!(!output.with_extension("png.tmp").exists());
}
