//! Checks actual compiled handles with native layout and input, without a window.

use argui_animation::Time;
use argui_core::{Color, Point, PointerButton, PointerEvent, PointerPhase, Rect, Size};
use argui_layout::{LayoutEngine, LayoutOutput};
use argui_paint::Fill;
use argui_runtime::WireOperation;
use argui_text::TextEngine;
use argui_ui::{EventType, NodeId, ResizeAxis, UiEventKind, UiTree};
use serde_json::{Value, json};

const FONT: &[u8] = include_bytes!("../../../../vendor/argui/assets/fonts/NotoSans-Regular.ttf");

/// Verifies centering, native hover and commit-only input on all five editor separators.
pub(super) fn validate(scene: &super::localization::Scene<'_>) {
    let authored = scene.host.borrow().root_element().unwrap();
    for divider in [
        "editor-library-divider",
        "editor-inspector-divider",
        "editor-timeline-divider",
        "editor-track-divider",
        "editor-media-sidebar-divider",
    ] {
        let mut ui = UiTree::new(authored.clone());
        let mut layout = LayoutEngine::new();
        let mut text =
            TextEngine::from_embedded_fonts([FONT], "Noto Sans", "Noto Sans", "Noto Sans");
        let viewport = Size::new(1440., 900.);
        let mut output = layout.compute(&mut ui, &mut text, viewport).unwrap();
        let handle = node(&ui, &format!("{divider}-handle"));
        let pill = node(&ui, &format!("{divider}-pill"));
        let handle_bounds = bounds(&output, handle);
        let pill_bounds = bounds(&output, pill);
        let origin = center(handle_bounds);
        assert!(
            (center(pill_bounds).x - origin.x).abs() <= 0.5,
            "{divider}: pill must be centered horizontally"
        );
        assert!(
            (center(pill_bounds).y - origin.y).abs() <= 0.5,
            "{divider}: pill must be centered vertically"
        );
        let element = ui.element_for(pill).unwrap();
        assert_eq!(
            ui.resolved_quad(pill, element).background,
            Some(Fill::Solid(Color::TRANSPARENT)),
            "{divider}: idle pill must be invisible"
        );
        let interaction = ui
            .element_for(handle)
            .unwrap()
            .interaction
            .as_ref()
            .unwrap();
        let config = interaction
            .resize
            .as_ref()
            .expect("engine-owned resizing")
            .clone();
        assert!(
            ui.element_for(handle)
                .unwrap()
                .event_listeners
                .iter()
                .all(|listener| listener.event == EventType::ResizeCommit)
        );
        let target = node(&ui, &config.target);
        let initial = bounds(&output, target);
        assert!(
            ui.pointer_moved(origin, &output.hit_regions)
                .events
                .is_empty()
        );
        ui.advance_animations(Time::from_nanos(128_000_000));
        assert_eq!(
            ui.resolved_quad(pill, ui.element_for(pill).unwrap())
                .background,
            Some(Fill::Solid(Color::from_hex("#ea580c").unwrap()))
        );
        ui.pointer_moved(Point::new(0., 0.), &output.hit_regions);
        ui.advance_animations(Time::from_nanos(256_000_000));
        assert_eq!(
            ui.resolved_quad(pill, ui.element_for(pill).unwrap())
                .background,
            Some(Fill::Solid(Color::TRANSPARENT))
        );

        let revision = ui.revision();
        let started = ui.pointer_event(pointer(PointerPhase::Pressed, origin), &output.hit_regions);
        assert!(
            started.events.is_empty(),
            "{divider}: starting a resize needs no JS"
        );
        let mut final_position = origin;
        for sample in 1..=1000 {
            let delta = sample as f32 / 20. * if config.trailing { -1. } else { 1. };
            final_position = match config.axis {
                ResizeAxis::Horizontal => Point::new(origin.x + delta, origin.y),
                ResizeAxis::Vertical => Point::new(origin.x, origin.y + delta),
            };
            let update = ui.pointer_event(
                pointer(PointerPhase::Moved, final_position),
                &output.hit_regions,
            );
            assert!(
                update.events.is_empty(),
                "{divider}: sample {sample} reached JS"
            );
            if sample % 100 == 0 {
                output = layout.compute(&mut ui, &mut text, viewport).unwrap();
            }
        }
        let resized = bounds(&output, target);
        let initial_value = match config.axis {
            ResizeAxis::Horizontal => initial.size.width,
            ResizeAxis::Vertical => initial.size.height,
        };
        let native_value = match config.axis {
            ResizeAxis::Horizontal => resized.size.width,
            ResizeAxis::Vertical => resized.size.height,
        };
        assert!(
            (native_value
                - (initial_value + 50.)
                    .clamp(config.minimum, config.maximum)
                    .round())
            .abs()
                <= 1.
        );
        assert_eq!(
            ui.revision(),
            revision,
            "native resize must retain the authored tree"
        );
        let released = ui.pointer_event(
            pointer(PointerPhase::Released, final_position),
            &output.hit_regions,
        );
        assert_eq!(
            released.events.len(),
            1,
            "{divider}: only one commit callback is allowed"
        );
        assert!(matches!(
            released.events[0].kind,
            UiEventKind::ResizeCommitted { .. }
        ));
    }
    validate_js_commit(scene);
}

