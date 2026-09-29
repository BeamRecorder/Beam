//! Crop geometry in the same UI units as the native spotlight input region.

use super::types::{Corner, Edge};
use argui_core::{Point, Rect, Size};

/// Bounds `point` to the selected monitor's UI viewport.
fn clamped(point: Point, viewport: Size) -> Point {
    Point::new(
        point.x.clamp(0.0, viewport.width),
        point.y.clamp(0.0, viewport.height),
    )
}

/// Returns the bounded rectangle drawn between two native pointer positions.
pub(super) fn selection(start: Point, end: Point, viewport: Size) -> Rect {
    let start = clamped(start, viewport);
    let end = clamped(end, viewport);
    Rect::new(
        Point::new(start.x.min(end.x), start.y.min(end.y)),
        Size::new((start.x - end.x).abs(), (start.y - end.y).abs()),
    )
}

/// Translates a crop without changing its dimensions or leaving the monitor.
pub(super) fn moved(rect: Rect, delta: Point, viewport: Size) -> Rect {
    Rect::new(
        Point::new(
            (rect.origin.x + delta.x).clamp(0.0, (viewport.width - rect.size.width).max(0.0)),
            (rect.origin.y + delta.y).clamp(0.0, (viewport.height - rect.size.height).max(0.0)),
        ),
        rect.size,
    )
}

/// Resizes from one corner while preserving the opposite corner as the anchor.
pub(super) fn resized(rect: Rect, corner: Corner, at: Point, viewport: Size) -> Rect {
    selection(opposite_corner(rect, corner), at, viewport)
}

/// Returns the fixed corner opposite a dragged handle.
pub(super) fn opposite_corner(rect: Rect, corner: Corner) -> Point {
    Point::new(
        if matches!(corner, Corner::Nw | Corner::Sw) {
            rect.origin.x + rect.size.width
        } else {
            rect.origin.x
        },
        if matches!(corner, Corner::Nw | Corner::Ne) {
            rect.origin.y + rect.size.height
        } else {
            rect.origin.y
        },
    )
}

/// Draws a ratio-constrained crop in any direction without moving its anchor.
pub(super) fn aspect_selection(
    anchor: Point,
    at: Point,
    ratio: Option<f32>,
    viewport: Size,
) -> Rect {
    let Some(ratio) = ratio.filter(|value| value.is_finite() && *value > 0.0) else {
        return selection(anchor, at, viewport);
    };
    let anchor = clamped(anchor, viewport);
    let at = clamped(at, viewport);
    let width = (at.x - anchor.x).abs();
    let height = (at.y - anchor.y).abs();
    let backwards_x = at.x < anchor.x;
    let backwards_y = at.y < anchor.y;
    let available_width = if backwards_x {
        anchor.x
    } else {
        viewport.width - anchor.x
    };
    let available_height = if backwards_y {
        anchor.y
    } else {
        viewport.height - anchor.y
    };
    let height = ((ratio * width + height) / (ratio * ratio + 1.0))
        .min(available_height)
        .min(available_width / ratio);
    let width = height * ratio;
    Rect::new(
        Point::new(
            if backwards_x {
                anchor.x - width
            } else {
                anchor.x
            },
            if backwards_y {
                anchor.y - height
            } else {
                anchor.y
            },
        ),
        Size::new(width, height),
    )
}

/// Fits a requested aspect ratio inside the viewport, preserving the top-left.
pub(super) fn constrained(rect: Rect, ratio: Option<f32>, viewport: Size) -> Rect {
    let origin = clamped(rect.origin, viewport);
    let available = Size::new(viewport.width - origin.x, viewport.height - origin.y);
    let Some(ratio) = ratio.filter(|value| value.is_finite() && *value > 0.0) else {
        return Rect::new(
            origin,
            Size::new(
                rect.size.width.max(0.0).min(available.width),
                rect.size.height.max(0.0).min(available.height),
            ),
        );
    };
    let height = ((ratio * rect.size.width + rect.size.height) / (ratio * ratio + 1.0))
        .max(0.0)
        .min(available.height)
        .min(available.width / ratio);
    Rect::new(origin, Size::new(height * ratio, height))
}

/// Leaves an eight-pixel drag band while forwarding clicks inside the clear crop.
pub(super) fn input_hole(rect: Rect) -> Option<Rect> {
    (rect.size.width > 16.0 && rect.size.height > 16.0).then(|| {
        Rect::new(
            Point::new(rect.origin.x + 8.0, rect.origin.y + 8.0),
            Size::new(rect.size.width - 16.0, rect.size.height - 16.0),
        )
    })
}

