//! Actual native toolbar commits, revision handling and action contracts.
use crate::localization::Scene;
use crate::{ServiceRequest, contains_text, keyed_element};
use beam_native::{ServiceOutcome, ServiceResponse};
use serde_json::json;

fn publish(scene: &Scene<'_>, window: &str, revision: u64, selected: bool, preset: &str) {
    scene.gallery.deliver_service(&ServiceResponse {
        session: 1, window: window.into(), request_id: 0,
        outcome: ServiceOutcome::Event(json!({ "type": "regionChanged", "snapshot": {
            "revision": revision, "selected": selected, "canRecord": selected, "preset": preset,
            "width": 1280, "height": 720, "controlsX": 0, "controlsY": 0, "controlsWidth": 300, "controlsHeight": 40,
            "actionsX": 400, "actionsY": 728, "actionsWidth": 620, "actionsHeight": 54,
        }})),
    }.json().to_string()).unwrap();
    scene.gallery.tick(0.0).unwrap();
}

pub(super) fn validate_controls(scene: &Scene<'_>) {
    let root = scene.host.borrow().root_element().unwrap();
    assert!(keyed_element(&root, "region-preset").is_some());
    assert!(keyed_element(&root, "region-dimensions").is_some());
    assert!(keyed_element(&root, "region-record").is_none());
    assert!(contains_text(&root, "640 × 360"));
    publish(scene, "regionControls", 3, false, "free");
    publish(scene, "regionControls", 2, true, "16:9");
    let root = scene.host.borrow().root_element().unwrap();
    assert!(contains_text(&root, "1280 × 720"));
    assert!(!contains_text(&root, "16:9"));
    publish(scene, "regionControls", 4, true, "1280×720");
    assert!(contains_text(
        &scene.host.borrow().root_element().unwrap(),
        "1280×720"
    ));
}

pub(super) fn validate_actions(scene: &Scene<'_>) {
    let root = scene.host.borrow().root_element().unwrap();
    for id in [
        "region-record",
        "region-cancel",
        "region-camera",
        "region-microphone",
        "region-system-audio",
    ] {
        assert!(keyed_element(&root, id).is_some());
    }
    assert!(keyed_element(&root, "region-preset").is_none());
    assert!(
        !keyed_element(&root, "region-record")
            .unwrap()
            .semantics
            .as_ref()
            .unwrap()
            .state
            .disabled
    );
    publish(scene, "regionActions", 3, false, "free");
    publish(scene, "regionActions", 2, true, "16:9");
    assert!(
        keyed_element(
            &scene.host.borrow().root_element().unwrap(),
            "region-record"
        )
        .unwrap()
        .semantics
        .as_ref()
        .unwrap()
        .state
        .disabled
    );
    publish(scene, "regionActions", 4, true, "1280×720");
    crate::click_named(scene.gallery, scene.operations, "region-record").unwrap();
    let requests = std::mem::take(&mut *scene.requests.borrow_mut());
    assert!(requests.iter().any(|raw| {
        let request: ServiceRequest = serde_json::from_str(raw).unwrap();
        request.service == "region" && request.method == "confirm"
    }));
    crate::click_named(scene.gallery, scene.operations, "region-cancel").unwrap();
    let requests = std::mem::take(&mut *scene.requests.borrow_mut());
    assert!(requests.iter().any(|raw| {
        let request: ServiceRequest = serde_json::from_str(raw).unwrap();
        request.service == "region" && request.method == "cancel"
    }));
}
