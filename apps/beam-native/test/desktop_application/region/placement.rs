use super::placement::{controls, dimensions, feedback, initial_actions};
use argui_core::{Point, Rect, Size};

fn crop(x: f32, y: f32, width: f32, height: f32) -> Rect {
    Rect::new(Point::new(x, y), Size::new(width, height))
}

fn on_screen(rect: Rect, size: Size) {
    assert!(rect.origin.x >= 0.0 && rect.origin.y >= 0.0, "{rect:?}");
    assert!(rect.origin.x + rect.size.width <= size.width, "{rect:?}");
    assert!(rect.origin.y + rect.size.height <= size.height, "{rect:?}");
}

#[test]
fn controls_align_to_the_top_left_of_the_crop() {
    let placed = controls(crop(400.0, 200.0, 600.0, 300.0), Size::new(1600.0, 900.0));
    assert_eq!(placed, crop(400.0, 152.0, 300.0, 40.0));
}

#[test]
fn controls_switch_above_at_the_bottom_and_clamp_both_horizontal_edges() {
    let viewport = Size::new(800.0, 600.0);
    for x in [0.0, 750.0] {
        let placed = controls(crop(x, 560.0, 50.0, 40.0), viewport);
        on_screen(placed, viewport);
        assert_eq!(placed.origin.y, 512.0);
    }
}

#[test]
fn controls_move_inside_the_top_for_full_height_crops() {
    let viewport = Size::new(1600.0, 900.0);
    let left = controls(crop(0.0, 0.0, 100.0, 900.0), viewport);
    let right = controls(crop(1500.0, 0.0, 100.0, 900.0), viewport);
    assert_eq!(left.origin, Point::new(0.0, 8.0));
    assert_eq!(right.origin, Point::new(1300.0, 8.0));
    on_screen(left, viewport);
    on_screen(right, viewport);
}

#[test]
fn controls_remain_accessible_for_fullscreen_and_small_scaled_monitors() {
    for viewport in [
        Size::new(800.0, 600.0),
        Size::new(320.0, 180.0),
        Size::new(10.0, 10.0),
    ] {
        let placed = controls(Rect::new(Point::new(0.0, 0.0), viewport), viewport);
        on_screen(placed, viewport);
        assert!(placed.size.width <= 300.0 && placed.size.height <= 40.0);
    }
}

#[test]
fn feedback_prefers_the_lower_right_and_does_not_cover_the_pointer() {
    let placed = feedback(
        Point::new(100.0, 80.0),
        Size::new(156.0, 200.0),
        Size::new(800.0, 600.0),
    );
    assert_eq!(placed, crop(124.0, 104.0, 156.0, 200.0));
}

#[test]
fn feedback_flips_independently_at_each_monitor_edge() {
    let viewport = Size::new(800.0, 600.0);
    for point in [
        Point::new(800.0, 0.0),
        Point::new(0.0, 600.0),
        Point::new(800.0, 600.0),
    ] {
        let placed = feedback(point, Size::new(156.0, 200.0), viewport);
        on_screen(placed, viewport);
        if point.x == 800.0 {
            assert_eq!(placed.origin.x, 620.0);
        }
        if point.y == 600.0 {
            assert_eq!(placed.origin.y, 376.0);
        }
    }
}

#[test]
fn feedback_clamps_when_neither_preferred_side_fits() {
    assert_eq!(
        feedback(
            Point::new(100.0, 80.0),
            Size::new(156.0, 200.0),
            Size::new(180.0, 220.0)
        )
        .origin,
        Point::new(0.0, 0.0)
    );
}

#[test]
fn controls_move_below_when_the_top_edge_has_no_room() {
    assert_eq!(
        controls(crop(100.0, 10.0, 400.0, 300.0), Size::new(800.0, 600.0)),
        crop(100.0, 318.0, 300.0, 40.0)
    );
}

#[test]
fn preparation_actions_default_to_bottom_center_with_padding() {
    let viewport = Size::new(800.0, 600.0);
    assert_eq!(initial_actions(viewport), crop(90.0, 526.0, 620.0, 54.0));
}

#[test]
fn actions_stay_inside_fullscreen_and_small_monitors() {
    for size in [
        Size::new(800.0, 600.0),
        Size::new(320.0, 180.0),
        Size::new(10.0, 10.0),
    ] {
        on_screen(initial_actions(size), size);
    }
}

#[test]
fn live_dimensions_stay_at_the_left_and_flip_below_near_the_top() {
    let viewport = Size::new(800.0, 600.0);
    assert_eq!(
        dimensions(crop(100.0, 80.0, 300.0, 200.0), viewport),
        crop(100.0, 50.0, 104.0, 22.0)
    );
    assert_eq!(
        dimensions(crop(100.0, 10.0, 300.0, 200.0), viewport),
        crop(100.0, 218.0, 104.0, 22.0)
    );
    for viewport in [viewport, Size::new(10.0, 10.0)] {
        on_screen(
            dimensions(Rect::new(Point::new(0.0, 0.0), viewport), viewport),
            viewport,
        );
    }
}
