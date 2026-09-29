use super::types::{RegionState, ScreenPixels};
use argui_core::{Color, Point, Rect, Size};
use argui_paint::Fill;
use argui_ui::{Element, ElementKind, ImageSampling};

fn state() -> RegionState {
    let mut state = RegionState {
        viewport: Size::new(800.0, 600.0),
        crop: Some(Rect::new(Point::new(100.0, 80.0), Size::new(300.0, 200.0))),
        pixels: Some(ScreenPixels {
            width: 1000,
            height: 750,
            rgba: vec![42; 1000 * 750 * 4].into(),
        }),
        ..RegionState::default()
    };
    state.magnify(Point::new(10.0, 12.0));
    state
}

fn texts(root: &Element, values: &mut Vec<String>) {
    if let ElementKind::Text { content, .. } = &root.kind {
        values.push(content.as_str().into());
    }
    for child in &root.children {
        texts(child, values);
    }
}

#[test]
fn precision_pixels_use_nearest_sampling_and_the_actual_native_asset() {
    let state = state();
    let magnifier = state.magnifier.as_ref().unwrap();
    let root = state.precision_view(magnifier);
    assert!(
        matches!(root.children[0].kind, ElementKind::Image { image, sampling: ImageSampling::Nearest, .. } if image == state.images()[0].id)
    );
    assert!(
        root.children
            .iter()
            .any(|child| child.key.as_deref() == Some("region-crosshair-vertical"))
    );
}

#[test]
fn precision_labels_use_desktop_coordinates_and_capture_pixel_dimensions() {
    let mut state = state();
    state.pixel_scale = 1.25;
    state.monitor = Some(argui_runtime::NativeMonitorInfo {
        name: None,
        x: -1000,
        y: 200,
        width: 1000,
        height: 750,
        scale_factor: 1.25,
        primary: false,
    });
    let mut values = Vec::new();
    texts(
        &state.precision_view(state.magnifier.as_ref().unwrap()),
        &mut values,
    );
    assert_eq!(values, ["X -987 · Y 215", "375 × 250"]);
}

#[test]
fn precision_disappears_when_its_native_sample_is_cleared() {
    let mut state = state();
    assert!(
        state
            .view()
            .children
            .iter()
            .any(|child| child.key.as_deref() == Some("region-magnifier"))
    );
    state.magnifier = None;
    assert!(
        !state
            .view()
            .children
            .iter()
            .any(|child| child.key.as_deref() == Some("region-magnifier"))
    );
    assert!(state.images().is_empty());
}

#[test]
fn dimensions_remain_visible_while_drawing_with_the_precision_loupe() {
    let mut state = state();
    state.pixel_scale = 1.25;
    state.drag = Some(super::types::Drag {
        id: argui_core::PointerId::MOUSE,
        origin: Point::new(100.0, 80.0),
        previous: None,
        mode: super::types::DragMode::Draw,
        grip_offset: Point::new(0.0, 0.0),
    });
    let root = state.view();
    let badge = root
        .children
        .iter()
        .find(|child| child.key.as_deref() == Some("region-dimensions"))
        .unwrap();
    let mut values = Vec::new();
    texts(badge, &mut values);
    assert_eq!(values, ["375 × 250"]);
    assert!(
        root.children
            .iter()
            .any(|child| child.key.as_deref() == Some("region-magnifier"))
    );
    for (surface, foreground) in [("#ffffff", "#16161a"), ("#2b2b2e", "#f5f5f7")] {
        state.surface = Color::from_hex(surface).unwrap();
        state.foreground = Color::from_hex(foreground).unwrap();
        let root = state.view();
        let badge = root
            .children
            .iter()
            .find(|child| child.key.as_deref() == Some("region-dimensions"))
            .unwrap();
        assert_eq!(
            badge.paint.quad.background,
            Some(Fill::Solid(state.surface))
        );
        let ElementKind::Text { style, .. } = &badge.children[0].kind else {
            panic!("live measurement text")
        };
        assert_eq!(style.color, state.foreground);
    }
}
