//! Native layout and compositor checks for the compiled shared editor controls.

use argui_animation::Time;
use argui_core::{Point, PointerButton, PointerEvent, PointerPhase, Rect, Size};
use argui_layout::{LayoutEngine, LayoutOutput};
use argui_text::TextEngine;
use argui_ui::{Element, ElementKind, EventType, NodeId, UiEventKind, UiTree};

const FONT: &[u8] = include_bytes!("../../../../vendor/argui/assets/fonts/NotoSans-Regular.ttf");

#[path = "editor_controls_responsive.rs"]
mod responsive;

/// Form fields fit a narrow inspector and library labels collapse inside the engine.
pub(super) fn validate(scene: &super::localization::Scene<'_>) {
    let authored = root(scene);
    responsive::validate(&authored);
    validate_pointer_routes(&authored);
    for width in [272., 320., 420.] {
        let mut view = authored.clone();
        element_mut(&mut view, "editor-inspector-pane")
            .style
            .size
            .width = argui_ui::length(width);
        let (ui, output) = layout(view);
        let pane = bounds(&output, node(&ui, "editor-inspector-pane"));
        let trigger = node(&ui, "editor-resolution");
        let field = bounds(&output, trigger);
        assert!(
            field.size.width >= 110.,
            "inspector {width}: field is too small: {field:?}"
        );
        assert_inside(field, pane, "resolution");
        let icon = vector_node(&ui, trigger);
        assert_inside(bounds(&output, icon), field, "resolution chevron");
    }
    for (width, labeled) in [(320., false), (500., false), (600., true)] {
        let mut view = authored.clone();
        element_mut(&mut view, "editor-library-pane")
            .style
            .size
            .width = argui_ui::length(width);
        element_mut(&mut view, "editor-library").style.size.width = argui_ui::length(width - 60.);
        let (ui, output) = layout(view);
        let label = bounds(&output, node(&ui, "editor-library-media-label"));
        assert_eq!(
            label.size.height > 0.,
            labeled,
            "library {width}: label {label:?}"
        );
        let tab = node(&ui, "editor-library-media");
        assert!(
            ui.element_for(tab)
                .unwrap()
                .semantics
                .as_ref()
                .unwrap()
                .label
                .is_some()
        );
        assert!(bounds(&output, vector_node(&ui, tab)).size.width > 0.);
    }
    for (width, extra_controls) in [(280., false), (760., true)] {
        let mut view = authored.clone();
        element_mut(&mut view, "editor-preview-pane")
            .style
            .size
            .width = argui_ui::length(width);
        element_mut(&mut view, "editor-preview-pane")
            .style
            .flex_grow = 0.;
        element_mut(&mut view, "editor-preview-pane")
            .style
            .flex_shrink = 0.;
        let (ui, output) = layout(view);
        let bar = bounds(&output, node(&ui, "editor-preview-controls"));
        let quality = bounds(&output, node(&ui, "editor-quality"));
        assert_inside(quality, bar, "preview quality");
        assert_inside(
            bounds(&output, vector_node(&ui, node(&ui, "editor-quality"))),
            quality,
            "quality chevron",
        );
        let clipped = ui.node_ids().iter().any(|id| {
            let element = ui.element_for(*id).unwrap();
            element
                .children
                .iter()
                .any(|child| super::keyed_element(child, "editor-aspect").is_some())
                && bounds(&output, *id).size.width == 0.
        });
        assert_eq!(!clipped, extra_controls);
    }
    for (id, expected) in [("editor-aspect", 160.), ("editor-quality", 180.)] {
        super::click_named(scene.gallery, scene.operations, id).unwrap();
        scene.gallery.tick(0.).unwrap();
        let view = root(scene);
        let popup = super::keyed_element(&view, &format!("{id}-popup")).unwrap();
        let menu = popup.children[0].children[0].clone();
        let (ui, output) = layout(view);
        assert_eq!(
            bounds(&output, native_node(&ui, &menu)).size.width,
            expected
        );
        super::click_named(scene.gallery, scene.operations, id).unwrap();
        scene.gallery.tick(0.).unwrap();
    }
    super::assert_no_rejections(scene.rejections, scene.name);
}

/// Hints receive actual native hover boundaries and preserve their owner's click route.
fn validate_pointer_routes(authored: &Element) {
    for control in ["editor-library-media", "editor-undo"] {
        let (mut ui, output) = layout(authored.clone());
        let owner = ui.element_for(node(&ui, control)).unwrap();
        fn trigger(root: &Element) -> Option<&Element> {
            if root
                .event_listeners
                .iter()
                .any(|listener| listener.event == EventType::PointerEnter)
            {
                return Some(root);
            }
            root.children.iter().find_map(trigger)
        }
        let hint = native_node(&ui, trigger(owner).expect("hint trigger"));
        let rectangle = bounds(&output, hint);
        let position = Point::new(
            rectangle.origin.x + rectangle.size.width / 2.,
            rectangle.origin.y + rectangle.size.height / 2.,
        );
        let entered = ui.pointer_moved(position, &output.hit_regions);
        assert!(
            entered
                .events
                .iter()
                .any(|event| event.current_target() == hint
                    && event.kind.event_type() == EventType::PointerEnter),
            "{control}: hint must receive hover from the actual hit target"
        );
        assert!(
            ui.pointer_moved(Point::new(position.x + 1., position.y), &output.hit_regions)
                .events
                .is_empty(),
            "hints must not send JS for pointer movement"
        );
        let mut down = PointerEvent::mouse(PointerPhase::Pressed, position);
        down.button = Some(PointerButton::Primary);
        down.buttons = 1;
        ui.pointer_event(down, &output.hit_regions);
        let mut up = PointerEvent::mouse(PointerPhase::Released, position);
        up.button = Some(PointerButton::Primary);
        let released = ui.pointer_event(up, &output.hit_regions);
        assert!(
            released
                .events
                .iter()
                .any(|event| event.current_key() == Some(control)
                    && matches!(event.kind, UiEventKind::Click(_))),
            "{control}: hint must preserve native clicks"
        );
        let left = ui.pointer_moved(Point::new(0., 0.), &output.hit_regions);
        assert!(
            left.events
                .iter()
                .any(|event| event.current_target() == hint
                    && event.kind.event_type() == EventType::PointerLeave)
        );
    }
}