/// Delivers a native size commit through the real QuickJS callback and checks its new layout.
fn validate_js_commit(scene: &super::localization::Scene<'_>) {
    let public_id = "editor-library-divider-handle";
    let contract: Value = serde_json::from_str(super::CONTRACT).unwrap();
    let property = super::contract_member(&contract, "TouchArea", "properties", "id");
    let event_id = super::contract_member(&contract, "TouchArea", "events", "resizeCommit");
    let (host_node, callback) = {
        let trace = scene.operations.borrow();
        let host_node = super::native_id(&trace, property, public_id);
        let callback = trace
            .iter()
            .rev()
            .find_map(|operation| match operation {
                WireOperation::SetListener {
                    id,
                    event,
                    callback,
                } if *id == host_node && *event == event_id => *callback,
                _ => None,
            })
            .unwrap();
        (host_node, callback)
    };
    scene
        .gallery
        .deliver(
            &json!({"node":{"slot":host_node.slot,"generation":host_node.generation},
        "callback":callback,"payload":{"kind":"resizeCommit","value":500.}})
            .to_string(),
        )
        .unwrap();
    scene.gallery.tick(0.).unwrap();
    super::assert_no_rejections(scene.rejections, scene.name);
    let root = scene.host.borrow().root_element().unwrap();
    let pane = super::keyed_element(&root, "editor-library-pane").unwrap();
    assert_eq!(pane.style.size.width, argui_ui::length(500.));
}

/// Finds a retained native ID by its public `key` in the mounted tree.
fn node(ui: &UiTree, key: &str) -> NodeId {
    *ui.node_ids()
        .iter()
        .find(|node| ui.key(**node) == Some(key))
        .unwrap_or_else(|| panic!("missing {key}"))
}

/// Reads the real native layout rectangle for `node`.
fn bounds(output: &LayoutOutput, node: NodeId) -> Rect {
    output
        .nodes
        .iter()
        .find(|entry| entry.node == node)
        .unwrap()
        .bounds
}

/// Returns the logical center of `bounds`.
fn center(bounds: Rect) -> Point {
    Point::new(
        bounds.origin.x + bounds.size.width / 2.,
        bounds.origin.y + bounds.size.height / 2.,
    )
}

/// Creates primary mouse phases at an absolute logical `position`.
fn pointer(phase: PointerPhase, position: Point) -> PointerEvent {
    PointerEvent {
        button: matches!(phase, PointerPhase::Pressed | PointerPhase::Released)
            .then_some(PointerButton::Primary),
        buttons: u16::from(matches!(phase, PointerPhase::Pressed | PointerPhase::Moved)),
        ..PointerEvent::mouse(phase, position)
    }
}
