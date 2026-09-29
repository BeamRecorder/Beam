use super::{
    magnifier::{SAMPLE_SIZE, sample},
    types::{RegionState, ScreenPixels},
};
use argui_core::Point;

fn pixels() -> ScreenPixels {
    let mut rgba = Vec::new();
    for y in 0..32_u8 {
        for x in 0..32_u8 {
            rgba.extend_from_slice(&[x, y, 42, 255]);
        }
    }
    ScreenPixels {
        width: 32,
        height: 32,
        rgba: rgba.into(),
    }
}

#[test]
fn sample_uses_the_real_unfiltered_pixel_nearest_the_capture_boundary() {
    let image = sample(&pixels(), 16, 17).unwrap();
    assert_eq!((image.width, image.height), (SAMPLE_SIZE, SAMPLE_SIZE));
    let offset = (12 * SAMPLE_SIZE as usize + 12) * 4;
    assert_eq!(&image.rgba8[offset..offset + 4], &[16, 17, 42, 255]);
    assert_eq!(&image.rgba8[0..4], &[4, 5, 42, 255]);
}

#[test]
fn sample_leaves_outside_monitor_pixels_empty_instead_of_repeating_edges() {
    for (x, y, nonempty) in [(0, 0, 144), (32, 32, 144), (0, 16, 288), (16, 0, 288)] {
        let image = sample(&pixels(), x, y).unwrap();
        assert_eq!(
            image.rgba8.chunks_exact(4).filter(|p| p[3] != 0).count(),
            nonempty
        );
    }
}

#[test]
fn sample_rejects_empty_truncated_and_overflowing_rasters() {
    for pixels in [
        ScreenPixels {
            width: 0,
            height: 32,
            rgba: [].into(),
        },
        ScreenPixels {
            width: 2,
            height: 2,
            rgba: [0; 15].into(),
        },
        ScreenPixels {
            width: u32::MAX,
            height: u32::MAX,
            rgba: [].into(),
        },
    ] {
        assert!(sample(&pixels, 0, 0).is_err());
    }
    for at in [i32::MIN, i32::MAX] {
        assert!(
            sample(&pixels(), at, at)
                .unwrap()
                .rgba8
                .iter()
                .all(|byte| *byte == 0)
        );
    }
}

#[test]
fn magnify_converts_ui_coordinates_to_physical_pixels_and_reuses_one_asset_id() {
    let mut state = RegionState {
        pixels: Some(pixels()),
        pixel_scale: 1.25,
        ..RegionState::default()
    };
    state.magnify(Point::new(12.8, 13.6));
    let first = state.images().pop().unwrap();
    state.magnify(Point::new(13.6, 14.4));
    let second = state.images().pop().unwrap();
    assert_eq!(first.id, second.id);
    assert_ne!(first.rgba8, second.rgba8);
    let offset = (12 * SAMPLE_SIZE as usize + 12) * 4;
    assert_eq!(&second.rgba8[offset..offset + 4], &[17, 18, 42, 255]);
}

#[test]
fn magnify_maps_xwayland_pointer_positions_into_the_larger_authorized_raster() {
    let mut state = RegionState {
        viewport: argui_core::Size::new(16.0, 16.0),
        pixels: Some(pixels()),
        pixel_scale: 1.0,
        ..RegionState::default()
    };
    state.magnify(Point::new(7.5, 8.5));
    let image = state.images().pop().unwrap();
    let offset = (12 * SAMPLE_SIZE as usize + 12) * 4;
    assert_eq!(&image.rgba8[offset..offset + 4], &[15, 17, 42, 255]);
}

#[test]
fn magnify_does_not_substitute_a_fake_image_when_capture_is_unavailable() {
    let mut state = RegionState::default();
    state.magnify(Point::new(10.0, 10.0));
    assert!(state.images().is_empty());
}

#[test]
fn magnify_clears_an_old_sample_after_a_failed_or_missing_raster() {
    let mut state = RegionState {
        pixels: Some(pixels()),
        ..RegionState::default()
    };
    state.magnify(Point::new(10.0, 10.0));
    assert_eq!(state.images().len(), 1);
    state.pixels = Some(ScreenPixels {
        width: 1,
        height: 1,
        rgba: [].into(),
    });
    state.magnify(Point::new(10.0, 10.0));
    assert!(state.images().is_empty());
    state.pixels = None;
    state.magnify(Point::new(10.0, 10.0));
    assert!(state.images().is_empty());
}
