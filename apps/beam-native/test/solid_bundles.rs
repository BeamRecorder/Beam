//! Windowless validation of Beam's built Solid scenes against the native host.

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    fs,
    path::PathBuf,
    rc::Rc,
};

use argui_host::Host;
use argui_runtime::{WireHostId, WireOperation};
use argui_ui::{AlignItems, Dimension, Element, ElementKind, LengthPercentage};
use beam_native::{QuickJsGallery, ServiceOutcome, ServiceResponse, decode_wire_operations};
use serde::Deserialize;
use serde_json::{Value, json};

#[path = "solid_bundles/editor.rs"]
mod editor;
#[path = "solid_bundles/editor_controls.rs"]
mod editor_controls;
#[path = "solid_bundles/editor_controls_layout.rs"]
mod editor_controls_layout;
#[path = "solid_bundles/editor_errors.rs"]
mod editor_errors;
#[path = "solid_bundles/editor_interactions.rs"]
mod editor_interactions;
#[path = "solid_bundles/editor_pointer.rs"]
mod editor_pointer;
#[path = "solid_bundles/editor_splitters.rs"]
mod editor_splitters;
#[path = "solid_bundles/errors.rs"]
mod errors;
#[path = "solid_bundles/localization.rs"]
mod localization;
#[path = "solid_bundles/overlays.rs"]
mod overlays;

const DEFAULT_OUTPUT: &str = "default";
const DEFAULT_OUTPUT_LABEL: &str = "Default system output";
const DEFAULT_OPTION_ID: &str = "system-audio-option-default";
const USB_OUTPUT: &str = "pipewire:sink:usb-speaker";
const CONTRACT: &str =
    include_str!("../../../vendor/argui/packages/host/src/contract.generated.json");

#[test]
#[ignore = "requires built Solid launcher bundle"]
fn native_region_toolbar_mounts_presets_actions_and_revision_guard_without_a_window() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/beam-ui/dist/native/app.mjs");
    let source = fs::read_to_string(path).unwrap();
    validate_scene(
        &source,
        "app.mjs:mountRegionControls",
        "mountRegionControls",
    );
    validate_scene(&source, "app.mjs:mountRegionActions", "mountRegionActions");
}

#[test]
#[ignore = "requires built Solid editor bundle"]
fn native_editor_mounts_empty_and_populated_project_scenes() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/beam-ui/dist/native/editor.mjs");
    let source = fs::read_to_string(path).unwrap();
    validate_scene(&source, "editor.mjs:mountGallery", "mountGallery");
}

#[test]
#[ignore = "requires built Solid launcher bundle"]
fn native_recorder_shared_controls_mount_without_a_window() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/beam-ui/dist/native/app.mjs");
    let source = fs::read_to_string(path).unwrap();
    validate_scene(&source, "app.mjs:mountGallery", "mountGallery");
    validate_scene(&source, "app.mjs:mountRecorder", "mountRecorder");
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ServiceRequest {
    request_id: u64,
    window: String,
    service: String,
    method: String,
    #[serde(default)]
    payload: Value,
}

#[test]
#[ignore = "requires built Solid bundles"]
fn solid_scenes_mount_hydrate_and_dispose_with_valid_native_commits() {
    let bundle_dir = std::env::var_os("BEAM_UI_BUNDLE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/beam-ui/dist/native")
        });
    let app_entries = [
        "mountGallery",
        "mountRegionControls",
        "mountRegionActions",
        "mountCountdown",
        "mountRecorder",
        "mountSettings",
        "mountWindowPicker",
        "mountWindowHighlight",
        "mountTeleprompter",
        "mountProjects",
        "mountEditorLoading",
    ];
    let settings_entries = ["mountGallery"];
    for (bundle, entries) in [
        ("app.mjs", app_entries.as_slice()),
        ("settings.mjs", settings_entries.as_slice()),
    ] {
        let path = bundle_dir.join(bundle);
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("cannot read built bundle {}: {error}", path.display()));
        for entry in entries {
            validate_scene(&source, &format!("{bundle}:{entry}"), entry);
        }
    }
}

