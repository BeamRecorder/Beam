//! Monitor-bounded placement of crop controls, actions and precision feedback.

use argui_core::{Point, Rect, Size};

/// Defaults preparation controls to the monitor's bottom center for every crop.
pub(super) fn initial_actions(viewport: Size) -> Rect {
    let size = actions_size(viewport);
    Rect::new(
        Point::new(
            ((viewport.width - size.width) / 2.0).max(0.0),
            (viewport.height - size.height - 20.0).max(0.0),
        ),
        size,
    )
}

/// Aligns dimensions and presets to the crop's left edge, above it when possible.
pub(super) fn controls(crop: Rect, viewport: Size) -> Rect {
    let size = Size::new(
        (viewport.width - 16.0).clamp(1.0, super::CONTROLS_SIZE.0 as f32),
        (viewport.height - 16.0).clamp(1.0, super::CONTROLS_SIZE.1 as f32),
    );
    let x = crop
        .origin
        .x
        .clamp(0.0, (viewport.width - size.width).max(0.0));
    let bottom = crop.origin.y + crop.size.height;
    let y = if crop.origin.y >= size.height + 8.0 {
        crop.origin.y - size.height - 8.0
    } else if bottom + 8.0 + size.height <= viewport.height {
        bottom + 8.0
    } else {
        (crop.origin.y + 8.0).min((viewport.height - size.height).max(0.0))
    };
    Rect::new(Point::new(x, y), size)
}

/// Keeps the live read-only dimensions at the crop's upper left, flipping below it.
pub(super) fn dimensions(crop: Rect, viewport: Size) -> Rect {
    let size = Size::new(viewport.width.min(104.0), viewport.height.min(22.0));
    let x = crop
        .origin
        .x
        .clamp(0.0, (viewport.width - size.width).max(0.0));
    let y = if crop.origin.y >= size.height + 8.0 {
        crop.origin.y - size.height - 8.0
    } else {
        (crop.origin.y + crop.size.height + 8.0).min((viewport.height - size.height).max(0.0))
    };
    Rect::new(Point::new(x, y), size)
}

/// Allows the same selectors to wrap onto a second row on narrow DPI-scaled screens.
fn actions_size(viewport: Size) -> Size {
    let width = (viewport.width - 16.0).clamp(1.0, super::ACTIONS_SIZE.0 as f32);
    let height = if width < 560.0 {
        88.0
    } else {
        super::ACTIONS_SIZE.1 as f32
    };
    Size::new(width, (viewport.height - 16.0).clamp(1.0, height))
}

/// Keeps precision feedback away from the pointer, flipping at monitor edges.
pub(super) fn feedback(at: Point, size: Size, viewport: Size) -> Rect {
    let axis = |point: f32, extent: f32, limit: f32| {
        let preferred = if point + 24.0 + extent <= limit - 8.0 {
            point + 24.0
        } else {
            point - 24.0 - extent
        };
        preferred.clamp(0.0, (limit - extent).max(0.0))
    };
    Rect::new(
        Point::new(
            axis(at.x, size.width, viewport.width),
            axis(at.y, size.height, viewport.height),
        ),
        size,
    )
}
