//! Recorder clock updates through real QuickJS replies and resize events.

use crate::{ServiceRequest, keyed_element, localization::Scene, service_value};
use argui_ui::ElementKind;
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
