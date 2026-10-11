#![allow(clippy::expect_used)]
use super::*;

#[test]
fn moved_windows_keep_the_cursor_at_the_same_content_position() {
    for offset in [-100_000, -1920, 0, 1920, 100_000] {
        let source = CaptureRegion {
            x: offset,
            y: -400,
            width: 1920,
            height: 1080,
        };
        let position = map_coordinates(offset + 960, 140, source).expect("position");
        let output = map_aspect_fit(position, source, 1920, 1080).expect("mapping");
        assert_eq!((output.normalized_x, output.normalized_y), (0.5, 0.5));
        assert!(output.inside);
    }
}

#[test]
fn resized_windows_use_the_same_letterbox_mapping_as_the_video() {
    for (width, height) in [(400, 1000), (1000, 400), (2, 2), (16384, 128)] {
        let source = CaptureRegion {
            x: 0,
            y: 0,
            width,
            height,
        };
        let center =
            map_coordinates(width as i32 / 2, height as i32 / 2, source).expect("position");
        let output = map_aspect_fit(center, source, 1920, 1080).expect("mapping");
        assert!((output.normalized_x - 0.5).abs() < 1e-9);
        assert!((output.normalized_y - 0.5).abs() < 1e-9);
        let corner = map_aspect_fit(
            map_coordinates(0, 0, source).expect("corner"),
            source,
            1920,
            1080,
        )
        .expect("map");
        assert!(corner.normalized_x >= 0.0 && corner.normalized_y >= 0.0);
        assert!(corner.normalized_x == 0.0 || corner.normalized_y == 0.0);
    }
}

#[test]
fn empty_dimensions_and_extreme_global_coordinates_are_handled_explicitly() {
    let source = CaptureRegion {
        x: i32::MIN,
        y: i32::MAX,
        width: 2,
        height: 2,
    };
    let position = map_coordinates(i32::MAX, i32::MIN, source).expect("extreme position");
    let output = map_aspect_fit(position, source, 16384, 16384).expect("mapping");
    assert!(!output.inside);
    assert!(output.normalized_x.is_finite() && output.normalized_y.is_finite());
    assert!(map_aspect_fit(position, source, 0, 1080).is_err());
    assert!(map_aspect_fit(position, CaptureRegion { width: 0, ..source }, 1920, 1080).is_err());
}
