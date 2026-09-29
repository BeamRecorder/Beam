use argui_core::{Point, Rect, Size};

use super::geometry::{
    aspect_selection, constrained, contains, corner_at, input_hole, moved, opposite_corner,
    pixel_point, pixel_rect, resized, selection,
};
use super::types::Corner;

const VIEWPORT: Size = Size::new(800.0, 600.0);
const CROP: Rect = Rect::new(Point::new(100.0, 80.0), Size::new(300.0, 200.0));

/// Returns a crop with logical origin `(x, y)` and logical extents `(width, height)`.
fn rect(x: f32, y: f32, width: f32, height: f32) -> Rect {
    Rect::new(Point::new(x, y), Size::new(width, height))
}

#[test]
fn selection_normalizes_all_four_drawing_directions() {
    for (start, end) in [
        (Point::new(100.0, 80.0), Point::new(400.0, 280.0)),
        (Point::new(400.0, 280.0), Point::new(100.0, 80.0)),
        (Point::new(100.0, 280.0), Point::new(400.0, 80.0)),
        (Point::new(400.0, 80.0), Point::new(100.0, 280.0)),
    ] {
        assert_eq!(selection(start, end, VIEWPORT), CROP);
    }
}

#[test]
fn selection_clamps_both_endpoints_to_the_monitor() {
    for (start, end) in [
        (Point::new(-40.0, -30.0), Point::new(900.0, 700.0)),
        (Point::new(900.0, 700.0), Point::new(-40.0, -30.0)),
        (Point::new(-40.0, 700.0), Point::new(900.0, -30.0)),
    ] {
        assert_eq!(
            selection(start, end, VIEWPORT),
            rect(0.0, 0.0, 800.0, 600.0)
        );
    }
}

#[test]
fn selection_keeps_clicks_and_zero_viewports_empty() {
    let point = Point::new(800.0, 600.0);
    assert_eq!(
        selection(point, point, VIEWPORT),
        rect(800.0, 600.0, 0.0, 0.0)
    );
    assert_eq!(
        selection(
            Point::new(-20.0, -10.0),
            Point::new(90.0, 70.0),
            Size::new(0.0, 0.0)
        ),
        rect(0.0, 0.0, 0.0, 0.0)
    );
}

#[test]
fn selection_preserves_fractional_ui_coordinates_without_pixel_scaling() {
    assert_eq!(
        selection(
            Point::new(100.25, 80.5),
            Point::new(400.75, 280.25),
            VIEWPORT
        ),
        rect(100.25, 80.5, 300.5, 199.75)
    );
}

#[test]
fn aspect_selection_preserves_the_anchor_in_all_four_drawing_directions() {
    let anchor = Point::new(400.0, 300.0);
    for (at, expected) in [
        (Point::new(650.0, 400.0), rect(400.0, 300.0, 240.0, 120.0)),
        (Point::new(150.0, 400.0), rect(160.0, 300.0, 240.0, 120.0)),
        (Point::new(650.0, 200.0), rect(400.0, 180.0, 240.0, 120.0)),
        (Point::new(150.0, 200.0), rect(160.0, 180.0, 240.0, 120.0)),
    ] {
        assert_eq!(aspect_selection(anchor, at, Some(2.0), VIEWPORT), expected);
    }
}

#[test]
fn aspect_selection_fits_the_available_space_in_each_drawing_direction() {
    let anchor = Point::new(600.0, 450.0);
    for (at, expected) in [
        (Point::new(-100.0, -100.0), rect(0.0, 150.0, 600.0, 300.0)),
        (Point::new(900.0, -100.0), rect(600.0, 350.0, 200.0, 100.0)),
        (Point::new(-100.0, 700.0), rect(300.0, 450.0, 300.0, 150.0)),
        (Point::new(900.0, 700.0), rect(600.0, 450.0, 200.0, 100.0)),
    ] {
        assert_eq!(aspect_selection(anchor, at, Some(2.0), VIEWPORT), expected);
    }
}

#[test]
fn aspect_selection_uses_freeform_bounds_for_invalid_ratios() {
    for ratio in [
        None,
        Some(0.0),
        Some(-1.0),
        Some(f32::NAN),
        Some(f32::INFINITY),
        Some(f32::NEG_INFINITY),
    ] {
        assert_eq!(
            aspect_selection(
                Point::new(900.0, 700.0),
                Point::new(-40.0, -30.0),
                ratio,
                VIEWPORT
            ),
            rect(0.0, 0.0, 800.0, 600.0)
        );
        assert_eq!(
            aspect_selection(
                Point::new(450.0, 250.0),
                Point::new(300.0, 100.0),
                ratio,
                VIEWPORT
            ),
            rect(300.0, 100.0, 150.0, 150.0)
        );
    }
}

