use super::types::{RegionState, ScreenPixels};
use argui_core::{Point, Rect, Size};

fn state() -> RegionState {
    RegionState {
        viewport: Size::new(1920.0, 1080.0),
        pixel_scale: 1.0,
        pixels: Some(ScreenPixels {
            width: 3840,
            height: 2160,
            rgba: [].into(),
        }),
        ..RegionState::default()
    }
}

#[test]
fn dimensions_use_real_capture_pixels_independently_of_native_window_dpi() {
    let mut state = state();
    for dpi in [1.0, 1.25, 1.75, 2.0] {
        state.pixel_scale = dpi;
        assert_eq!(
            state.capture_dimensions(Size::new(320.0, 180.0)),
            (640, 360)
        );
    }
}

#[test]
fn snapping_preserves_capture_boundaries_and_clamps_outside_pointer_input() {
    let state = state();
    assert_eq!(
        state.capture_point(Point::new(12.3, 16.8)),
        Point::new(12.5, 17.0)
    );
    assert_eq!(
        state.capture_point(Point::new(-30.0, 5000.0)),
        Point::new(0.0, 1080.0)
    );
    let rect = state.capture_rect(Rect::new(Point::new(12.3, 16.8), Size::new(10.2, 15.9)));
    assert_eq!(
        rect,
        Rect::new(Point::new(12.5, 17.0), Size::new(10.0, 15.5))
    );
    assert_eq!(state.capture_dimensions(rect.size), (20, 31));
}

#[test]
fn fractional_compositor_rounding_uses_independent_axis_scales() {
    let mut state = state();
    state.pixels.as_mut().unwrap().width = 2401;
    state.pixels.as_mut().unwrap().height = 1350;
    assert_eq!(state.capture_dimensions(state.viewport), (2401, 1350));
    let rect = state.capture_rect(Rect::new(
        Point::new(1910.0, 1070.0),
        Size::new(500.0, 500.0),
    ));
    assert_eq!(rect.origin.x + rect.size.width, state.viewport.width);
    assert_eq!(rect.origin.y + rect.size.height, state.viewport.height);
    let scale = state.capture_scale();
    assert_ne!(scale.x, scale.y);
}

#[test]
fn an_unopened_or_empty_viewport_uses_native_geometry_until_capture_is_ready() {
    let mut state = RegionState {
        pixel_scale: 1.5,
        ..RegionState::default()
    };
    assert_eq!(state.capture_dimensions(Size::new(20.0, 40.0)), (30, 60));
    state.pixels = Some(ScreenPixels {
        width: 1920,
        height: 1080,
        rgba: [].into(),
    });
    assert_eq!(state.capture_scale().x, 1.5);
    state.viewport = Size::new(0.0, 100.0);
    assert_eq!(state.capture_scale().y, 1.5);
}
