#![cfg(test)]

use std::mem::size_of;

use super::{CURSOR_META_SIZE, stable_cursor_shape_id, validated_cursor_bitmap_range};

#[test]
fn cursor_bitmap_range_accepts_minimum_and_maximum_geometry_at_exact_boundary() {
    let cursor_header = size_of::<pipewire::spa::sys::spa_meta_cursor>();
    let bitmap_header = size_of::<pipewire::spa::sys::spa_meta_bitmap>();
    let minimum =
        validated_cursor_bitmap_range(cursor_header, bitmap_header, bitmap_header, 1, 1, 4);
    assert_eq!(
        minimum,
        Some(cursor_header + bitmap_header..cursor_header + bitmap_header + 4)
    );
    assert!(
        validated_cursor_bitmap_range(cursor_header, bitmap_header, bitmap_header, 1, 384, 4)
            .is_some()
    );

    let stride = 384 * 4;
    let data_offset = CURSOR_META_SIZE - cursor_header - stride;
    let maximum =
        validated_cursor_bitmap_range(cursor_header, bitmap_header, data_offset, 384, 1, stride);
    assert_eq!(maximum, Some(CURSOR_META_SIZE - stride..CURSOR_META_SIZE));
    assert!(
        validated_cursor_bitmap_range(
            cursor_header,
            bitmap_header,
            data_offset + 1,
            384,
            1,
            stride
        )
        .is_none()
    );
}

#[test]
fn cursor_bitmap_range_rejects_invalid_headers_geometry_and_strides() {
    let cursor_header = size_of::<pipewire::spa::sys::spa_meta_cursor>();
    let bitmap_header = size_of::<pipewire::spa::sys::spa_meta_bitmap>();
    let valid = (cursor_header, bitmap_header, bitmap_header, 2, 2, 8);
    let invalid = [
        (
            cursor_header - 1,
            valid.1,
            valid.2,
            valid.3,
            valid.4,
            valid.5,
        ),
        (
            CURSOR_META_SIZE - bitmap_header + 1,
            valid.1,
            valid.2,
            valid.3,
            valid.4,
            valid.5,
        ),
        (
            valid.0,
            valid.1,
            bitmap_header - 1,
            valid.3,
            valid.4,
            valid.5,
        ),
        (valid.0, valid.1, valid.2, 0, valid.4, valid.5),
        (valid.0, valid.1, valid.2, 385, valid.4, valid.5),
        (valid.0, valid.1, valid.2, valid.3, 0, valid.5),
        (valid.0, valid.1, valid.2, valid.3, 385, valid.5),
        (valid.0, valid.1, valid.2, valid.3, valid.4, 7),
    ];
    assert!(
        validated_cursor_bitmap_range(valid.0, valid.1, valid.2, valid.3, valid.4, valid.5)
            .is_some()
    );
    for (cursor_offset, bitmap_meta_size, data_offset, width, height, stride) in invalid {
        assert!(
            validated_cursor_bitmap_range(
                cursor_offset,
                bitmap_meta_size,
                data_offset,
                width,
                height,
                stride
            )
            .is_none()
        );
    }
}

#[test]
fn cursor_bitmap_range_rejects_checked_add_and_multiply_overflow() {
    let cursor_header = size_of::<pipewire::spa::sys::spa_meta_cursor>();
    let bitmap_header = size_of::<pipewire::spa::sys::spa_meta_bitmap>();
    assert!(
        validated_cursor_bitmap_range(usize::MAX, bitmap_header, bitmap_header, 1, 1, 4).is_none()
    );
    assert!(
        validated_cursor_bitmap_range(cursor_header, bitmap_header, usize::MAX, 1, 1, 4).is_none()
    );
    assert!(
        validated_cursor_bitmap_range(
            cursor_header,
            bitmap_header,
            bitmap_header,
            1,
            384,
            usize::MAX
        )
        .is_none()
    );
}

#[test]
fn cursor_shape_identity_includes_format_geometry_stride_and_pixel_content() {
    let base = stable_cursor_shape_id(1, 2, 1, 8, &[0; 8]);
    assert_ne!(base, 0);
    assert_eq!(base, stable_cursor_shape_id(1, 2, 1, 8, &[0; 8]));
    assert_ne!(base, stable_cursor_shape_id(2, 2, 1, 8, &[0; 8]));
    assert_ne!(base, stable_cursor_shape_id(1, 3, 1, 8, &[0; 8]));
    assert_ne!(base, stable_cursor_shape_id(1, 2, 2, 8, &[0; 8]));
    assert_ne!(base, stable_cursor_shape_id(1, 2, 1, 12, &[0; 8]));
    assert_ne!(base, stable_cursor_shape_id(1, 2, 1, 8, &[1; 8]));
}

#[test]
fn maximum_cursor_bitmap_fits_exactly_with_native_headers() {
    let cursor_header = size_of::<pipewire::spa::sys::spa_meta_cursor>();
    let bitmap_header = size_of::<pipewire::spa::sys::spa_meta_bitmap>();
    let pixels_start = cursor_header + bitmap_header;
    let stride = 384 * 4;
    assert_eq!(
        validated_cursor_bitmap_range(
            cursor_header,
            bitmap_header,
            bitmap_header,
            384,
            384,
            stride
        ),
        Some(pixels_start..CURSOR_META_SIZE)
    );
    assert!(
        validated_cursor_bitmap_range(
            cursor_header,
            bitmap_header,
            bitmap_header,
            384,
            384,
            stride + 1
        )
        .is_none()
    );
}