#[test]
#[ignore = "requires built Solid bundle"]
fn projects_scene_mounts_with_a_real_searchable_library() {
    let bundle_dir = std::env::var_os("BEAM_UI_BUNDLE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/beam-ui/dist/native")
        });
    let source = fs::read_to_string(bundle_dir.join("app.mjs")).unwrap();
    validate_scene(&source, "app.mjs:mountProjects", "mountProjects");
}

/// Mounts one scene, validates its hydrated commits, and accepts its root disposal.
fn validate_scene(source: &str, scene: &str, entry: &str) {
    let host = Rc::new(RefCell::new(
        Host::with_builtins().expect("built-in native schema must register"),
    ));
    let contract: Value = serde_json::from_str(CONTRACT).expect("generated native contract");
    assert_eq!(
        contract["abiHash"].as_str(),
        Some(host.borrow().abi_hash().to_string().as_str())
    );
    let commits = Rc::new(Cell::new(0_usize));
    let rejections = Rc::new(RefCell::new(Vec::<String>::new()));
    let requests = Rc::new(RefCell::new(VecDeque::new()));
    let operations = Rc::new(RefCell::new(Vec::<WireOperation>::new()));
    let commit_host = Rc::clone(&host);
    let commit_count = Rc::clone(&commits);
    let commit_rejections = Rc::clone(&rejections);
    let request_queue = Rc::clone(&requests);
    let commit_operations = Rc::clone(&operations);
    let mounted = QuickJsGallery::new_with_services(
        source,
        CONTRACT,
        entry,
        move |json| match accept_commit(&commit_host, &json) {
            Ok(accepted) => {
                commit_operations.borrow_mut().extend(accepted);
                commit_count.set(commit_count.get() + 1);
                String::new()
            }
            Err(error) => {
                commit_rejections.borrow_mut().push(error.clone());
                error
            }
        },
        |_| String::new(),
        move |json| {
            request_queue.borrow_mut().push_back(json);
            String::new()
        },
        |_| String::new(),
    );
    assert_no_rejections(&rejections, scene);
    let gallery = mounted.unwrap_or_else(|error| panic!("{scene} failed to mount: {error}"));
    let checks = localization::Scene {
        gallery: &gallery,
        host: &host,
        requests: &requests,
        rejections: &rejections,
        operations: &operations,
        name: scene,
    };
    let delayed_preferences = checks.defer_initial_preferences();
    if let Some(request) = delayed_preferences.first() {
        checks.publish_preferences(&request.window, "en");
    }
    let hydrated = hydrate_services(
        &gallery,
        &requests,
        &rejections,
        scene,
        DEFAULT_OUTPUT_LABEL,
    );
    assert!(hydrated > 0, "{scene} did not request its initial services");
    assert!(commits.get() > 0, "{scene} did not commit a native tree");
    assert!(
        host.borrow().root_element().is_some(),
        "{scene} has no validated native root element"
    );
    if scene == "app.mjs:mountGallery" {
        checks.validate_system_audio_refresh();
    }
    if matches!(scene, "app.mjs:mountSettings" | "settings.mjs:mountGallery") {
        checks.validate_about();
    }
    if scene == "editor.mjs:mountGallery" {
        editor::validate_selection(&checks);
        assert_no_alert(&operations.borrow(), scene);
    }
    overlays::validate(&checks);
    checks.validate_locale(delayed_preferences);
    errors::validate_copy(&checks);
    editor_errors::validate_copy(&checks);

    // Keep the native acceptor alive while Solid removes listeners and its root.
    let disposed = gallery.dispose();
    assert_no_rejections(&rejections, scene);
    disposed.unwrap_or_else(|error| panic!("{scene} failed to dispose: {error}"));
    assert!(
        host.borrow().root_id().is_none(),
        "{scene} retained its native root after disposal"
    );
}

