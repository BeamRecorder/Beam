#![allow(clippy::expect_used)]

use std::io::Cursor;

use super::*;

fn arrow(side: u32, angle: f64, scale: f64, offset: (f64, f64)) -> Vec<u8> {
    let (sine, cosine) = angle.to_radians().sin_cos();
    bitmap(side, |x, y| {
        let x = (x - f64::from(side) / 2.0 - offset.0) / scale;
        let y = (y - f64::from(side) / 2.0 - offset.1) / scale;
        let along = (x * cosine + y * sine).abs();
        let across = (-x * sine + y * cosine).abs();
        (along <= 10.0 && across <= 1.25)
            || ((10.0..=16.0).contains(&along) && across <= 16.0 - along)
    })
}

fn bitmap(side: u32, opaque: impl Fn(f64, f64) -> bool) -> Vec<u8> {
    let mut pixels = vec![0; (side * side * 4) as usize];
    for y in 0..side {
        for x in 0..side {
            if opaque(f64::from(x) + 0.5, f64::from(y) + 0.5) {
                pixels[((y * side + x) * 4 + 3) as usize] = 255;
            }
        }
    }
    pixels
}

pub(crate) fn figma_bitmap() -> (u32, u32, Vec<u8>) {
    let bytes = include_bytes!("../../tests/fixtures/cursor/figma-resize.png");
    decode_png(bytes)
}

fn decode_png(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let mut reader = png::Decoder::new(Cursor::new(bytes))
        .read_info()
        .expect("PNG header");
    let mut pixels = vec![0; reader.output_buffer_size().expect("PNG buffer size")];
    let info = reader.next_frame(&mut pixels).expect("PNG pixels");
    assert_eq!(info.color_type, png::ColorType::Rgba);
    pixels.truncate(info.buffer_size());
    (info.width, info.height, pixels)
}

#[test]
fn recognizes_real_figma_at_standard_and_retina_sizes() {
    for bytes in [
        include_bytes!("../../tests/fixtures/cursor/figma-resize-32.png").as_slice(),
        include_bytes!("../../tests/fixtures/cursor/figma-resize-80.png").as_slice(),
    ] {
        let (width, height, pixels) = decode_png(bytes);
        assert_eq!(
            resize_cursor_kind(
                &pixels,
                width,
                height,
                Hotspot {
                    x: width / 2,
                    y: height / 2
                }
            ),
            Some(CursorKind::Resizenorthwestsoutheast),
            "bitmap={width}x{height}"
        );
    }
}

#[test]
fn recognizes_real_figma_resize_artwork_and_opposite_diagonal() {
    let (width, height, pixels) = figma_bitmap();
    let hotspot = Hotspot { x: 20, y: 20 };
    assert_eq!(
        resize_cursor_kind(&pixels, width, height, hotspot),
        Some(CursorKind::Resizenorthwestsoutheast)
    );
    let mut reflected = pixels.clone();
    for y in 0..height {
        for x in 0..width {
            let source = ((y * width + x) * 4) as usize;
            let target = ((y * width + width - 1 - x) * 4) as usize;
            reflected[target..target + 4].copy_from_slice(&pixels[source..source + 4]);
        }
    }
    assert_eq!(
        resize_cursor_kind(&reflected, width, height, hotspot),
        Some(CursorKind::Resizenortheastsouthwest)
    );
}

#[test]
fn recognizes_all_four_axes_at_multiple_device_scales() {
    for scale in [0.75, 1.0, 1.25, 2.0, 3.0] {
        for (angle, kind) in [
            (0.0, CursorKind::Resizewesteast),
            (45.0, CursorKind::Resizenorthwestsoutheast),
            (90.0, CursorKind::Resizenorthsouth),
            (-45.0, CursorKind::Resizenortheastsouthwest),
        ] {
            let pixels = arrow(128, angle, scale, (0.0, 0.0));
            assert_eq!(
                resize_cursor_kind(&pixels, 128, 128, Hotspot { x: 64, y: 64 }),
                Some(kind),
                "angle={angle}, scale={scale}"
            );
        }
    }
}

#[test]
fn quantizes_rotated_object_handles_to_the_closest_axis() {
    for (angle, kind) in [
        (13.0, CursorKind::Resizewesteast),
        (60.0, CursorKind::Resizenorthwestsoutheast),
        (105.0, CursorKind::Resizenorthsouth),
        (145.0, CursorKind::Resizenortheastsouthwest),
        (-60.0, CursorKind::Resizenortheastsouthwest),
    ] {
        assert_eq!(
            resize_cursor_kind(
                &arrow(64, angle, 1.5, (0.0, 0.0)),
                64,
                64,
                Hotspot { x: 32, y: 32 }
            ),
            Some(kind),
            "angle={angle}"
        );
    }
}

