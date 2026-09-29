//! Error diagnostics remain copyable through a real native service request.
use super::localization::Scene;
use argui_ui::{Element, Role};
use beam_native::{ServiceOutcome, ServiceResponse};

fn named<'a>(root: &'a Element, label: &str) -> Option<&'a Element> {
    if root
        .semantics
        .as_ref()
        .is_some_and(|value| value.role == Role::Button && value.label.as_deref() == Some(label))
    {
        return Some(root);
    }
    root.children.iter().find_map(|child| named(child, label))
}
pub(super) fn validate_copy(scene: &Scene<'_>) {
    if scene.name != "editor.mjs:mountGallery" {
        return;
    }
    super::click_named(scene.gallery, scene.operations, "editor-undo").unwrap();
    scene.gallery.tick(0.).unwrap();
    let pending = std::mem::take(&mut *scene.requests.borrow_mut());
    let diagnostic = "Read permission denied: /authorized/source.webm";
    for json in pending {
        let request: super::ServiceRequest = serde_json::from_str(&json).unwrap();
        let outcome = if request.service == "editor" && request.method == "edit" {
            ServiceOutcome::Error(diagnostic.into())
        } else {
            ServiceOutcome::Ok(super::service_value(&request, super::DEFAULT_OUTPUT_LABEL))
        };
        scene
            .gallery
            .deliver_service(
                &ServiceResponse {
                    session: 1,
                    window: request.window,
                    request_id: request.request_id,
                    outcome,
                }
                .json()
                .to_string(),
            )
            .unwrap();
    }
    scene.gallery.tick(0.).unwrap();
    let root = scene.host.borrow().root_element().unwrap();
    fn diagnostic_text(root: &Element, needle: &str) -> Option<String> {
        if let argui_ui::ElementKind::Text { content, .. } = &root.kind
            && content.as_str().contains(needle)
        {
            return Some(content.as_str().to_owned());
        }
        root.children
            .iter()
            .find_map(|child| diagnostic_text(child, needle))
    }
    let displayed =
        diagnostic_text(&root, diagnostic).expect("complete service diagnostic remains visible");
    let copy = named(&root, "Copy error").expect("copy diagnostic action");
    super::click_named(
        scene.gallery,
        scene.operations,
        copy.key.as_deref().unwrap(),
    )
    .unwrap();
    scene.gallery.tick(0.).unwrap();
    let pending = scene.requests.borrow();
    let copied = pending.iter().any(|json| {
        let request: super::ServiceRequest = serde_json::from_str(json).unwrap();
        request.service == "clipboard"
            && request.method == "writeText"
            && request.payload["text"] == displayed
    });
    assert!(copied, "the full displayed error must be copied");
    drop(pending);
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    super::assert_no_rejections(scene.rejections, scene.name);
}
