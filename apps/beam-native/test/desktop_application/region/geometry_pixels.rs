use super::*;

#[test]
fn pixel_point_snaps_to_the_actual_grid_at_fractional_dpi() {
    for scale in [1.0, 1.25, 1.5, 2.0] {
        let point = pixel_point(Point::new(100.25, 80.3), VIEWPORT, scale);
        assert!((f64::from(point.x) * scale - (100.25 * scale).round()).abs() < 0.0001);
        assert!((f64::from(point.y) * scale - (80.3 * scale).round()).abs() < 0.0001);
    }
}

#[test]
fn pixel_point_bounds_negative_and_outside_samples_before_snapping() {
    assert_eq!(
        pixel_point(Point::new(-100.0, 900.0), VIEWPORT, 1.25),
        Point::new(0.0, 600.0)
    );
}

#[test]
fn pixel_point_preserves_zero_and_exact_monitor_boundaries() {
    for point in [
        Point::new(0.0, 0.0),
        Point::new(800.0, 600.0),
        Point::new(400.0, 300.0),
    ] {
        assert_eq!(pixel_point(point, VIEWPORT, 2.0), point);
    }
}

#[test]
fn pixel_rect_snaps_both_edges_so_origin_and_extents_are_pixel_exact() {
    let crop = pixel_rect(rect(100.25, 80.3, 301.35, 199.2), VIEWPORT, 1.25);
    for value in [
        crop.origin.x,
        crop.origin.y,
        crop.size.width,
        crop.size.height,
    ] {
        assert!((value * 1.25 - (value * 1.25).round()).abs() < 0.0001);
    }
}

#[test]
fn pixel_rect_keeps_all_four_viewport_edges_bounded() {
    assert_eq!(
        pixel_rect(rect(-3.0, -2.0, 900.0, 700.0), VIEWPORT, 1.5),
        rect(0.0, 0.0, 800.0, 600.0)
    );
}

#[test]
fn pixel_rect_preserves_existing_pixel_crops_and_collapsed_selections() {
    assert_eq!(pixel_rect(CROP, VIEWPORT, 1.25), CROP);
    assert_eq!(
        pixel_rect(rect(0.0, 0.0, 0.0, 0.0), VIEWPORT, 2.0),
        rect(0.0, 0.0, 0.0, 0.0)
    );
}