#[test]
fn moved_translates_without_resizing_the_crop() {
    assert_eq!(
        moved(CROP, Point::new(60.0, 40.0), VIEWPORT),
        rect(160.0, 120.0, 300.0, 200.0)
    );
    assert_eq!(moved(CROP, Point::new(0.0, 0.0), VIEWPORT), CROP);
}

#[test]
fn moved_clamps_large_positive_and_negative_displacements() {
    for (delta, expected) in [
        (Point::new(-900.0, -900.0), rect(0.0, 0.0, 300.0, 200.0)),
        (Point::new(900.0, 900.0), rect(500.0, 400.0, 300.0, 200.0)),
        (Point::new(-900.0, 900.0), rect(0.0, 400.0, 300.0, 200.0)),
    ] {
        assert_eq!(moved(CROP, delta, VIEWPORT), expected);
    }
}

#[test]
fn moved_preserves_an_exactly_monitor_sized_crop_at_the_origin() {
    let crop = rect(0.0, 0.0, 800.0, 600.0);
    assert_eq!(moved(crop, Point::new(300.0, -200.0), VIEWPORT), crop);
    let oversized = rect(0.0, 0.0, 900.0, 700.0);
    assert_eq!(
        moved(oversized, Point::new(100.0, 100.0), VIEWPORT),
        oversized
    );
}

#[test]
fn moved_keeps_fractional_displacements_in_ui_units() {
    assert_eq!(
        moved(CROP, Point::new(0.25, -0.5), VIEWPORT),
        rect(100.25, 79.5, 300.0, 200.0)
    );
}

#[test]
fn resized_anchors_the_opposite_corner_for_every_handle() {
    for (corner, at, expected) in [
        (
            Corner::Nw,
            Point::new(40.0, 20.0),
            rect(40.0, 20.0, 360.0, 260.0),
        ),
        (
            Corner::Ne,
            Point::new(490.0, 20.0),
            rect(100.0, 20.0, 390.0, 260.0),
        ),
        (
            Corner::Sw,
            Point::new(40.0, 350.0),
            rect(40.0, 80.0, 360.0, 270.0),
        ),
        (
            Corner::Se,
            Point::new(490.0, 350.0),
            rect(100.0, 80.0, 390.0, 270.0),
        ),
    ] {
        assert_eq!(resized(CROP, corner, at, VIEWPORT), expected);
    }
}

#[test]
fn resized_crosses_the_anchor_without_producing_negative_dimensions() {
    for (corner, at, expected) in [
        (
            Corner::Nw,
            Point::new(490.0, 350.0),
            rect(400.0, 280.0, 90.0, 70.0),
        ),
        (
            Corner::Ne,
            Point::new(70.0, 350.0),
            rect(70.0, 280.0, 30.0, 70.0),
        ),
        (
            Corner::Sw,
            Point::new(490.0, 20.0),
            rect(400.0, 20.0, 90.0, 60.0),
        ),
        (
            Corner::Se,
            Point::new(40.0, 20.0),
            rect(40.0, 20.0, 60.0, 60.0),
        ),
    ] {
        assert_eq!(resized(CROP, corner, at, VIEWPORT), expected);
    }
}

#[test]
fn resized_clamps_handles_dragged_outside_each_monitor_corner() {
    for (corner, at, expected) in [
        (
            Corner::Nw,
            Point::new(-100.0, -80.0),
            rect(0.0, 0.0, 400.0, 280.0),
        ),
        (
            Corner::Ne,
            Point::new(900.0, -80.0),
            rect(100.0, 0.0, 700.0, 280.0),
        ),
        (
            Corner::Sw,
            Point::new(-100.0, 900.0),
            rect(0.0, 80.0, 400.0, 520.0),
        ),
        (
            Corner::Se,
            Point::new(900.0, 900.0),
            rect(100.0, 80.0, 700.0, 520.0),
        ),
    ] {
        assert_eq!(resized(CROP, corner, at, VIEWPORT), expected);
    }
}