/// Sequence snapshots retain the recorder indicator and animate its native offset.
pub(super) fn validate_sequence_animation(scene: &super::localization::Scene<'_>) {
    let mut ui = UiTree::new(root(scene));
    let mut engine = LayoutEngine::new();
    let mut text = TextEngine::from_embedded_fonts([FONT], "Noto Sans", "Noto Sans", "Noto Sans");
    let viewport = Size::new(1440., 900.);
    let indicator = node(&ui, "editor-sequences-indicator");
    let position = |ui: &UiTree, output: &LayoutOutput| {
        bounds(output, indicator).origin.x
            - bounds(output, node(ui, "editor-sequences")).origin.x
            - 4.
    };
    let output = engine.compute(&mut ui, &mut text, viewport).unwrap();
    let from = position(&ui, &output);
    assert!(from > 0.);
    super::click_named(scene.gallery, scene.operations, "editor-sequences-first").unwrap();
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    ui.update(root(scene));
    assert_eq!(node(&ui, "editor-sequences-indicator"), indicator);
    let output = engine.compute(&mut ui, &mut text, viewport).unwrap();
    assert_eq!(
        position(&ui, &output),
        from,
        "first frame retains the old location"
    );
    ui.advance_animations(Time::from_nanos(0));
    ui.advance_animations(Time::from_nanos(50_000_000));
    let output = engine.compute(&mut ui, &mut text, viewport).unwrap();
    let midpoint = position(&ui, &output);
    assert!(
        midpoint > 0. && midpoint < from,
        "native intermediate translation {midpoint}/{from}"
    );
    ui.advance_animations(Time::from_nanos(180_000_000));
    let output = engine.compute(&mut ui, &mut text, viewport).unwrap();
    assert_eq!(position(&ui, &output), 0.);
    super::assert_no_rejections(scene.rejections, scene.name);
}

/// Measures a real mounted hint with short and wrapped content.
pub(super) fn validate_hint(authored: &Element, id: &str) {
    responsive::validate_hint(authored, id);
}

/// Computes actual native layout using the same text measurer as the application.
fn layout(root: Element) -> (UiTree, LayoutOutput) {
    let mut ui = UiTree::new(root);
    let mut engine = LayoutEngine::new();
    let mut text = TextEngine::from_embedded_fonts([FONT], "Noto Sans", "Noto Sans", "Noto Sans");
    let output = engine
        .compute(&mut ui, &mut text, Size::new(1440., 900.))
        .unwrap();
    (ui, output)
}

/// Finds an element for a test-only preferred-size override.
fn element_mut<'a>(root: &'a mut Element, key: &str) -> &'a mut Element {
    fn find<'a>(root: &'a mut Element, key: &str) -> Option<&'a mut Element> {
        if root.key.as_deref() == Some(key) {
            return Some(root);
        }
        root.children.iter_mut().find_map(|child| find(child, key))
    }
    find(root, key).unwrap_or_else(|| panic!("missing {key}"))
}

/// Resolves a native retained node by its public key.
fn node(ui: &UiTree, key: &str) -> NodeId {
    *ui.node_ids()
        .iter()
        .find(|id| ui.key(**id) == Some(key))
        .unwrap_or_else(|| panic!("missing {key}"))
}

/// Finds the vector inside a particular control, avoiding glyph-shape assumptions.
fn vector_node(ui: &UiTree, control: NodeId) -> NodeId {
    fn vector(element: &Element) -> Option<&Element> {
        if matches!(element.kind, ElementKind::Vector { .. }) {
            return Some(element);
        }
        element.children.iter().find_map(vector)
    }
    let icon = vector(ui.element_for(control).unwrap()).expect("control vector");
    native_node(ui, icon)
}

/// Resolves the node sharing a retained authored subtree.
fn native_node(ui: &UiTree, element: &Element) -> NodeId {
    *ui.node_ids()
        .iter()
        .find(|id| ui.element_for(**id).unwrap().ptr_eq(element))
        .unwrap()
}

/// Reads a resolved logical rectangle for a native node.
fn bounds(output: &LayoutOutput, node: NodeId) -> Rect {
    output
        .nodes
        .iter()
        .find(|entry| entry.node == node)
        .unwrap()
        .bounds
}

/// Ensures the whole child box stays visible in its owner, including the arrow.
fn assert_inside(child: Rect, parent: Rect, label: &str) {
    assert!(
        child.origin.x >= parent.origin.x - 0.5
            && child.origin.x + child.size.width <= parent.origin.x + parent.size.width + 0.5,
        "{label}: {child:?} exceeds {parent:?}"
    );
}

/// Returns an owned tree without retaining a host borrow across callback delivery.
fn root(scene: &super::localization::Scene<'_>) -> Element {
    scene.host.borrow().root_element().unwrap()
}
