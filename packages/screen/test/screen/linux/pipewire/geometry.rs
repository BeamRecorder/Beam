#![cfg(test)]

use std::sync::Arc;

use crate::{
    model::ScreenRegion,
    screen::{CursorSampleState, OwnedVideoFrame, PixelCrop, PixelFormat},
};

use super::super::geometry::{FrameGeometry, crop_frame, repaired_window_crop};
use super::super::{
    BufferLayout, CursorMetadata, CursorState, NativePixelFormat, VideoTransform, copy_frame,
};
use super::negotiated;

fn frame_with_stride(width: u32, height: u32, stride_pixels: usize) -> OwnedVideoFrame {
    let stride = stride_pixels * 4;
    let mut pixels = vec![0xee; stride * height as usize];
    for y in 0..height as usize {
        for x in 0..width as usize {
            let offset = y * stride + x * 4;
            pixels[offset..offset + 4].copy_from_slice(&[
                (y * width as usize + x + 1) as u8,
                0,
                0,
                255,
            ]);
        }
    }
    OwnedVideoFrame {
        width,
        height,
        stride,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(pixels),
    }
}

fn blue_values(frame: &OwnedVideoFrame) -> Vec<u8> {
    frame
        .pixels
        .as_chunks::<4>()
        .0
        .iter()
        .map(|pixel| pixel[0])
        .collect()
}

#[test]
fn crop_preserves_selected_pixels_and_rounds_dimensions_to_h264_pairs() {
    let frame = frame_with_stride(8, 6, 8);
    let region = ScreenRegion {
        x: 0.125,
        y: 1.0 / 6.0,
        width: 0.375,
        height: 0.5,
    };

    let (cropped, pixel_crop) = crop_frame(frame, Some(region)).expect("valid screen crop");

    assert_eq!((cropped.width, cropped.height), (2, 2));
    assert_eq!(cropped.stride, 2 * 4);
    assert_eq!(blue_values(&cropped), [10, 11, 18, 19]);
    assert_eq!(
        pixel_crop,
        Some(PixelCrop {
            start_x: 1,
            start_y: 1,
            end_x: 3,
            end_y: 3,
        })
    );
}

#[test]
fn crop_after_frame_copy_uses_source_stride_and_discards_padding() {
    let frame = frame_with_stride(4, 4, 6);
    let region = ScreenRegion {
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
    };

    let (cropped, _) = crop_frame(frame, Some(region)).expect("valid screen crop");

    assert_eq!((cropped.width, cropped.height, cropped.stride), (2, 2, 8));
    assert_eq!(blue_values(&cropped), [6, 7, 10, 11]);
    assert!(cropped.pixels.iter().all(|byte| *byte != 0xee));
}

#[test]
fn crop_uses_coordinates_after_pipewire_rotation() {
    let memory = [
        1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255, 7, 0,
        0, 255, 8, 0, 0, 255,
    ];
    let transformed = copy_frame(
        &memory,
        negotiated(NativePixelFormat::Bgra, 4, 2),
        BufferLayout {
            offset: 0,
            size: memory.len(),
            stride: 16,
            crop: None,
            transform: VideoTransform::Rotated90,
        },
    )
    .expect("valid rotated frame");
    let region = ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 0.5,
    };

    let (cropped, _) = crop_frame(transformed, Some(region)).expect("valid rotated crop");

    assert_eq!((cropped.width, cropped.height), (2, 2));
    assert_eq!(blue_values(&cropped), [4, 8, 3, 7]);
}

#[test]
fn one_pixel_edge_selection_expands_inward_to_an_even_crop() {
    let frame = frame_with_stride(6, 4, 6);
    let region = ScreenRegion {
        x: 5.0 / 6.0,
        y: 3.0 / 4.0,
        width: 1.0 / 6.0,
        height: 1.0 / 4.0,
    };

    let (cropped, pixel_crop) = crop_frame(frame, Some(region)).expect("valid edge crop");

    assert_eq!((cropped.width, cropped.height), (2, 2));
    assert_eq!(blue_values(&cropped), [17, 18, 23, 24]);
    assert_eq!(
        pixel_crop,
        Some(PixelCrop {
            start_x: 4,
            start_y: 2,
            end_x: 6,
            end_y: 4,
        })
    );
}

#[test]
fn frame_geometry_rebases_cursor_and_marks_positions_outside_region_invisible() {
    let format = negotiated(NativePixelFormat::Bgra, 8, 6);
    let frame = OwnedVideoFrame {
        width: 4,
        height: 4,
        stride: 4 * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(vec![0_u8; 4 * 4 * 4]),
    };
    let region_crop = PixelCrop {
        start_x: 2,
        start_y: 2,
        end_x: 6,
        end_y: 6,
    };
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        None,
        VideoTransform::Rotated90,
        Some(region_crop),
        &frame,
    );

    let mut state = CursorState::new("scope");
    let visible = state.resolve(
        geometry.map_cursor(
            Some(CursorMetadata {
                id: 17,
                shape_id: None,
                cursor_kind: None,
                x: 3,
                y: 4,
                hotspot: None,
            }),
            format,
        ),
        frame.width,
        frame.height,
    );
    assert!(matches!(
        visible,
        CursorSampleState::Known {
            pixel_x: 2,
            pixel_y: 2,
            normalized_x,
            normalized_y,
            visible: true,
            ..
        } if normalized_x == 0.5 && normalized_y == 0.5
    ));

    let outside = state.resolve(
        geometry.map_cursor(
            Some(CursorMetadata {
                id: 17,
                shape_id: None,
                cursor_kind: None,
                x: 3,
                y: 1,
                hotspot: None,
            }),
            format,
        ),
        frame.width,
        frame.height,
    );
    assert!(matches!(
        outside,
        CursorSampleState::Known {
            pixel_x: -1,
            pixel_y: 2,
            visible: false,
            ..
        }
    ));
}

