//! Retention and hover timing of actual compiled editor controls, without windows.

use argui_runtime::{WireHostId, WireOperation};
use argui_ui::{CursorIcon, Element};
use serde_json::{Value, json};

/// Hover hints wait 450 ms, stay anchored, and close immediately on pointer exit.
pub(super) fn validate_hover(scene: &super::localization::Scene<'_>) {
    let id = "editor-library-transitions-hint";
    event(scene, "TouchArea", id, "pointerEnter");
    scene.gallery.tick(0.).unwrap();
    scene.gallery.tick(449.).unwrap();
    assert!(super::keyed_element(&root(scene), &format!("{id}-popup")).is_none());
    scene.gallery.tick(450.).unwrap();
    let authored = root(scene);
    let hint = super::keyed_element(&authored, &format!("{id}-popup")).unwrap();
    assert!(super::contains_text(hint, "Transitions"));
    super::editor_controls_layout::validate_hint(&authored, id);
    assert_eq!(
        hint.semantics.as_ref().unwrap().role,
        argui_ui::Role::Tooltip
    );
    event(scene, "TouchArea", id, "pointerLeave");
    assert!(super::keyed_element(&root(scene), &format!("{id}-popup")).is_none());
    scene.gallery.tick(0.).unwrap();
    event(scene, "TouchArea", id, "pointerEnter");
    event(scene, "TouchArea", id, "pointerLeave");
    scene.gallery.tick(450.).unwrap();
    assert!(super::keyed_element(&root(scene), &format!("{id}-popup")).is_none());
    scene.gallery.tick(0.).unwrap();
    super::assert_no_rejections(scene.rejections, scene.name);
}

/// Queued edits keep names, tabs and actions mounted, enabled and responsive.
pub(super) fn validate_pending_edit(scene: &super::localization::Scene<'_>) {
    super::click_named(scene.gallery, scene.operations, "editor-clip-tabs-effects").unwrap();
    scene.gallery.tick(0.).unwrap();
    let retained = [
        ("Text", "editor-project-name"),
        ("Container", "editor-clip-tabs-indicator"),
        ("FocusScope", "editor-undo"),
        ("FocusScope", "editor-sequences-first"),
    ];
    let before = retained.map(|(native, id)| host_id(scene, native, id));
    let start = scene.operations.borrow().len();
    super::click_named(scene.gallery, scene.operations, "editor-undo").unwrap();
    scene.gallery.tick(0.).unwrap();
    assert!(
        !scene.requests.borrow().is_empty(),
        "hold the edit response pending"
    );
    assert_controls(scene);
    hydrate(scene);
    assert_controls(scene);
    for (index, (native, id)) in retained.into_iter().enumerate() {
        assert_eq!(
            before[index],
            host_id(scene, native, id),
            "{id} was remounted"
        );
        assert!(
            scene.operations.borrow()[start..]
                .iter()
                .all(|op| !matches!(op,
                    WireOperation::Remove { id } if *id == before[index]
                )),
            "a pending edit removed {id}"
        );
    }
    let authored = root(scene);
    assert!(
        super::keyed_element(&authored, "editor-clip-tabs-effects")
            .unwrap()
            .semantics
            .as_ref()
            .unwrap()
            .state
            .selected,
        "fresh snapshots must preserve the chosen inspector tab"
    );
    assert!(super::contains_text(&authored, "Color"));
    assert!(!super::contains_text(&authored, "Untitled project"));
    super::click_named(scene.gallery, scene.operations, "editor-clip-tabs-video").unwrap();
    scene.gallery.tick(0.).unwrap();
}

