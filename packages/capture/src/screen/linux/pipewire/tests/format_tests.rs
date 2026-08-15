use super::*;

#[test]
fn converts_all_negotiated_formats_to_owned_bgra() {
    assert_eq!(
        copy_pixel(NativePixelFormat::Bgrx, &[1, 2, 3, 4]),
        [1, 2, 3, 255]
    );
    assert_eq!(
        copy_pixel(NativePixelFormat::Bgra, &[1, 2, 3, 4]),
        [1, 2, 3, 4]
    );
    assert_eq!(
        copy_pixel(NativePixelFormat::Rgbx, &[1, 2, 3, 4]),
        [3, 2, 1, 255]
    );
    assert_eq!(
        copy_pixel(NativePixelFormat::Rgba, &[1, 2, 3, 4]),
        [3, 2, 1, 4]
    );
}

#[test]
fn respects_positive_padding_and_negative_stride() {
    let memory = [1, 0, 0, 255, 9, 9, 9, 9, 2, 0, 0, 255, 8, 8, 8, 8];
    let positive = copy_frame(
        &memory,
        negotiated(NativePixelFormat::Bgra, 1, 2),
        layout(8, memory.len()),
    )
    .expect("positive stride");
    assert_eq!(&*positive.pixels, &[1, 0, 0, 255, 2, 0, 0, 255]);

    let negative = copy_frame(
        &memory,
        negotiated(NativePixelFormat::Bgra, 1, 2),
        layout(-8, memory.len()),
    )
    .expect("negative stride");
    assert_eq!(&*negative.pixels, &[2, 0, 0, 255, 1, 0, 0, 255]);
}

#[test]
fn rejects_invalid_dimensions_stride_ranges_and_crop() {
    for (width, height) in [(0, 1), (1, 0), (MAX_VIDEO_DIMENSION + 1, 1)] {
        assert!(NegotiatedFormat::new(width, height, NativePixelFormat::Bgra).is_err());
    }
    let format = negotiated(NativePixelFormat::Bgra, 2, 2);
    assert!(copy_frame(&[0; 16], format, layout(4, 16)).is_err());
    assert!(copy_frame(&[0; 16], format, layout(8, 15)).is_err());
    assert!(
        copy_frame(
            &[0; 16],
            format,
            BufferLayout {
                crop: Some(CropRect {
                    x: 1,
                    y: 1,
                    width: 2,
                    height: 2,
                }),
                ..layout(8, 16)
            },
        )
        .is_err()
    );
}

#[test]
fn applies_crop_and_each_transform_without_borrowing_input() {
    let memory = [
        1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
    ];
    let crop = Some(CropRect {
        x: 1,
        y: 0,
        width: 2,
        height: 2,
    });
    let cases = [
        (VideoTransform::None, 2, 2, vec![2, 3, 5, 6]),
        (VideoTransform::Rotated90, 2, 2, vec![3, 6, 2, 5]),
        (VideoTransform::Rotated180, 2, 2, vec![6, 5, 3, 2]),
        (VideoTransform::Rotated270, 2, 2, vec![5, 2, 6, 3]),
        (VideoTransform::Flipped, 2, 2, vec![3, 2, 6, 5]),
        (VideoTransform::Flipped90, 2, 2, vec![2, 5, 3, 6]),
        (VideoTransform::Flipped180, 2, 2, vec![5, 6, 2, 3]),
        (VideoTransform::Flipped270, 2, 2, vec![6, 3, 5, 2]),
    ];
    for (transform, width, height, expected_blue) in cases {
        let frame = copy_frame(
            &memory,
            negotiated(NativePixelFormat::Bgra, 3, 2),
            BufferLayout {
                crop,
                transform,
                ..layout(12, memory.len())
            },
        )
        .expect("transform should copy");
        assert_eq!((frame.width, frame.height), (width, height));
        assert_eq!(
            frame
                .pixels
                .chunks_exact(4)
                .map(|pixel| pixel[0])
                .collect::<Vec<_>>(),
            expected_blue
        );
    }
}

#[test]
fn expands_reported_window_crop_to_non_zero_content_and_repairs_it() {
    let format = negotiated(NativePixelFormat::Bgra, 6, 4);
    let reported = CropRect {
        x: 0,
        y: 0,
        width: 3,
        height: 2,
    };
    let mut memory = vec![0_u8; 6 * 4 * 4];
    for (x, y) in [(0, 0), (5, 3)] {
        let offset = (y * 6 + x) * 4;
        memory[offset..offset + 4].copy_from_slice(&[1, 2, 3, 255]);
    }
    let layout = BufferLayout {
        crop: Some(reported),
        ..layout(6 * 4, memory.len())
    };

    let expanded = expand_crop_to_content(&memory, format, layout).expect("content crop");
    assert_eq!(
        expanded,
        Some(CropRect {
            x: 0,
            y: 0,
            width: 6,
            height: 4,
        })
    );
    assert_eq!(
        repaired_window_crop(Some(reported), expanded),
        Some(CropRect {
            x: 0,
            y: 0,
            width: 6,
            height: 4,
        })
    );
}

#[test]
fn keeps_reported_crop_when_padding_is_zero() {
    let format = negotiated(NativePixelFormat::Bgra, 6, 4);
    let reported = CropRect {
        x: 0,
        y: 0,
        width: 3,
        height: 2,
    };
    let mut memory = vec![0_u8; 6 * 4 * 4];
    for y in 0..reported.height {
        for x in 0..reported.width {
            let offset = usize::try_from((y * 6 + x) * 4).expect("pixel offset");
            memory[offset..offset + 4].copy_from_slice(&[1, 2, 3, 255]);
        }
    }
    let layout = BufferLayout {
        crop: Some(reported),
        ..layout(6 * 4, memory.len())
    };

    let expanded = expand_crop_to_content(&memory, format, layout).expect("content crop");
    assert_eq!(expanded, Some(reported));
    assert_eq!(
        repaired_window_crop(Some(reported), expanded),
        Some(reported)
    );
}

#[test]
fn rejects_small_or_non_uniform_crop_expansions() {
    let reported = CropRect {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    };
    assert_eq!(
        repaired_window_crop(
            Some(reported),
            Some(CropRect {
                width: 105,
                height: 105,
                ..reported
            }),
        ),
        Some(reported)
    );
    assert_eq!(
        repaired_window_crop(
            Some(reported),
            Some(CropRect {
                width: 120,
                height: 100,
                ..reported
            }),
        ),
        Some(reported)
    );
}
