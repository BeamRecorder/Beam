#[cfg(any(target_os = "macos", test))]
use super::{Hotspot, resize_classifier::MAX_SIDE};

#[cfg(any(windows, test))]
pub(super) fn opacity_bitmap(dark: &[u8], light: &[u8]) -> Vec<u8> {
    dark.as_chunks::<4>()
        .0
        .iter()
        .zip(light.as_chunks::<4>().0)
        .flat_map(|(dark, light)| {
            let difference = dark[0]
                .abs_diff(light[0])
                .max(dark[1].abs_diff(light[1]))
                .max(dark[2].abs_diff(light[2]));
            [0, 0, 0, 255 - difference]
        })
        .collect()
}

#[cfg(any(target_os = "macos", test))]
pub(super) fn pixel_hotspot(
    point: (f64, f64),
    logical_size: (f64, f64),
    pixels: (u32, u32),
) -> Option<Hotspot> {
    if !(1..=MAX_SIDE).contains(&pixels.0)
        || !(1..=MAX_SIDE).contains(&pixels.1)
        || !logical_size.0.is_finite()
        || !logical_size.1.is_finite()
        || logical_size.0 <= 0.0
        || logical_size.1 <= 0.0
        || !point.0.is_finite()
        || !point.1.is_finite()
        || !(0.0..logical_size.0).contains(&point.0)
        || !(0.0..logical_size.1).contains(&point.1)
    {
        return None;
    }
    Some(Hotspot {
        x: (point.0 * f64::from(pixels.0) / logical_size.0) as u32,
        y: (point.1 * f64::from(pixels.1) / logical_size.1) as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_retina_points_to_bitmap_pixels_without_moving_the_anchor() {
        assert_eq!(
            pixel_hotspot((20.0, 20.0), (40.0, 40.0), (80, 80)),
            Some(Hotspot { x: 40, y: 40 })
        );
        assert_eq!(
            pixel_hotspot((20.0, 20.0), (40.0, 40.0), (40, 40)),
            Some(Hotspot { x: 20, y: 20 })
        );
    }

    #[test]
    fn handles_fractional_hotspots_and_non_square_representations() {
        assert_eq!(
            pixel_hotspot((10.5, 5.5), (20.0, 10.0), (40, 30)),
            Some(Hotspot { x: 21, y: 16 })
        );
    }

    #[test]
    fn rejects_missing_invalid_or_excessive_image_geometry() {
        for (point, logical, pixels) in [
            ((10.0, 10.0), (0.0, 40.0), (40, 40)),
            ((10.0, 10.0), (40.0, f64::NAN), (40, 40)),
            ((f64::INFINITY, 10.0), (40.0, 40.0), (40, 40)),
            ((-1.0, 10.0), (40.0, 40.0), (40, 40)),
            ((40.0, 10.0), (40.0, 40.0), (40, 40)),
            ((10.0, 10.0), (40.0, 40.0), (0, 40)),
            ((10.0, 10.0), (40.0, 40.0), (40, 257)),
        ] {
            assert_eq!(pixel_hotspot(point, logical, pixels), None);
        }
    }

    #[test]
    fn opaque_black_and_white_pixels_remain_opaque_without_gdi_alpha() {
        assert_eq!(
            opacity_bitmap(
                &[0, 0, 0, 0, 255, 255, 255, 0],
                &[0, 0, 0, 0, 255, 255, 255, 0]
            ),
            vec![0, 0, 0, 255, 0, 0, 0, 255]
        );
    }

    #[test]
    fn transparent_pixels_and_inverting_cursors_do_not_become_solid_backgrounds() {
        assert_eq!(
            opacity_bitmap(
                &[0, 0, 0, 0, 255, 255, 255, 0],
                &[255, 255, 255, 0, 0, 0, 0, 0]
            ),
            vec![0; 8]
        );
    }

    #[test]
    fn preserves_antialiasing_independently_of_rgb_and_alpha_byte_values() {
        assert_eq!(
            opacity_bitmap(&[30, 70, 100, 200], &[157, 197, 227, 0]),
            vec![0, 0, 0, 128]
        );
    }

    #[test]
    fn recognizes_figma_after_windows_black_white_compositing() {
        let (width, height, pixels) = super::super::resize_classifier::tests::figma_bitmap();
        let mut dark = Vec::new();
        let mut light = Vec::new();
        for pixel in pixels.as_chunks::<4>().0 {
            let alpha = u32::from(pixel[3]);
            for channel in &pixel[..3] {
                let premultiplied = u32::from(*channel) * alpha / 255;
                dark.push(premultiplied as u8);
                light.push((premultiplied + 255 - alpha) as u8);
            }
            dark.push(0);
            light.push(0);
        }
        assert_eq!(
            super::super::resize_classifier::resize_cursor_kind(
                &opacity_bitmap(&dark, &light),
                width,
                height,
                Hotspot { x: 20, y: 20 }
            ),
            Some(super::super::CursorKind::Resizenorthwestsoutheast)
        );
    }

    #[test]
    fn recognizes_figma_with_a_retina_hotspot_in_points() {
        let (width, height, pixels) = super::super::resize_classifier::tests::figma_bitmap();
        let hotspot = pixel_hotspot((10.0, 10.0), (20.0, 20.0), (width, height));
        assert_eq!(
            hotspot.and_then(
                |hotspot| super::super::resize_classifier::resize_cursor_kind(
                    &pixels, width, height, hotspot
                )
            ),
            Some(super::super::CursorKind::Resizenorthwestsoutheast)
        );
    }
}
