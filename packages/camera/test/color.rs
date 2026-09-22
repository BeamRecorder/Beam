#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraError, CameraFormat, CameraFrame, PixelFormat};

fn frame(pixel_format: PixelFormat, stride: u32, data: &[u8]) -> CameraFrame {
    CameraFrame {
        format: CameraFormat {
            width: 2,
            height: 2,
            fps: 30,
            pixel_format,
            stride,
        },
        native_timestamp_ns: None,
        sequence: 1,
        data: Arc::from(data),
    }
}

#[test]
fn bgra_rows_convert_to_rgba_without_losing_alpha() {
    let input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    let output = frame(PixelFormat::Bgra, 8, &input).to_rgba().expect("RGBA");
    assert_eq!(&output[..8], &[3, 2, 1, 4, 7, 6, 5, 8]);
    assert_eq!(&output[8..], &[11, 10, 9, 12, 15, 14, 13, 16]);
}

#[test]
fn last_camera_row_does_not_require_unused_padding() {
    let input = [
        1, 2, 3, 255, 4, 5, 6, 255, 0, 0, 0, 0, 7, 8, 9, 255, 10, 11, 12, 255,
    ];
    let output = frame(PixelFormat::Bgra, 12, &input)
        .to_rgba()
        .expect("RGBA");
    assert_eq!(&output[8..12], &[9, 8, 7, 255]);
}

#[test]
fn yuyv_neutral_chroma_produces_gray_pixels() {
    let input = [16, 128, 235, 128, 16, 128, 235, 128];
    let output = frame(PixelFormat::Yuyv, 4, &input).to_rgba().expect("RGBA");
    assert_eq!(&output[..4], &[0, 0, 0, 255]);
    assert_eq!(&output[4..8], &[255, 255, 255, 255]);
}

#[test]
fn nv12_uses_shared_chroma_for_each_two_by_two_block() {
    let input = [16, 235, 81, 145, 128, 128];
    let output = frame(PixelFormat::Nv12, 2, &input).to_rgba().expect("RGBA");
    assert_eq!(&output[..4], &[0, 0, 0, 255]);
    assert_eq!(&output[4..8], &[255, 255, 255, 255]);
    assert_eq!(output.len(), 16);
}

#[test]
fn mjpeg_decodes_a_real_jpeg_without_changing_dimensions() {
    let mut encoded = Vec::new();
    jpeg_encoder::Encoder::new(&mut encoded, 100)
        .encode(
            &[220, 40, 20, 220, 40, 20, 220, 40, 20, 220, 40, 20],
            2,
            2,
            jpeg_encoder::ColorType::Rgb,
        )
        .expect("JPEG encode");
    let rgba = frame(PixelFormat::Mjpeg, 0, &encoded)
        .to_rgba()
        .expect("JPEG decode");
    assert_eq!(rgba.len(), 16);
    assert!(rgba.chunks_exact(4).all(|pixel| pixel[3] == 255));
    assert!(rgba[0] > 150 && rgba[1] < 100 && rgba[2] < 100);
}

#[test]
fn monochrome_mjpeg_expands_each_pixel_to_opaque_rgba() {
    let mut encoded = Vec::new();
    jpeg_encoder::Encoder::new(&mut encoded, 100)
        .encode(&[32, 96, 160, 224], 2, 2, jpeg_encoder::ColorType::Luma)
        .expect("monochrome JPEG encode");
    let rgba = frame(PixelFormat::Mjpeg, 0, &encoded)
        .to_rgba()
        .expect("monochrome JPEG decode");
    assert_eq!(rgba.len(), 16);
    for pixel in rgba.chunks_exact(4) {
        assert_eq!(pixel[0], pixel[1]);
        assert_eq!(pixel[1], pixel[2]);
        assert_eq!(pixel[3], 255);
    }
    assert!(rgba[0] < rgba[4] && rgba[4] < rgba[8] && rgba[8] < rgba[12]);
}

#[test]
fn truncated_and_unsupported_frames_fail_explicitly() {
    assert!(matches!(
        frame(PixelFormat::Bgra, 8, &[0; 4]).to_rgba(),
        Err(CameraError::InvalidBuffer(_))
    ));
    assert!(matches!(
        frame(PixelFormat::Mjpeg, 0, &[1, 2, 3]).to_rgba(),
        Err(CameraError::InvalidBuffer(_))
    ));
}

#[test]
fn padded_bgra_rows_ignore_padding_and_trailing_bytes() {
    let input = [
        10, 20, 30, 40, 50, 60, 70, 80, 99, 98, 90, 100, 110, 120, 130, 140, 150, 160, 97, 96, 95,
    ];
    let output = frame(PixelFormat::Bgra, 10, &input)
        .to_rgba()
        .expect("RGBA");
    assert_eq!(
        output,
        [
            30, 20, 10, 40, 70, 60, 50, 80, 110, 100, 90, 120, 150, 140, 130, 160
        ]
    );
}