#[test]
fn ignores_transparent_padding_rgb_colors_and_soft_shadows() {
    let mut pixels = arrow(96, 0.0, 1.0, (8.0, -12.0));
    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel[..3].fill(255);
        if pixel[3] == 0 {
            pixel[3] = 127;
        }
    }
    assert_eq!(
        resize_cursor_kind(&pixels, 96, 96, Hotspot { x: 56, y: 36 }),
        Some(CursorKind::Resizewesteast)
    );
}

#[test]
fn preserves_unknown_pointers_text_beams_crosses_ovals_and_solid_images() {
    let shapes: Vec<Vec<u8>> = vec![
        bitmap(48, |x, y| {
            (10.0..=38.0).contains(&x) && (y - 24.0).abs() <= (x - 10.0) / 3.0
        }),
        bitmap(48, |x, y| {
            (y - 24.0).abs() <= 16.0
                && ((x - 24.0).abs() <= 1.5
                    || ((y - 24.0).abs() >= 13.0 && (x - 24.0).abs() <= 7.0))
        }),
        bitmap(48, |x, y| {
            (x - 24.0).abs() <= 2.0 || (y - 24.0).abs() <= 2.0
        }),
        bitmap(48, |x, y| {
            ((x - 24.0) / 16.0).powi(2) + ((y - 24.0) / 5.0).powi(2) <= 1.0
        }),
        vec![255; 48 * 48 * 4],
    ];
    for pixels in shapes {
        assert_eq!(
            resize_cursor_kind(&pixels, 48, 48, Hotspot { x: 24, y: 24 }),
            None
        );
    }
}

#[test]
fn rejects_truncated_excessive_zero_or_transparent_bitmaps() {
    for (width, height, pixels) in [
        (0, 48, vec![]),
        (48, 0, vec![]),
        (u32::MAX, u32::MAX, vec![]),
        (257, 257, vec![255; 257 * 257 * 4]),
        (48, 48, vec![255; 48 * 48 * 4 - 1]),
        (48, 48, vec![0; 48 * 48 * 4]),
    ] {
        assert_eq!(
            resize_cursor_kind(&pixels, width, height, Hotspot { x: 0, y: 0 }),
            None
        );
    }
    assert_eq!(
        resize_cursor_kind(&[255; 4 * 4 * 4], 4, 4, Hotspot { x: 2, y: 2 }),
        None
    );
}

#[test]
fn rejects_off_center_and_out_of_bounds_hotspots() {
    let pixels = arrow(48, 0.0, 1.0, (0.0, 0.0));
    for hotspot in [
        Hotspot { x: 0, y: 0 },
        Hotspot { x: 24, y: 35 },
        Hotspot { x: 48, y: 24 },
        Hotspot { x: 24, y: 48 },
    ] {
        assert_eq!(resize_cursor_kind(&pixels, 48, 48, hotspot), None);
    }
}

#[test]
fn profile_requires_two_tapered_heads_and_a_narrow_shaft() {
    let widths = [
        1.0, 3.0, 5.0, 7.0, 9.0, 7.0, 3.0, 3.0, 3.0, 3.0, 7.0, 9.0, 7.0, 5.0, 3.0, 1.0,
    ];
    let minimum = widths.map(|width| -width / 2.0);
    let maximum = widths.map(|width| width / 2.0);
    assert!(double_arrow_profile(&minimum, &maximum, 32.0));
    let mut broken = maximum;
    broken[7] = 12.0;
    assert!(!double_arrow_profile(&minimum, &broken, 32.0));
    broken = maximum;
    broken[0] = 12.0;
    assert!(!double_arrow_profile(&minimum, &broken, 32.0));
}

#[test]
fn profile_rejects_missing_pixels_and_asymmetric_heads() {
    let minimum = [-2.0; BINS];
    let mut maximum = [2.0; BINS];
    maximum[4] = f64::NEG_INFINITY;
    assert!(!double_arrow_profile(&minimum, &maximum, 32.0));
    maximum[4] = 20.0;
    assert!(!double_arrow_profile(&minimum, &maximum, 32.0));
}

#[test]
fn profile_rejects_a_bent_or_unbalanced_arrow() {
    let widths = [
        1.0, 3.0, 5.0, 7.0, 9.0, 7.0, 3.0, 3.0, 3.0, 3.0, 7.0, 9.0, 7.0, 5.0, 3.0, 1.0,
    ];
    let mut minimum = widths.map(|width| -width / 2.0);
    let mut maximum = widths.map(|width| width / 2.0);
    for index in 0..6 {
        minimum[index] += 6.0;
        maximum[index] += 6.0;
    }
    assert!(!double_arrow_profile(&minimum, &maximum, 32.0));
    maximum[3] += 8.0;
    assert!(!double_arrow_profile(&minimum, &maximum, 32.0));
}