/// Decodes a real QuickJS batch and applies it through the canonical Rust host.
fn accept_commit(host: &RefCell<Host>, json: &str) -> Result<Vec<WireOperation>, String> {
    let operations = decode_wire_operations(json)?;
    let native = operations
        .iter()
        .cloned()
        .map(WireOperation::into_native)
        .collect::<Result<Vec<_>, _>>()?;
    host.borrow_mut()
        .commit(&native)
        .map_err(|error| format!("native commit rejected: {error}"))?;
    Ok(operations)
}

/// Completes queued services using `output_label` for each fresh source response.
/// No request queue or native host borrow is held while JavaScript runs.
fn hydrate_services(
    gallery: &QuickJsGallery,
    requests: &RefCell<VecDeque<String>>,
    rejections: &RefCell<Vec<String>>,
    scene: &str,
    output_label: &str,
) -> usize {
    let mut hydrated = 0;
    for _ in 0..128 {
        let ticked = gallery.tick(0.0);
        assert_no_rejections(rejections, scene);
        ticked.unwrap_or_else(|error| panic!("{scene} failed at hydration tick: {error}"));
        let pending = {
            let mut queue = requests.borrow_mut();
            std::mem::take(&mut *queue)
        };
        if pending.is_empty() {
            return hydrated;
        }
        for json in pending {
            let request: ServiceRequest = serde_json::from_str(&json)
                .unwrap_or_else(|error| panic!("{scene} sent an invalid service request: {error}"));
            assert!(request.request_id > 0, "{scene} sent a zero request ID");
            assert!(
                !request.window.is_empty(),
                "{scene} sent an empty window ID"
            );
            let response = ServiceResponse {
                session: 1,
                window: request.window.clone(),
                request_id: request.request_id,
                outcome: ServiceOutcome::Ok(service_value(&request, output_label)),
            };
            let delivered = gallery.deliver_service(&response.json().to_string());
            assert_no_rejections(rejections, scene);
            delivered.unwrap_or_else(|error| {
                panic!(
                    "{scene} failed after {}.{}: {error}",
                    request.service, request.method
                )
            });
            hydrated += 1;
        }
    }
    panic!("{scene} service hydration did not settle after 128 rounds");
}

/// Delivers a native click to the live callback of the named focus scope.
/// The accepted `operations` trace resolves `public_id`; no trace borrow survives delivery.
fn click_named(
    gallery: &QuickJsGallery,
    operations: &RefCell<Vec<WireOperation>>,
    public_id: &str,
) -> Result<(), String> {
    let contract: Value = serde_json::from_str(CONTRACT).expect("generated native contract");
    let id_property = contract_member(&contract, "FocusScope", "properties", "id");
    let click_event = contract_member(&contract, "FocusScope", "events", "click");
    let (node, callback) = {
        let trace = operations.borrow();
        let node = native_id(&trace, id_property, public_id);
        let callback = trace
            .iter()
            .rev()
            .find_map(|operation| match operation {
                WireOperation::SetListener {
                    id,
                    event,
                    callback,
                } if *id == node && *event == click_event => Some(*callback),
                _ => None,
            })
            .flatten()
            .unwrap_or_else(|| panic!("{public_id} has no live click callback"));
        (node, callback)
    };
    gallery.deliver(
        &json!({
            "node": { "slot": node.slot, "generation": node.generation },
            "callback": callback, "payload": { "kind": "click" }
        })
        .to_string(),
    )
}

/// Fails if any accepted transaction rendered an application error alert.
fn assert_no_alert(operations: &[WireOperation], scene: &str) {
    let contract: Value = serde_json::from_str(CONTRACT).expect("generated native contract");
    let role_property = contract_member(&contract, "Text", "properties", "role");
    assert!(
        !operations.iter().any(|operation| matches!(operation,
            WireOperation::SetProperty { property, value: Some(value), .. }
                if *property == role_property && value.value.as_str() == Some("alert")
        )),
        "{scene} caught an error and rendered an alert"
    );
}

