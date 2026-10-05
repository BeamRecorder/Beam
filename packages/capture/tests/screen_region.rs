#![allow(clippy::expect_used)]
use capture::model::ScreenRegion;

#[test]
fn region_rounds_edges_instead_of_dimensions() {
    let region = ScreenRegion {
        x: 0.15,
        y: 0.15,
        width: 0.25,
        height: 0.25,
    };
    assert_eq!(
        region.pixel_rect(10, 10).expect("fractional pixel edges"),
        (2, 2, 4, 4)
    );
}

#[test]
fn region_preserves_bottom_right_pixels_at_common_display_scales() {
    for (width, height) in [
        (1000, 500),
        (1250, 625),
        (1500, 750),
        (2000, 1000),
        (1921, 1081),
    ] {
        let x = 101.0 / f64::from(width);
        let y = 51.0 / f64::from(height);
        let region = ScreenRegion {
            x,
            y,
            width: 1.0 - x,
            height: 1.0 - y,
        };
        assert_eq!(
            region
                .pixel_rect(width, height)
                .expect("scaled frame bounds"),
            (101, 51, width, height)
        );
    }
}

#[test]
fn subpixel_edge_selection_stays_inside_the_frame() {
    let region = ScreenRegion {
        x: 0.9999,
        y: 0.9999,
        width: 0.0001,
        height: 0.0001,
    };
    assert_eq!(
        region.pixel_rect(100, 100).expect("subpixel region"),
        (99, 99, 100, 100)
    );
}

#[test]
fn region_rejects_empty_frames_before_rounding_edges() {
    let region = ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
    };
    for (width, height) in [(0, 0), (0, 100), (100, 0)] {
        assert!(region.pixel_rect(width, height).is_err());
    }
    assert_eq!(
        region.pixel_rect(1, 1).expect("one-pixel image"),
        (0, 0, 1, 1)
    );
}