/// Identifies a native resize corner before testing the remaining move band.
pub(super) fn corner_at(rect: Rect, point: Point) -> Option<Corner> {
    for (corner, x, y) in [
        (Corner::Nw, rect.origin.x, rect.origin.y),
        (Corner::Ne, rect.origin.x + rect.size.width, rect.origin.y),
        (Corner::Sw, rect.origin.x, rect.origin.y + rect.size.height),
        (
            Corner::Se,
            rect.origin.x + rect.size.width,
            rect.origin.y + rect.size.height,
        ),
    ] {
        if (point.x - x).abs() <= 8.0 && (point.y - y).abs() <= 8.0 {
            return Some(corner);
        }
    }
    None
}

/// Returns the narrow resize band, leaving the inner drag band available for moving.
pub(super) fn edge_at(rect: Rect, point: Point) -> Option<Edge> {
    let right = rect.origin.x + rect.size.width;
    let bottom = rect.origin.y + rect.size.height;
    if point.x >= rect.origin.x && point.x <= right {
        if (point.y - rect.origin.y).abs() <= 4.0 {
            return Some(Edge::North);
        }
        if (point.y - bottom).abs() <= 4.0 {
            return Some(Edge::South);
        }
    }
    if point.y >= rect.origin.y && point.y <= bottom {
        if (point.x - rect.origin.x).abs() <= 4.0 {
            return Some(Edge::West);
        }
        if (point.x - right).abs() <= 4.0 {
            return Some(Edge::East);
        }
    }
    None
}

/// Resizes one edge, keeping its opposite edge fixed and centering a ratio constraint.
pub(super) fn resized_edge(
    rect: Rect,
    edge: Edge,
    at: Point,
    ratio: Option<f32>,
    viewport: Size,
) -> Rect {
    let at = clamped(at, viewport);
    let right = rect.origin.x + rect.size.width;
    let bottom = rect.origin.y + rect.size.height;
    let center = Point::new(
        rect.origin.x + rect.size.width / 2.0,
        rect.origin.y + rect.size.height / 2.0,
    );
    let horizontal = matches!(edge, Edge::West | Edge::East);
    let fixed = match edge {
        Edge::North => bottom,
        Edge::South => rect.origin.y,
        Edge::West => right,
        Edge::East => rect.origin.x,
    };
    let end = if horizontal { at.x } else { at.y };
    let mut extent = (end - fixed).abs();
    let mut other = if horizontal {
        rect.size.height
    } else {
        rect.size.width
    };
    if let Some(ratio) = ratio.filter(|value| value.is_finite() && *value > 0.0) {
        let limit = if horizontal {
            center.y.min(viewport.height - center.y) * 2.0
        } else {
            center.x.min(viewport.width - center.x) * 2.0
        };
        other = (if horizontal {
            extent / ratio
        } else {
            extent * ratio
        })
        .min(limit.max(0.0));
        extent = if horizontal {
            other * ratio
        } else {
            other / ratio
        };
    }
    let start = if end < fixed { fixed - extent } else { fixed };
    if horizontal {
        Rect::new(
            Point::new(start, center.y - other / 2.0),
            Size::new(extent, other),
        )
    } else {
        Rect::new(
            Point::new(center.x - other / 2.0, start),
            Size::new(other, extent),
        )
    }
}

/// Tests whether a pointer is inside the crop including its visible drag band.
pub(super) fn contains(rect: Rect, point: Point) -> bool {
    point.x >= rect.origin.x
        && point.x <= rect.origin.x + rect.size.width
        && point.y >= rect.origin.y
        && point.y <= rect.origin.y + rect.size.height
}

/// Snaps a bounded UI point to the physical desktop's pixel grid.
pub(super) fn pixel_point(point: Point, viewport: Size, scale: f64) -> Point {
    let point = clamped(point, viewport);
    let snap = |value: f32| (f64::from(value) * scale).round() as f32 / scale as f32;
    Point::new(
        snap(point.x).min(viewport.width),
        snap(point.y).min(viewport.height),
    )
}

/// Snaps both crop edges, preserving physical pixel dimensions at fractional DPI.
pub(super) fn pixel_rect(rect: Rect, viewport: Size, scale: f64) -> Rect {
    selection(
        pixel_point(rect.origin, viewport, scale),
        pixel_point(
            Point::new(
                rect.origin.x + rect.size.width,
                rect.origin.y + rect.size.height,
            ),
            viewport,
            scale,
        ),
        viewport,
    )
}