#[test]
fn crop_rejects_frame_data_shorter_than_selected_rows() {
    let region = ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
    };
    let mut frame = frame_with_stride(4, 4, 4);
    frame.pixels = Arc::from(vec![0; 4]);
    let error = crop_frame(frame, Some(region)).expect_err("truncated source frame");
    assert_eq!(error.code(), "invalid-configuration");
    assert!(error.to_string().contains("exceeds the frame"));
}

#[test]
fn crop_none_returns_the_original_frame_unchanged() {
    let frame = frame_with_stride(4, 4, 6);
    let expected = frame.clone();
    let (result, crop) = crop_frame(frame, None).expect("uncropped frame");
    assert_eq!(result, expected);
    assert_eq!(crop, None);
}

#[test]
fn repaired_window_crop_requires_uniform_material_increase() {
    let reported = super::super::CropRect {
        x: 1,
        y: 2,
        width: 100,
        height: 80,
    };
    let content = super::super::CropRect {
        x: 3,
        y: 4,
        width: 120,
        height: 96,
    };
    assert_eq!(
        repaired_window_crop(Some(reported), Some(content)),
        Some(content)
    );
    assert_eq!(repaired_window_crop(Some(reported), None), Some(reported));
    assert_eq!(repaired_window_crop(None, Some(content)), None);
    let nonuniform = super::super::CropRect {
        width: 120,
        height: 104,
        ..content
    };
    assert_eq!(
        repaired_window_crop(Some(reported), Some(nonuniform)),
        Some(reported)
    );
    let too_small = super::super::CropRect {
        width: 105,
        height: 84,
        ..content
    };
    assert_eq!(
        repaired_window_crop(Some(reported), Some(too_small)),
        Some(reported)
    );
    let zero_reported = super::super::CropRect {
        width: 0,
        height: 0,
        ..reported
    };
    assert_eq!(
        repaired_window_crop(Some(zero_reported), Some(content)),
        Some(zero_reported)
    );
}

#[test]
fn geometry_rejects_invalid_cursor_crop_and_absent_cursor() {
    let format = negotiated(NativePixelFormat::Bgra, 8, 6);
    let frame = frame_with_stride(8, 6, 8);
    let invalid_crop = super::super::CropRect {
        x: 7,
        y: 0,
        width: 2,
        height: 6,
    };
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        Some(invalid_crop),
        VideoTransform::None,
        None,
        &frame,
    );
    let cursor = CursorMetadata {
        id: 1,
        shape_id: None,
        x: 1,
        y: 1,
        hotspot: None,
        cursor_kind: None,
    };
    assert!(geometry.map_cursor(None, format).is_none());
    assert!(geometry.map_cursor(Some(cursor), format).is_none());
    assert_eq!((geometry.width(), geometry.height()), (8, 6));
}

#[test]
fn cursor_coordinates_scale_between_different_frame_and_cursor_crops() {
    let format = negotiated(NativePixelFormat::Bgra, 8, 6);
    let frame = frame_with_stride(8, 6, 8);
    let cursor_crop = super::super::CropRect {
        x: 0,
        y: 0,
        width: 4,
        height: 3,
    };
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        Some(cursor_crop),
        VideoTransform::None,
        None,
        &frame,
    );
    let mapped = geometry
        .map_cursor(
            Some(CursorMetadata {
                id: 1,
                shape_id: None,
                x: 3,
                y: -1,
                hotspot: None,
                cursor_kind: None,
            }),
            format,
        )
        .expect("mapped cursor");
    assert_eq!((mapped.x, mapped.y), (6, -2));
}

#[test]
fn invalid_frame_crop_falls_back_to_owned_frame_dimensions() {
    let format = negotiated(NativePixelFormat::Bgra, 8, 6);
    let frame = frame_with_stride(8, 6, 8);
    let invalid = super::super::CropRect {
        x: 8,
        y: 0,
        width: 1,
        height: 6,
    };
    let geometry = FrameGeometry::from_frame(
        format,
        Some(invalid),
        None,
        VideoTransform::None,
        None,
        &frame,
    );
    assert_eq!((geometry.width(), geometry.height()), (8, 6));
    let cursor = CursorMetadata {
        id: 1,
        shape_id: None,
        x: 3,
        y: 2,
        hotspot: None,
        cursor_kind: None,
    };
    let mapped = geometry
        .map_cursor(Some(cursor), format)
        .expect("cursor mapped despite invalid frame crop");
    assert_eq!((mapped.x, mapped.y), (3, 2));
}

#[test]
fn extreme_cursor_scaling_saturates_to_i32_bounds() {
    let format = negotiated(NativePixelFormat::Bgra, 16_384, 1);
    let frame = OwnedVideoFrame {
        width: 16_384,
        height: 1,
        stride: 16_384 * 4,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(Vec::<u8>::new()),
    };
    let cursor_crop = super::super::CropRect {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
    };
    let geometry = FrameGeometry::from_frame(
        format,
        None,
        Some(cursor_crop),
        VideoTransform::None,
        None,
        &frame,
    );
    for (source, expected) in [(i32::MAX, i32::MAX), (i32::MIN, i32::MIN)] {
        let cursor = CursorMetadata {
            id: 1,
            shape_id: None,
            x: source,
            y: 0,
            hotspot: None,
            cursor_kind: None,
        };
        assert_eq!(
            geometry
                .map_cursor(Some(cursor), format)
                .expect("scaled cursor")
                .x,
            expected
        );
    }
}
