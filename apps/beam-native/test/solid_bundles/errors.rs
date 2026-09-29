//! Real QuickJS error presentation, translated copy controls and clipboard service.

use super::{
    ServiceRequest, assert_no_rejections, click_named, contains_text, localization::Scene,
    service_value,
};
use argui_ui::{Element, Role};
use beam_native::{ServiceOutcome, ServiceResponse};
use serde_json::{Value, json};

/// Exercises the built generic error component through a rejected native service.
pub(super) fn validate_copy(scene: &Scene<'_>) {
    if scene.name != "app.mjs:mountGallery" {
        return;
    }
    let diagnostic = "Cannot authorize region precision pixels: selected stream 3840 × 2160\nFull diagnostic retained for copying.";
    scene
        .gallery
        .deliver_service(
            &ServiceResponse {
                session: 1,
                window: "main".into(),
                request_id: 0,
                outcome: ServiceOutcome::Event(
                    json!({ "type": "windowVisibility", "window": "main", "visible": true }),
                ),
            }
            .json()
            .to_string(),
        )
        .unwrap();
    scene.gallery.tick(0.0).unwrap();
    let pending = std::mem::take(&mut *scene.requests.borrow_mut());
    assert!(!pending.is_empty());
    let mut rejected = false;
    for raw in pending {
        let request: ServiceRequest = serde_json::from_str(&raw).unwrap();
        let outcome = if request.service == "beam" && request.method == "sources" {
            rejected = true;
            ServiceOutcome::Error(diagnostic.into())
        } else {
            ServiceOutcome::Ok(service_value(&request, super::DEFAULT_OUTPUT_LABEL))
        };
        reply(scene, &request, outcome);
    }
    assert!(
        rejected,
        "a real source read must fail before the copy control appears"
    );
    scene.gallery.tick(0.0).unwrap();
    let message = format!("ServiceError: {diagnostic}");
    click_named(scene.gallery, scene.operations, "hud-issues-trigger").unwrap();
    scene.gallery.tick(250.0).unwrap();
    scene.gallery.tick(500.0).unwrap();
    let root = scene.host.borrow().root_element().unwrap();
    assert!(contains_text(&root, &message));
    let copy_button = button(&root, "Copier l’erreur").expect("translated native copy button");
    let id = copy_button.key.as_deref().unwrap().to_owned();
    click_named(scene.gallery, scene.operations, &id).unwrap();
    let request = clipboard_request(scene, &message);
    reply(
        scene,
        &request,
        ServiceOutcome::Error("clipboard unavailable".into()),
    );
    scene.gallery.tick(0.0).unwrap();
    let root = scene.host.borrow().root_element().unwrap();
    assert!(
        contains_text(&root, &message),
        "copy failures preserve the original error"
    );
    assert!(
        button(
            &root,
            "Échec de la copie: ServiceError: clipboard unavailable"
        )
        .is_some()
    );
    click_named(scene.gallery, scene.operations, &id).unwrap();
    let request = clipboard_request(scene, &message);
    reply(scene, &request, ServiceOutcome::Ok(Value::Null));
    scene.gallery.tick(0.0).unwrap();
    assert!(button(&scene.host.borrow().root_element().unwrap(), "Copié").is_some());
    assert_no_rejections(scene.rejections, scene.name);
}

/// Checks the exact clipboard payload rather than a visually clamped label.
fn clipboard_request(scene: &Scene<'_>, message: &str) -> ServiceRequest {
    let request = scene
        .requests
        .borrow_mut()
        .iter()
        .find_map(|raw| {
            let request: ServiceRequest = serde_json::from_str(raw).unwrap();
            (request.service == "clipboard" && request.method == "writeText").then_some(request)
        })
        .expect("native clipboard write");
    assert_eq!(request.payload["text"].as_str(), Some(message));
    scene.requests.borrow_mut().retain(|raw| {
        serde_json::from_str::<ServiceRequest>(raw)
            .unwrap()
            .request_id
            != request.request_id
    });
    request
}

/// Delivers the same service reply envelope used by the desktop host.
fn reply(scene: &Scene<'_>, request: &ServiceRequest, outcome: ServiceOutcome) {
    scene
        .gallery
        .deliver_service(
            &ServiceResponse {
                session: 1,
                window: request.window.clone(),
                request_id: request.request_id,
                outcome,
            }
            .json()
            .to_string(),
        )
        .unwrap();
}

/// Resolves an actual named native button, including changing copy feedback.
fn button<'a>(root: &'a Element, label: &str) -> Option<&'a Element> {
    if root.semantics.as_ref().is_some_and(|semantics| {
        semantics.role == Role::Button && semantics.label.as_deref() == Some(label)
    }) {
        return Some(root);
    }
    root.children.iter().find_map(|child| button(child, label))
}
