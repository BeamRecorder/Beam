#![allow(clippy::expect_used)]

use beam_screen::cursor::{CaptureRegion, map_coordinates};

#[test]
fn cursor_region_excludes_the_right_and_bottom_edges() {
    let region = CaptureRegion {
        x: -100,
        y: 20,
        width: 200,
        height: 100,
    };
    let last_inside = map_coordinates(99, 119, region).expect("inside");
    assert!(last_inside.inside);
    let right_edge = map_coordinates(100, 119, region).expect("right edge");
    let bottom_edge = map_coordinates(99, 120, region).expect("bottom edge");
    assert!(!right_edge.inside);
    assert!(!bottom_edge.inside);
    assert_eq!(right_edge.pixel_x, 200);
}