#[test]
fn resized_can_collapse_each_handle_onto_its_anchor() {
    for (corner, anchor) in [
        (Corner::Nw, Point::new(400.0, 280.0)),
        (Corner::Ne, Point::new(100.0, 280.0)),
        (Corner::Sw, Point::new(400.0, 80.0)),
        (Corner::Se, Point::new(100.0, 80.0)),
    ] {
        assert_eq!(
            resized(CROP, corner, anchor, VIEWPORT),
            Rect::new(anchor, Size::new(0.0, 0.0))
        );
    }
}

#[test]
fn aspect_resize_keeps_the_opposite_corner_fixed_for_every_handle() {
    for (corner, at, expected) in [
        (
            Corner::Nw,
            Point::new(40.0, 20.0),
            rect(8.0, 84.0, 392.0, 196.0),
        ),
        (
            Corner::Ne,
            Point::new(490.0, 20.0),
            rect(100.0, 72.0, 416.0, 208.0),
        ),
        (
            Corner::Sw,
            Point::new(40.0, 350.0),
            rect(4.0, 80.0, 396.0, 198.0),
        ),
        (
            Corner::Se,
            Point::new(490.0, 350.0),
            rect(100.0, 80.0, 420.0, 210.0),
        ),
    ] {
        let anchor = opposite_corner(CROP, corner);
        let crop = aspect_selection(anchor, at, Some(2.0), VIEWPORT);
        assert_eq!(crop, expected);
        assert_eq!(opposite_corner(crop, corner), anchor);
    }
}

#[test]
fn aspect_resize_can_cross_the_anchor_while_keeping_it_fixed() {
    for (corner, crossed_corner, at) in [
        (Corner::Nw, Corner::Se, Point::new(490.0, 350.0)),
        (Corner::Ne, Corner::Sw, Point::new(70.0, 350.0)),
        (Corner::Sw, Corner::Ne, Point::new(490.0, 20.0)),
        (Corner::Se, Corner::Nw, Point::new(40.0, 20.0)),
    ] {
        let anchor = opposite_corner(CROP, corner);
        let crop = aspect_selection(anchor, at, Some(2.0), VIEWPORT);
        assert_eq!(opposite_corner(crop, crossed_corner), anchor);
        assert!(crop.size.height > 0.0);
        assert_eq!(crop.size.width, crop.size.height * 2.0);
    }
}

#[test]
fn constrained_keeps_matching_ratios_and_projects_mismatched_dimensions() {
    let matching = rect(100.0, 80.0, 300.0, 150.0);
    assert_eq!(constrained(matching, Some(2.0), VIEWPORT), matching);
    assert_eq!(
        constrained(rect(100.0, 80.0, 400.0, 200.0), Some(1.0), VIEWPORT),
        rect(100.0, 80.0, 300.0, 300.0)
    );
}

#[test]
fn constrained_fits_landscape_and_portrait_ratios_to_remaining_space() {
    assert_eq!(
        constrained(rect(100.0, 80.0, 1000.0, 500.0), Some(2.0), VIEWPORT),
        rect(100.0, 80.0, 700.0, 350.0)
    );
    assert_eq!(
        constrained(rect(100.0, 80.0, 600.0, 800.0), Some(0.75), VIEWPORT),
        rect(100.0, 80.0, 390.0, 520.0)
    );
}

#[test]
fn constrained_uses_freeform_bounds_for_nonpositive_and_nonfinite_ratios() {
    let crop = rect(100.0, 80.0, 900.0, 700.0);
    for ratio in [
        None,
        Some(0.0),
        Some(-1.0),
        Some(f32::NAN),
        Some(f32::INFINITY),
        Some(f32::NEG_INFINITY),
    ] {
        assert_eq!(
            constrained(crop, ratio, VIEWPORT),
            rect(100.0, 80.0, 700.0, 520.0)
        );
    }
}

#[test]
fn constrained_clamps_negative_origins_and_negative_freeform_dimensions() {
    assert_eq!(
        constrained(rect(-30.0, -20.0, -10.0, 100.0), None, VIEWPORT),
        rect(0.0, 0.0, 0.0, 100.0)
    );
    assert_eq!(constrained(CROP, None, VIEWPORT), CROP);
}

