//! Real native hit testing must route clip presses to their retained JS listener.

use argui_core::{Point, PointerButton, PointerEvent, PointerPhase, Size};
use argui_layout::LayoutEngine;
use argui_text::TextEngine;
use argui_ui::{EventType, UiTree};
use serde_json::json;

/// Selects from the actual laid-out pointer route, rather than calling the keyboard handler.
pub(super) fn select_clip(scene: &super::localization::Scene<'_>) {
    let authored = scene.host.borrow().root_element().unwrap();
    let mut ui = UiTree::new(authored);
    let mut layout = LayoutEngine::new();
    let font = include_bytes!("../../../../vendor/argui/assets/fonts/NotoSans-Regular.ttf");
    let mut text =
        TextEngine::from_embedded_fonts([font.as_slice()], "Noto Sans", "Noto Sans", "Noto Sans");
    let output = layout
        .compute(&mut ui, &mut text, Size::new(1440., 900.))
        .unwrap();
    let clip = ui
        .node_ids()
        .iter()
        .copied()
        .find(|id| ui.key(*id) == Some("timeline-clip-clip"))
        .unwrap();
    let bounds = output
        .nodes
        .iter()
        .find(|node| node.node == clip)
        .unwrap()
        .bounds;
    let point = Point::new(bounds.origin.x + 20., bounds.origin.y + 10.);
    let mut pointer = PointerEvent::mouse(PointerPhase::Pressed, point);
    pointer.button = Some(PointerButton::Primary);
    pointer.buttons = 1;
    let update = ui.pointer_event(pointer, &output.hit_regions);
    let presses: Vec<_> = update
        .events
        .into_iter()
        .filter(|event| event.kind.event_type() == EventType::PointerDown)
        .collect();
    assert_eq!(
        presses.len(),
        1,
        "one clip pointer listener must receive the real press at {point:?}"
    );
    for event in presses {
        let callback = scene
            .host
            .borrow()
            .callback_for(&event)
            .expect("retained clip callback");
        scene
            .gallery
            .deliver(
                &json!({
                    "node": {"slot":callback.node.slot(),"generation":callback.node.generation()},
                    "callback":callback.callback.0,
                    "payload":{"kind":"pointerDown","x":point.x,"y":point.y}
                })
                .to_string(),
            )
            .unwrap();
    }
}
