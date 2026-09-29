//! Recorder clock updates through real QuickJS replies and resize events.

use crate::{ServiceRequest, keyed_element, localization::Scene, service_value};
use argui_core::{Point, PointerButton, PointerEvent, PointerPhase, Rect, Size};
use argui_layout::LayoutEngine;
use argui_text::TextEngine;
use argui_ui::ElementKind;
use argui_ui::{EventType, UiTree};
use beam_native::{ServiceOutcome, ServiceResponse};
use serde_json::json;

/// Replies to queued native operations using an actual session duration.
fn reply(scene: &Scene<'_>, seconds: u64) {
    loop {
        let Some(request) = scene.requests.borrow_mut().pop_front() else {
            break;
        };
        let request: ServiceRequest = serde_json::from_str(&request).unwrap();
        let value = if request.service == "beam" && request.method == "status" {
            json!({ "state": "recording", "sessionId": "session", "manifest": { "durationNs": seconds * 1_000_000_000 } })
        } else {
            service_value(&request, crate::DEFAULT_OUTPUT_LABEL)
        };
        scene
            .gallery
            .deliver_service(
                &ServiceResponse {
                    session: 1,
                    window: request.window,
                    request_id: request.request_id,
                    outcome: ServiceOutcome::Ok(value),
                }
                .json()
                .to_string(),
            )
            .unwrap();
    }
}

/// Asserts the painted native clock label rather than JavaScript state alone.
fn assert_clock(scene: &Scene<'_>, expected: &str) {
    let root = scene.host.borrow().root_element().unwrap();
    let clock = keyed_element(&root, "recorder-clock").unwrap();
    let ElementKind::Text { content, .. } = &clock.kind else {
        panic!("native recorder clock")
    };
    assert_eq!(content.as_str(), expected);
}

/// Checks that native time advances and responsive layout does not reset it.
pub(super) fn validate(scene: &Scene<'_>) {
    if scene.name != "app.mjs:mountRecorder" {
        return;
    }
    assert_clock(scene, "00:05");
    validate_controls(scene);
    scene.gallery.tick(1000.0).unwrap();
    reply(scene, 7);
    assert_clock(scene, "00:07");
    scene.gallery.deliver_service(&ServiceResponse {
        session: 1,
        window: "recorder".into(),
        request_id: 0,
        outcome: ServiceOutcome::Event(json!({
            "type": "windowResized", "window": "recorder", "physicalWidth": 480, "physicalHeight": 54,
        })),
    }.json().to_string()).unwrap();
    assert_clock(scene, "00:07");
    scene.gallery.tick(2000.0).unwrap();
    reply(scene, 9);
    assert_clock(scene, "00:09");
}

fn validate_controls(scene: &Scene<'_>) {
    let mut ui = UiTree::new(scene.host.borrow().root_element().unwrap());
    let font = include_bytes!("../../../../vendor/argui/assets/fonts/NotoSans-Regular.ttf");
    let mut text =
        TextEngine::from_embedded_fonts([font.as_slice()], "Noto Sans", "Noto Sans", "Noto Sans");
    let output = LayoutEngine::new()
        .compute(&mut ui, &mut text, Size::new(240., 54.))
        .unwrap();
    let keys = [
        "recorder-delete",
        "recorder-reset",
        "recorder-pause",
        "recorder-stop",
        "recorder-clock",
    ];
    let rectangles = keys.map(|key| {
        let id = ui
            .node_ids()
            .iter()
            .copied()
            .find(|id| ui.key(*id) == Some(key))
            .unwrap();
        (
            key,
            output
                .nodes
                .iter()
                .find(|node| node.node == id)
                .unwrap()
                .bounds,
        )
    });
    let bounds = |key| -> Rect { rectangles.iter().find(|(name, _)| *name == key).unwrap().1 };
    for pair in keys.windows(2) {
        let left = bounds(pair[0]);
        let right = bounds(pair[1]);
        assert!(
            left.origin.x + left.size.width <= right.origin.x,
            "controls must keep their requested order"
        );
    }
    let clock = bounds("recorder-clock");
    let stop = bounds("recorder-stop");
    let pause = bounds("recorder-pause");
    assert!(stop.size.height > pause.size.height && stop.size.width > pause.size.width);
    let middle = |rect: Rect| rect.origin.y + rect.size.height / 2.;
    assert!(
        (middle(clock) - 27.).abs() < 0.6,
        "clock must sit on the recording bar's center line: {clock:?}"
    );
    assert!(
        (middle(clock) - middle(stop)).abs() < 0.6,
        "clock must be vertically centered: {clock:?}, {stop:?}"
    );
    let delete = bounds("recorder-delete");
    let reset = bounds("recorder-reset");
    let gap = Point::new(
        (delete.origin.x + delete.size.width + reset.origin.x) / 2.,
        middle(delete),
    );
    let mut press = PointerEvent::mouse(PointerPhase::Pressed, gap);
    press.button = Some(PointerButton::Primary);
    press.buttons = 1;
    let update = ui.pointer_event(press, &output.hit_regions);
    let drags: Vec<_> = update
        .events
        .into_iter()
        .filter(|event| event.kind.event_type() == EventType::PointerDown)
        .collect();
    assert_eq!(drags.len(), 1);
    assert_eq!(drags[0].current_key(), Some("recorder-drag"));
    let callback = scene.host.borrow().callback_for(&drags[0]).unwrap();
    scene
        .gallery
        .deliver(
            &json!({
                "node":{"slot":callback.node.slot(),"generation":callback.node.generation()},
                "callback":callback.callback.0,"payload":{"kind":"pointerDown","x":gap.x,"y":gap.y}
            })
            .to_string(),
        )
        .unwrap();
    assert!(scene.requests.borrow().iter().any(|item| {
        let request: ServiceRequest = serde_json::from_str(item).unwrap();
        request.service == "windows"
            && request.method == "drag"
            && request.payload["window"] == "recorder"
    }));
    reply(scene, 5);
    for (key, action) in [
        ("recorder-delete", "delete"),
        ("recorder-reset", "reset"),
        ("recorder-pause", "pause"),
        ("recorder-stop", "stop"),
    ] {
        let rectangle = bounds(key);
        let mut press = PointerEvent::mouse(
            PointerPhase::Pressed,
            Point::new(
                rectangle.origin.x + rectangle.size.width / 2.,
                middle(rectangle),
            ),
        );
        press.button = Some(PointerButton::Primary);
        press.buttons = 1;
        let update = ui.pointer_event(press, &output.hit_regions);
        assert!(
            !update
                .events
                .iter()
                .any(|event| event.current_key() == Some("recorder-drag")),
            "{key} must not start a drag"
        );
        crate::click_named(scene.gallery, scene.operations, key).unwrap();
        assert!(
            scene.requests.borrow().iter().any(|item| {
                let request: ServiceRequest = serde_json::from_str(item).unwrap();
                request.service == "beamUi"
                    && request.method == "emit"
                    && request.payload["action"] == action
            }),
            "{key} must relay {action}"
        );
        reply(scene, 5);
    }
}