#[test]
fn invalid_dimensions_and_row_shapes_return_descriptive_errors() {
    for (format, input, detail) in [
        (
            CameraFormat {
                width: 0,
                height: 2,
                fps: 30,
                pixel_format: PixelFormat::Bgra,
                stride: 8,
            },
            vec![0; 16],
            "zero frame dimensions",
        ),
        (
            CameraFormat {
                width: 2,
                height: 0,
                fps: 30,
                pixel_format: PixelFormat::Bgra,
                stride: 8,
            },
            vec![],
            "zero frame dimensions",
        ),
        (
            CameraFormat {
                width: 2,
                height: 2,
                fps: 30,
                pixel_format: PixelFormat::Bgra,
                stride: 7,
            },
            vec![0; 16],
            "stride",
        ),
        (
            CameraFormat {
                width: 2,
                height: 2,
                fps: 30,
                pixel_format: PixelFormat::Bgra,
                stride: 8,
            },
            vec![0; 15],
            "shorter",
        ),
        (
            CameraFormat {
                width: 3,
                height: 2,
                fps: 30,
                pixel_format: PixelFormat::Yuyv,
                stride: 6,
            },
            vec![0; 12],
            "YUYV width",
        ),
        (
            CameraFormat {
                width: 2,
                height: 3,
                fps: 30,
                pixel_format: PixelFormat::Nv12,
                stride: 2,
            },
            vec![0; 9],
            "NV12 dimensions",
        ),
    ] {
        let camera = CameraFrame {
            format,
            native_timestamp_ns: None,
            sequence: 0,
            data: Arc::from(input),
        };
        let error = camera.to_rgba().expect_err(detail);
        assert!(matches!(error, CameraError::InvalidBuffer(_)));
        assert!(error.to_string().contains(detail), "{error}");
    }
}

#[test]
fn yuyv_handles_chroma_and_row_padding_without_crossing_rows() {
    let input = [81, 90, 145, 240, 1, 2, 145, 54, 81, 34];
    let camera = CameraFrame {
        format: CameraFormat {
            width: 2,
            height: 2,
            fps: 30,
            pixel_format: PixelFormat::Yuyv,
            stride: 6,
        },
        native_timestamp_ns: None,
        sequence: 0,
        data: Arc::from(input),
    };
    let rgba = camera.to_rgba().expect("padded YUYV");
    assert!(
        rgba[0] > 200 && rgba[1] < 100 && rgba[2] < 100,
        "first row should be red: {rgba:?}"
    );
    assert!(
        rgba[8] < 100 && rgba[9] > 200 && rgba[10] < 100,
        "second row should be green: {rgba:?}"
    );
    assert!(rgba.chunks_exact(4).all(|pixel| pixel[3] == 255));
}

#[test]
fn nv12_uses_each_chroma_cell_for_its_own_two_by_two_block() {
    let mut input = vec![81; 4 * 4];
    input.extend_from_slice(&[90, 240, 54, 34, 90, 240, 54, 34]);
    let camera = CameraFrame {
        format: CameraFormat {
            width: 4,
            height: 4,
            fps: 30,
            pixel_format: PixelFormat::Nv12,
            stride: 4,
        },
        native_timestamp_ns: None,
        sequence: 0,
        data: Arc::from(input),
    };
    let rgba = camera.to_rgba().expect("NV12 chroma blocks");
    let pixel = |x: usize, y: usize| &rgba[(y * 4 + x) * 4..(y * 4 + x + 1) * 4];
    assert_eq!(pixel(0, 0), pixel(1, 1));
    assert_eq!(pixel(2, 0), pixel(3, 1));
    assert_eq!(pixel(0, 0), pixel(0, 2));
    assert_ne!(pixel(0, 0), pixel(2, 0));
    assert_eq!(pixel(0, 0)[3], 255);
}

#[test]
fn nv12_rejects_missing_chroma_and_insufficient_stride() {
    for (stride, input, detail) in [(1, vec![0; 8], "stride"), (2, vec![0; 5], "shorter")] {
        let error = frame(PixelFormat::Nv12, stride, &input)
            .to_rgba()
            .expect_err(detail);
        assert!(matches!(error, CameraError::InvalidBuffer(_)));
        assert!(error.to_string().contains(detail));
    }
}

#[test]
fn yuyv_rejects_missing_pair_bytes_and_insufficient_stride() {
    for (stride, input, detail) in [(3, vec![0; 8], "stride"), (4, vec![0; 7], "shorter")] {
        let error = frame(PixelFormat::Yuyv, stride, &input)
            .to_rgba()
            .expect_err(detail);
        assert!(matches!(error, CameraError::InvalidBuffer(_)));
        assert!(error.to_string().contains(detail));
    }
}

#[test]
fn mjpeg_rejects_a_valid_image_with_different_dimensions() {
    let mut encoded = Vec::new();
    jpeg_encoder::Encoder::new(&mut encoded, 90)
        .encode(&[255, 0, 0], 1, 1, jpeg_encoder::ColorType::Rgb)
        .expect("encode one pixel");
    let error = frame(PixelFormat::Mjpeg, 0, &encoded)
        .to_rgba()
        .expect_err("mismatch");
    assert!(matches!(error, CameraError::InvalidBuffer(_)));
    assert!(error.to_string().contains("dimensions differ"));
}

#[test]
fn mjpeg_rejects_unsupported_cmyk_pixels() {
    let mut encoded = Vec::new();
    jpeg_encoder::Encoder::new(&mut encoded, 90)
        .encode(
            &[
                0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0,
            ],
            2,
            2,
            jpeg_encoder::ColorType::Cmyk,
        )
        .expect("encode CMYK");
    let error = frame(PixelFormat::Mjpeg, 0, &encoded)
        .to_rgba()
        .expect_err("CMYK is unsupported");
    assert!(matches!(error, CameraError::UnsupportedFormat(_)));
}
