//! Crop geometry in the same UI units as the native spotlight input region.

use super::types::Corner;
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

/// Tests whether a pointer is inside the crop including its visible drag band.
pub(super) fn contains(rect: Rect, point: Point) -> bool {
    point.x >= rect.origin.x
        && point.x <= rect.origin.x + rect.size.width
        && point.y >= rect.origin.y
        && point.y <= rect.origin.y + rect.size.height
}

#[cfg(test)]
#[path = "../../../test/desktop_application/region/geometry.rs"]
mod tests;
