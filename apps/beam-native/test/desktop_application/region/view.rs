use super::types::RegionState;
use argui_core::{Point, Rect, Size};
use argui_ui::Element;

#[test]
fn passive_capture_mask_paints_only_outside_the_crop_without_captured_resize_handles() {
    let state = RegionState {
        passive: true,
        viewport: Size::new(800.0, 600.0),
        crop: Some(Rect::new(Point::new(100.0, 80.0), Size::new(300.0, 200.0))),
        ..RegionState::default()
    };
    let root = state.view();
    assert_eq!(root.children.len(), 4);
    for child in &root.children {
        assert!(child.key.as_deref().unwrap().starts_with("region-dim-"));
    }
}

#[test]
fn mask_and_edges_retain_stable_identities_without_transparent_outlined_quads() {
    let state = RegionState {
        viewport: Size::new(800.0, 600.0),
        crop: Some(Rect::new(Point::new(100.0, 80.0), Size::new(300.0, 200.0))),
        ..RegionState::default()
    };
    let root = state.view();
    assert_eq!(root.children.len(), 24);
    let keys = root
        .children
        .iter()
        .map(|child| child.key.as_deref().unwrap())
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(keys.len(), 24);
    for child in &root.children {
        assert_eq!(child.paint.quad.border, None);
    }
    let changed = RegionState {
        crop: Some(Rect::new(Point::new(50.0, 70.0), Size::new(200.0, 180.0))),
        ..state
    };
    assert_eq!(
        root.children
            .iter()
            .map(|child| &child.key)
            .collect::<Vec<_>>(),
        changed
            .view()
            .children
            .iter()
            .map(|child| &child.key)
            .collect::<Vec<_>>()
    );
}

#[test]
fn collapsed_crops_have_no_degenerate_borders_or_corner_handles() {
    for size in [
        Size::new(0.0, 0.0),
        Size::new(0.0, 100.0),
        Size::new(100.0, 0.0),
    ] {
        let state = RegionState {
            crop: Some(Rect::new(Point::new(100.0, 80.0), size)),
            ..RegionState::default()
        };
        assert_eq!(state.view().children.len(), 4);
    }
}

#[test]
fn empty_selection_displays_the_current_localized_instruction() {
    let state = RegionState {
        viewport: Size::new(800.0, 600.0),
        instruction: "Choisissez une région".into(),
        ..RegionState::default()
    };
    fn text(root: &Element) -> bool {
        matches!(&root.kind, argui_ui::ElementKind::Text { content, .. } if content.as_str() == "Choisissez une région")
            || root.children.iter().any(text)
    }
    let root = state.view();
    assert_eq!(root.children.len(), 5);
    assert!(text(&root));
}