/// Finds a named property's or event's numeric ID in the actual native contract.
/// `native` names the primitive, `group` selects its declarations, and `name` selects one.
fn contract_member(contract: &Value, native: &str, group: &str, name: &str) -> u16 {
    let primitive = contract["natives"]
        .as_array()
        .expect("native contract types")
        .iter()
        .find(|item| item["name"].as_str() == Some(native))
        .expect("native primitive");
    let raw = primitive[group]
        .as_array()
        .expect("native declarations")
        .iter()
        .find(|item| item["name"].as_str() == Some(name))
        .expect("native declaration")["id"]
        .as_u64()
        .expect("numeric declaration ID");
    u16::try_from(raw).expect("declaration ID fits native protocol")
}

/// Returns the latest host slot assigned to `public_id` by an accepted ID property.
/// `property` is the schema's ID declaration and `operations` is the accepted trace.
fn native_id(operations: &[WireOperation], property: u16, public_id: &str) -> WireHostId {
    operations
        .iter()
        .rev()
        .find_map(|operation| match operation {
            WireOperation::SetProperty {
                id,
                property: authored,
                value: Some(value),
            } if *authored == property && value.value.as_str() == Some(public_id) => Some(*id),
            _ => None,
        })
        .unwrap_or_else(|| panic!("native node {public_id} was not committed"))
}

/// Returns the current native descendant with addressable `key`, when mounted.
fn keyed_element<'a>(element: &'a Element, key: &str) -> Option<&'a Element> {
    if element.key.as_deref() == Some(key) {
        return Some(element);
    }
    element
        .children
        .iter()
        .find_map(|child| keyed_element(child, key))
}

/// Preserves the native geometry check for Beam's icon-leading compact Select trigger.
fn assert_select_geometry(root: &Element) {
    let trigger = keyed_element(root, "system-audio").expect("Select trigger");
    let field = &trigger.children[0];
    let row = &field.children[0];
    let label = &row.children[1];
    assert_eq!(field.style.padding.top, LengthPercentage::length(0.0));
    assert_eq!(field.style.padding.bottom, LengthPercentage::length(0.0));
    assert_eq!(row.style.align_items, Some(AlignItems::CENTER));
    assert_eq!(label.style.align_items, Some(AlignItems::CENTER));
    assert_eq!(label.style.size.height, Dimension::length(20.0));
    let popup = keyed_element(root, "system-audio-popup").expect("open device selector");
    let argui_ui::PortalTarget::Anchor(anchor) = &popup.portal.as_ref().unwrap().target else {
        panic!("device selector must remain anchored to its trigger");
    };
    assert_eq!(anchor.key, "system-audio");
    // On follows Off: its row center must coincide with the 28px trigger center.
    assert_eq!(anchor.placement.offset, -104.0);
    assert_eq!(anchor.placement.cross_offset, -18.0);
}

/// Returns whether visible `text` appears in a currently mounted native text primitive.
fn contains_text(element: &Element, text: &str) -> bool {
    let local = matches!(&element.kind, ElementKind::Text { content, .. } if text_matches(content.as_str(), text));
    local
        || element
            .children
            .iter()
            .any(|child| contains_text(child, text))
}

/// Ignores Fluent's invisible bidirectional isolation around interpolated arguments.
fn text_matches(actual: &str, expected: &str) -> bool {
    actual
        .chars()
        .filter(|character| !matches!(character, '\u{2068}' | '\u{2069}'))
        .eq(expected.chars())
}

/// Checks Beam's default or explicit weight on a currently mounted native Text primitive.
fn assert_text_weight(root: &Element, text: &str, expected: u16) {
    fn weight(root: &Element, text: &str) -> Option<u16> {
        if let ElementKind::Text { content, style } = &root.kind
            && text_matches(content.as_str(), text)
        {
            return Some(style.weight);
        }
        root.children.iter().find_map(|child| weight(child, text))
    }
    assert_eq!(
        weight(root, text),
        Some(expected),
        "unexpected weight for {text:?}"
    );
}

/// Fails on native errors even when the application's JavaScript catches them.
fn assert_no_rejections(rejections: &RefCell<Vec<String>>, scene: &str) {
    let errors = rejections.borrow();
    assert!(
        errors.is_empty(),
        "{scene} produced rejected native commits:\n{}",
        errors.join("\n")
    );
}