#[test]
fn constrained_returns_empty_dimensions_when_no_viewport_space_remains() {
    for ratio in [None, Some(2.0)] {
        assert_eq!(
            constrained(rect(900.0, 700.0, 300.0, 200.0), ratio, VIEWPORT),
            rect(800.0, 600.0, 0.0, 0.0)
        );
        assert_eq!(
            constrained(CROP, ratio, Size::new(0.0, 0.0)),
            rect(0.0, 0.0, 0.0, 0.0)
        );
    }
}

#[test]
fn input_hole_reserves_an_eight_ui_pixel_band_on_all_four_sides() {
    assert_eq!(input_hole(CROP), Some(rect(108.0, 88.0, 284.0, 184.0)));
}

#[test]
fn input_hole_rejects_crops_with_no_positive_interior_on_either_axis() {
    for (width, height) in [
        (16.0, 100.0),
        (100.0, 16.0),
        (0.0, 100.0),
        (100.0, -10.0),
        (16.0, 16.0),
    ] {
        assert_eq!(input_hole(rect(100.0, 80.0, width, height)), None);
    }
}

#[test]
fn input_hole_accepts_a_fractional_interior_immediately_above_the_threshold() {
    assert_eq!(
        input_hole(rect(100.0, 80.0, 16.25, 16.25)),
        Some(rect(108.0, 88.0, 0.25, 0.25))
    );
}

#[test]
fn input_hole_preserves_fractional_ui_coordinates_for_native_dpi_conversion() {
    assert_eq!(
        input_hole(rect(100.25, 80.5, 30.5, 40.25)),
        Some(rect(108.25, 88.5, 14.5, 24.25))
    );
}

#[test]
fn corner_at_identifies_all_four_handle_centers() {
    for (point, corner) in [
        (Point::new(100.0, 80.0), Corner::Nw),
        (Point::new(400.0, 80.0), Corner::Ne),
        (Point::new(100.0, 280.0), Corner::Sw),
        (Point::new(400.0, 280.0), Corner::Se),
    ] {
        assert_eq!(corner_at(CROP, point), Some(corner));
    }
}

#[test]
fn corner_at_includes_the_exact_eight_ui_pixel_handle_boundary() {
    for (point, corner) in [
        (Point::new(92.0, 72.0), Corner::Nw),
        (Point::new(408.0, 72.0), Corner::Ne),
        (Point::new(92.0, 288.0), Corner::Sw),
        (Point::new(408.0, 288.0), Corner::Se),
    ] {
        assert_eq!(corner_at(CROP, point), Some(corner));
    }
}

#[test]
fn corner_at_rejects_nearby_points_outside_handles_and_the_remaining_move_band() {
    for point in [
        Point::new(91.75, 80.0),
        Point::new(400.0, 71.75),
        Point::new(100.0, 288.25),
        Point::new(408.25, 280.0),
        Point::new(100.0, 180.0),
        Point::new(250.0, 80.0),
        Point::new(250.0, 180.0),
    ] {
        assert_eq!(corner_at(CROP, point), None);
    }
}

#[test]
fn contains_includes_the_crop_interior_and_every_visible_edge() {
    for point in [
        Point::new(250.0, 180.0),
        Point::new(100.0, 80.0),
        Point::new(400.0, 80.0),
        Point::new(100.0, 280.0),
        Point::new(400.0, 280.0),
        Point::new(250.0, 80.0),
        Point::new(100.0, 180.0),
        Point::new(400.0, 180.0),
        Point::new(250.0, 280.0),
    ] {
        assert!(contains(CROP, point), "expected {point:?} inside {CROP:?}");
    }
}

#[test]
fn contains_rejects_negative_points_and_positions_just_outside_each_edge() {
    for point in [
        Point::new(-1.0, 80.0),
        Point::new(100.0, -1.0),
        Point::new(99.75, 180.0),
        Point::new(400.25, 180.0),
        Point::new(250.0, 79.75),
        Point::new(250.0, 280.25),
    ] {
        assert!(
            !contains(CROP, point),
            "expected {point:?} outside {CROP:?}"
        );
    }
}

#[test]
fn contains_keeps_a_collapsed_crop_at_its_exact_logical_point() {
    let crop = rect(100.25, 80.5, 0.0, 0.0);
    assert!(contains(crop, Point::new(100.25, 80.5)));
    assert!(!contains(crop, Point::new(100.5, 80.5)));
    assert!(!contains(crop, Point::new(100.25, 80.25)));
}

#[path = "geometry_pixels.rs"]
mod pixels;