/// An empty sequence keeps its empty message while a routine edit is pending.
pub(super) fn validate_empty_preview(scene: &super::localization::Scene<'_>) {
    let before = host_id(scene, "Text", "editor-preview-empty");
    let start = scene.operations.borrow().len();
    super::click_named(scene.gallery, scene.operations, "editor-undo").unwrap();
    scene.gallery.tick(0.).unwrap();
    let authored = root(scene);
    let empty = super::keyed_element(&authored, "editor-preview-empty").unwrap();
    assert!(super::contains_text(empty, "Make room for your next story"));
    assert_eq!(before, host_id(scene, "Text", "editor-preview-empty"));
    assert!(
        scene.operations.borrow()[start..]
            .iter()
            .all(|op| !matches!(op,
                WireOperation::Remove { id } if *id == before
            ))
    );
    // Complete without changing sequence contents, just as a metadata-only edit does.
    let pending = std::mem::take(&mut *scene.requests.borrow_mut());
    for request in pending {
        let request: super::ServiceRequest = serde_json::from_str(&request).unwrap();
        let value = if request.method == "edit" {
            super::editor::service("edit", &json!({"edit":{"type":"addSequence"}}))
        } else {
            super::editor::service(&request.method, &request.payload)
        };
        let response = beam_native::ServiceResponse {
            session: 1,
            window: request.window,
            request_id: request.request_id,
            outcome: beam_native::ServiceOutcome::Ok(value),
        };
        scene
            .gallery
            .deliver_service(&response.json().to_string())
            .unwrap();
    }
    hydrate(scene);
    assert_eq!(before, host_id(scene, "Text", "editor-preview-empty"));
}

/// Verifies history has no persistent frame and usable actions retain pointer cursors.
fn assert_controls(scene: &super::localization::Scene<'_>) {
    let authored = root(scene);
    let history = super::keyed_element(&authored, "editor-history-actions").unwrap();
    assert!(history.paint.quad.background.is_none());
    let undo = super::keyed_element(&authored, "editor-undo").unwrap();
    assert!(!undo.semantics.as_ref().unwrap().state.disabled);
    fn has_pointer(element: &Element) -> bool {
        element
            .interaction
            .as_ref()
            .is_some_and(|i| i.cursor == CursorIcon::Pointer)
            || element.children.iter().any(has_pointer)
    }
    assert!(has_pointer(undo));
    for id in ["editor-quality", "editor-sequences-first"] {
        assert!(
            !super::keyed_element(&authored, id)
                .unwrap()
                .semantics
                .as_ref()
                .unwrap()
                .state
                .disabled
        );
    }
}

/// Returns an owned authored tree so no host borrow crosses a JS callback.
fn root(scene: &super::localization::Scene<'_>) -> Element {
    scene.host.borrow().root_element().unwrap()
}

/// Resolves the host identity of a primitive's public ID.
fn host_id(scene: &super::localization::Scene<'_>, native: &str, id: &str) -> WireHostId {
    let contract: Value = serde_json::from_str(super::CONTRACT).unwrap();
    let property = super::contract_member(&contract, native, "properties", "id");
    super::native_id(&scene.operations.borrow(), property, id)
}

/// Delivers a real retained pointer-boundary callback from the accepted wire trace.
fn event(scene: &super::localization::Scene<'_>, native: &str, id: &str, event: &str) {
    let contract: Value = serde_json::from_str(super::CONTRACT).unwrap();
    let kind = super::contract_member(&contract, native, "events", event);
    let node = host_id(scene, native, id);
    let callback = scene
        .operations
        .borrow()
        .iter()
        .rev()
        .find_map(|op| match op {
            WireOperation::SetListener {
                id,
                event,
                callback,
            } if *id == node && *event == kind => *callback,
            _ => None,
        })
        .unwrap();
    scene
        .gallery
        .deliver(
            &json!({"node":{"slot":node.slot,"generation":node.generation},
        "callback":callback,"payload":{"kind":event}})
            .to_string(),
        )
        .unwrap();
}

/// Finishes only this scene's queued deterministic services.
fn hydrate(scene: &super::localization::Scene<'_>) {
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    super::assert_no_rejections(scene.rejections, scene.name);
}