/// Provides deterministic data with stable source IDs and the current `output_label`.
/// `request` selects the service fixture; command services complete with no value.
fn service_value(request: &ServiceRequest, output_label: &str) -> Value {
    match (request.service.as_str(), request.method.as_str()) {
        ("editor", method) => editor::service(method, &request.payload),
        ("beam", "preferences") => localization::preferences("en"),
        ("beam", "savePreferences") => localization::saved_preferences(&request.payload),
        ("beam", "status") => json!({
            "state": "recording", "sessionId": "session", "manifest": { "durationNs": 5_000_000_000u64 }
        }),
        ("beam", "info") => json!({
            "version": "test", "operatingSystem": "linux", "architecture": "x86_64",
            "logicalProcessors": 4, "desktopSession": "x11"
        }),
        ("beam", "inputAccessStatus") => json!({
            "state": "available", "canRequest": false, "clicks": true, "shortcuts": true
        }),
        ("beam", "sources") => json!({
            "screens": [], "cameras": [], "microphones": [], "errors": [],
            "systemOutputs": [
                { "id": DEFAULT_OUTPUT, "label": output_label, "isDefault": true },
                { "id": USB_OUTPUT, "label": "USB speaker", "isDefault": false }
            ]
        }),
        ("beam", "listProjects") => json!([
            { "id": "d57fe49a-bb81-42ae-ab07-cc2a233dbb6d", "name": "Screen recording", "kind": "recording", "updatedAtMs": 1_780_000_000_000u64 },
            { "id": "73b55d21-a830-4554-92dc-465f2336a9bb", "name": "Edited project", "kind": "project", "updatedAtMs": 1_770_000_000_000u64 }
        ]),
        ("beam", "audioPreview" | "audioLevels") => {
            json!({ "microphone": null, "systemAudio": null })
        }
        ("beamUi", "state") => json!({
            "remaining": 3, "shortcut": "Alt+Shift+R", "pauseShortcut": "Alt+Shift+P", "paused": false,
            "busy": false, "regionRevision": 1
        }),
        ("updates", "state") => json!({
            "phase": "available", "version": "0.4.0", "downloaded": 0, "total": null,
            "percent": null, "error": null, "restartRequired": false
        }),
        ("windows", "getInfo") => json!({
            "window": request.payload["window"].as_str().unwrap_or(&request.window),
            "title": "Beam", "width": 680, "height": 252, "x": 0, "y": 0,
            "visible": true, "decorations": false, "transparent": true,
            "backdrop": false, "backdropAvailable": false, "scaleFactor": 1,
            "uiZoomFactor": 1, "capabilities": {
                "backend": "x11", "absolutePosition": true, "windowLevel": true,
                "mousePassthrough": true, "inputRegions": true,
                "transparentCompositing": true, "nativeShadow": false
            }
        }),
        ("windows", "getMonitors") => json!([{
            "name": "Test display", "x": 0, "y": 0, "width": 1920, "height": 1080,
            "scaleFactor": 1, "primary": true
        }]),
        ("region", "state") => json!({
            "revision": 1, "width": 640, "height": 360, "preset": "free", "selected": true, "canRecord": true,
            "controlsX": 0, "controlsY": 0, "controlsWidth": 300, "controlsHeight": 40,
            "actionsX": 400, "actionsY": 368, "actionsWidth": 620, "actionsHeight": 54
        }),
        ("windowPicker", "choices") => json!([]),
        ("teleprompter", "read") => json!({
            "schemaVersion": 1, "text": "", "mode": "continuous", "autoscroll": true,
            "scrollSpeed": 42, "fontSize": 36, "lineHeight": 1.35, "textAlign": "left",
            "textColor": "#ffffffff", "useThemeTextColor": true, "windowOpacity": 0.94,
            "theme": "system", "updatedAtUtc": "2026-09-28T00:00:00Z"
        }),
        _ => Value::Null,
    }
}
