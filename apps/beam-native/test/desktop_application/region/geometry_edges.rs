use super::{geometry::*, types::Edge};
use argui_core::{Point, Rect, Size};

const VIEWPORT: Size = Size::new(800.0, 600.0);

fn crop() -> Rect {
    Rect::new(Point::new(100.0, 80.0), Size::new(200.0, 120.0))
}

#[test]
fn resize_bands_leave_the_inner_border_available_for_moving() {
    for (point, edge) in [
        (Point::new(200.0, 76.0), Edge::North),
        (Point::new(200.0, 204.0), Edge::South),
        (Point::new(96.0, 140.0), Edge::West),
        (Point::new(304.0, 140.0), Edge::East),
    ] {
        assert_eq!(edge_at(crop(), point), Some(edge));
    }
    for point in [
        Point::new(200.0, 86.0),
        Point::new(106.0, 140.0),
        Point::new(95.0, 140.0),
    ] {
        assert_eq!(edge_at(crop(), point), None);
    }
}

#[test]
fn edge_resizing_keeps_the_opposite_edge_and_unrelated_dimension_fixed() {
    let result = resized_edge(crop(), Edge::West, Point::new(-20.0, 140.0), None, VIEWPORT);
    assert_eq!(result.origin, Point::new(0.0, 80.0));
    assert_eq!(result.size, Size::new(300.0, 120.0));
    let crossed = resized_edge(
        crop(),
        Edge::North,
        Point::new(200.0, 260.0),
        None,
        VIEWPORT,
    );
    assert_eq!(crossed.origin, Point::new(100.0, 200.0));
    assert_eq!(crossed.size, Size::new(200.0, 60.0));
}

#[test]
fn ratio_edges_preserve_the_anchor_and_fit_at_monitor_limits() {
    let result = resized_edge(
        crop(),
        Edge::East,
        Point::new(800.0, 140.0),
        Some(2.0),
        VIEWPORT,
    );
    assert_eq!(result.origin.x, 100.0);
    assert_eq!(result.origin.y, 0.0);
    assert_eq!(result.size, Size::new(560.0, 280.0));
    let invalid = resized_edge(
        crop(),
        Edge::South,
        Point::new(200.0, 300.0),
        Some(f32::NAN),
        VIEWPORT,
    );
    assert_eq!(invalid.size, Size::new(200.0, 220.0));
}
