//! Real native key and wheel routes for the compiled editor, without a desktop window.
use argui_core::{Key, KeyInput, KeyState, Modifiers, Point, ScrollDelta, Size};
use argui_layout::{LayoutEngine, LayoutOutput};
use argui_text::TextEngine;
use argui_ui::{EventType, ScrollAxes, UiTree};

/// Verifies global Space, timeline zoom, and modifier-wheel suppression in the mounted scene.
pub(super) fn validate(scene: &super::localization::Scene<'_>) {
    let (mut tree, output) = layout(scene);
    let input = KeyInput {
        key: Key::Character(" ".into()),
        state: KeyState::Pressed,
        text: Some(" ".into()),
        modifiers: Modifiers::default(),
        repeat: false,
    };
    let events = tree.key_input(&input, &output.hit_regions).events;
    assert!(
        events.len() >= 2,
        "global playback and root modifier listener are present without focus"
    );
    for event in events {
        deliver(scene, event);
    }
    let play_count = scene
        .requests
        .borrow()
        .iter()
        .filter(|encoded| {
            let request: super::ServiceRequest = serde_json::from_str(encoded).unwrap();
            request.service == "editor" && request.method == "play"
        })
        .count();
    assert_eq!(
        play_count, 1,
        "Space toggles once from outside timeline focus"
    );
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    let (mut tree, output) = layout(scene);
    let before = bounds(&tree, &output, "timeline-clip-clip");
    let mut input = input;
    input.key = Key::Character("+".into());
    input.text = None;
    input.modifiers.control = true;
    for event in tree.keyboard_event(&input, &output.hit_regions).events {
        deliver(scene, event);
    }
    let (mut tree, output) = layout(scene);
    let after = bounds(&tree, &output, "timeline-clip-clip");
    assert!(
        after.size.width > before.size.width,
        "Ctrl+ zooms timeline geometry"
    );
    let viewport = output
        .scroll_regions
        .iter()
        .find(|r| tree.key(r.node) == Some("editor-timeline-horizontal"))
        .expect("timeline viewport");
    assert_eq!(viewport.config.axes, ScrollAxes::Both);
    assert!(!viewport.config.enabled);
    let point = Point::new(
        viewport.bounds.origin.x + 50.,
        viewport.bounds.origin.y + 20.,
    );
    let wheel = ScrollDelta::Pixels(Point::new(0., 120.));
    assert!(
        !tree
            .scroll(point, wheel, &output.scroll_regions)
            .scroll_changed
    );
    let events = tree
        .wheel_event(point, wheel, &output.scroll_regions)
        .events;
    assert!(
        events
            .iter()
            .any(|event| event.kind.event_type() == EventType::Wheel)
    );
    for event in events {
        deliver(scene, event);
    }
    let (tree, output) = layout(scene);
    assert!(
        bounds(&tree, &output, "timeline-clip-clip").size.width > after.size.width,
        "Ctrl+wheel reaches timeline zoom"
    );
    input.state = KeyState::Released;
    input.modifiers.control = false;
    let (mut tree, output) = layout(scene);
    for event in tree.keyboard_event(&input, &output.hit_regions).events {
        deliver(scene, event);
    }
    super::assert_no_rejections(scene.rejections, scene.name);
}
fn layout(scene: &super::localization::Scene<'_>) -> (UiTree, LayoutOutput) {
    let mut tree = UiTree::new(scene.host.borrow().root_element().unwrap());
    let mut layout = LayoutEngine::new();
    let font = include_bytes!("../../../../vendor/argui/assets/fonts/NotoSans-Regular.ttf");
    let mut text =
        TextEngine::from_embedded_fonts([font.as_slice()], "Noto Sans", "Noto Sans", "Noto Sans");
    let output = layout
        .compute(&mut tree, &mut text, Size::new(1440., 900.))
        .unwrap();
    (tree, output)
}
fn bounds(tree: &UiTree, output: &LayoutOutput, key: &str) -> argui_core::Rect {
    let node = tree
        .node_ids()
        .iter()
        .find(|node| tree.key(**node) == Some(key))
        .unwrap();
    output
        .nodes
        .iter()
        .find(|item| item.node == *node)
        .unwrap()
        .bounds
}
fn deliver(scene: &super::localization::Scene<'_>, event: argui_ui::UiEvent) {
    let callback = scene
        .host
        .borrow()
        .callback_for(&event)
        .expect("native callback");
    let delivery = argui_runtime::NativeHostDelivery {
        callback,
        kind: event.kind,
        pointer: None,
    };
    scene
        .gallery
        .deliver(&beam_native::event_json(&delivery).to_string())
        .unwrap();
}
