use argui_core::Color;
use argui_paint::Fill;
use argui_ui::{Element, ElementKind};
use serde_json::{Value, json};

thread_local! {
    static HAS_CLIPS: std::cell::Cell<bool> = const { std::cell::Cell::new(true) };
}

/// Exercises the live compiled clip selection and its native contextual controls.
pub(super) fn validate_selection(scene: &super::localization::Scene<'_>) {
    resize(scene, 1440, 900);
    validate_theme(scene);
    validate_geometry(scene);
    super::editor_controls_layout::validate(scene);
    super::editor_controls::validate_hover(scene);
    super::editor_splitters::validate(scene);
    super::click_named(scene.gallery, scene.operations, "timeline-clip-clip").unwrap();
    scene.gallery.tick(0.).unwrap();
    super::assert_no_rejections(scene.rejections, scene.name);
    let host = scene.host.borrow();
    let root = host.root_element().unwrap();
    for text in [
        "Automatic zooms",
        "Transform",
        "00:10.000 · Original preserved",
    ] {
        assert!(
            super::contains_text(&root, text),
            "missing selected-clip control: {text}"
        );
    }
    drop(host);
    super::click_named(scene.gallery, scene.operations, "editor-undo").unwrap();
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    let root = scene.host.borrow().root_element().unwrap();
    assert!(
        super::contains_text(&root, "00:05.000 · Original preserved"),
        "a fresh native edit snapshot must update retained clip controls"
    );
    super::assert_no_rejections(scene.rejections, scene.name);
    super::editor_controls::validate_pending_edit(scene);
    validate_responsive(scene);
    validate_sequences(scene);
}

fn resize(scene: &super::localization::Scene<'_>, width: u32, height: u32) {
    scene
        .gallery
        .deliver_service(
            &json!({"requestId":0,"window":"main","status":"event",
        "value":{"type":"windowResized","physicalWidth":width,"physicalHeight":height}})
            .to_string(),
        )
        .unwrap();
    scene.gallery.tick(0.).unwrap();
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    super::assert_no_rejections(scene.rejections, scene.name);
}

fn validate_responsive(scene: &super::localization::Scene<'_>) {
    for (width, height, wide) in [(720, 480, false), (1000, 700, false), (1440, 900, true)] {
        resize(scene, width, height);
        let root = scene.host.borrow().root_element().unwrap();
        assert_eq!(
            super::keyed_element(&root, "editor-library-divider").is_some(),
            wide
        );
        assert!(super::keyed_element(&root, "editor-timeline").is_some());
        assert!(super::keyed_element(&root, "editor-sequences-first").is_some());
        if !wide {
            assert!(super::keyed_element(&root, "editor-panes-properties").is_some());
        }
    }
}

/// Checks real control paint after live theme changes, without opening a window.
fn validate_theme(scene: &super::localization::Scene<'_>) {
    for variant in ["dark", "light", "dark"] {
        let mut preferences = super::localization::preferences("en");
        preferences["theme"] = json!(variant);
        scene
            .gallery
            .deliver_service(
                &json!({"requestId":0,"window":"main","status":"event",
                    "value":{"type":"preferencesChanged","preferences":preferences}})
                .to_string(),
            )
            .unwrap();
        scene.gallery.tick(0.).unwrap();
        super::assert_no_rejections(scene.rejections, scene.name);
        let root = scene.host.borrow().root_element().unwrap();
        for label in ["Play", "Snap to clip edges"] {
            let action = find_element(&root, &|element| {
                element
                    .semantics
                    .as_ref()
                    .is_some_and(|semantics| semantics.label.as_deref() == Some(label))
            })
            .unwrap_or_else(|| panic!("missing {label} action"));
            let icon = find_element(action, &|element| {
                matches!(element.kind, ElementKind::Vector { .. })
            })
            .unwrap_or_else(|| panic!("missing {label} icon"));
            let ElementKind::Vector { color, .. } = icon.kind else {
                unreachable!()
            };
            assert_eq!(
                color,
                Color::from_hex("#ea580c").unwrap(),
                "{label} must retain Beam's accent in the {variant} theme"
            );
        }
        let timeline = super::keyed_element(&root, "editor-timeline").unwrap();
        let panel = if variant == "dark" {
            "#212123"
        } else {
            "#f7f7f8"
        };
        assert_eq!(
            timeline.paint.quad.background,
            Some(Fill::Solid(Color::from_hex(panel).unwrap())),
            "Concat surfaces must still follow the selected theme"
        );
    }
}

fn find_element<'a>(
    root: &'a Element,
    predicate: &impl Fn(&Element) -> bool,
) -> Option<&'a Element> {
    if predicate(root) {
        return Some(root);
    }
    root.children
        .iter()
        .find_map(|child| find_element(child, predicate))
}

/// A realistic metadata fixture: paths and raster bytes stay outside the JS contract.
pub(super) fn service(method: &str, payload: &Value) -> Value {
    let transport = json!({"positionMs":0,"durationMs":10_000,"playing":false,"error":null});
    match method {
        "bootstrap" => json!({
            "activeSequence":"first", "sequences":[{"id":"first","name":"Timeline 1"}],
            "project": {"id":"00000000-0000-4000-8000-000000000001","name":"Native recording",
                "canvas":{"width":1920,"height":1080,"fps":30,"background":4279637526u32},
                "assets":[{"id":"source","name":"Screen.webm","width":1920,"height":1080,"durationMs":10_000,"hasVideo":true,"hasAudio":true,"hasCursor":true,"zoomCount":2,"recording":true}],
                "tracks":[{"id":"video","name":"Video","kind":"video","hidden":false,"muted":false},{"id":"audio","name":"Audio","kind":"audio","hidden":false,"muted":false}],
                "clips":[{"id":"clip","assetId":"source","trackId":"video","startMs":0,"sourceInMs":0,"durationMs":10_000,
                    "effects":{"opacity":1,"volume":1,"brightness":0,"saturation":1,"scale":1,"x":0.5,"y":0.5,"autoZoom":true}}],"warnings":[]},
            "exportFormats":[{"container":"mp4","codec":"AV1","encoder":"vaav1enc"}],
            "revision":1,"canUndo":true,"canRedo":false,"recovered":false,"transport":transport
        }),
        "frame" => {
            let has_clips = HAS_CLIPS.get();
            let mut transport = transport;
            transport["durationMs"] = json!(if has_clips { 10_000 } else { 0 });
            json!({"transport":transport,"canvasId":has_clips.then_some(42)})
        }
        "edit" => {
            let mut snapshot = service("bootstrap", &Value::Null);
            snapshot["revision"] = json!(2);
            match payload["edit"]["type"].as_str() {
                Some("addSequence") => {
                    snapshot["activeSequence"] = json!("second");
                    snapshot["sequences"] = json!([{"id":"first","name":"Timeline 1"},{"id":"second","name":"Timeline 2"}]);
                    snapshot["project"]["clips"] = json!([]);
                }
                Some("selectSequence") => {
                    snapshot["sequences"] = json!([{"id":"first","name":"Timeline 1"},{"id":"second","name":"Timeline 2"}]);
                }
                _ => {
                    snapshot["project"]["clips"][0]["durationMs"] = json!(5000);
                }
            }
            HAS_CLIPS.set(!snapshot["project"]["clips"].as_array().unwrap().is_empty());
            snapshot
        }
        "play" => transport,
        "acquireVisual" => {
            json!({"key":"source-visual","canvasId":43,"status":"ready","error":null})
        }
        "releaseVisual" => Value::Null,
        _ => panic!("unexpected editor request {method}"),
    }
}

/// Pane dimensions are validated in the native retained tree without a window.
pub(super) fn validate_geometry(scene: &super::localization::Scene<'_>) {
    let host = scene.host.borrow();
    let root = host.root_element().unwrap();
    let timeline = super::keyed_element(&root, "editor-timeline").expect("timeline pane");
    let grid = super::keyed_element(&root, "editor-timeline-grid").expect("timeline grid");
    assert_eq!(grid.style.size.height, super::Dimension::percent(1.));
    assert_eq!(timeline.style.flex_shrink, 0.);
    for key in [
        "editor-library-divider",
        "editor-inspector-divider",
        "editor-timeline-divider",
        "editor-track-divider",
    ] {
        let divider = super::keyed_element(&root, key).expect("native pane separator");
        assert!(
            divider.semantics.is_some(),
            "{key} must expose keyboard/accessibility semantics"
        );
    }
    for text in [
        "Media",
        "Text",
        "Transitions",
        "Effects",
        "Filters",
        "Templates",
    ] {
        assert!(
            super::contains_text(&root, text),
            "missing library category {text}"
        );
    }
}

fn validate_sequences(scene: &super::localization::Scene<'_>) {
    super::click_named(scene.gallery, scene.operations, "editor-add-sequence").unwrap();
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    let root = scene.host.borrow().root_element().unwrap();
    let tab = super::keyed_element(&root, "editor-sequences-second").unwrap();
    assert!(tab.semantics.as_ref().unwrap().state.selected);
    assert!(super::keyed_element(&root, "timeline-clip-clip").is_none());
    super::editor_controls::validate_empty_preview(scene);
    super::editor_controls_layout::validate_sequence_animation(scene);
    super::click_named(scene.gallery, scene.operations, "editor-sequences-first").unwrap();
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    assert!(
        super::keyed_element(
            &scene.host.borrow().root_element().unwrap(),
            "timeline-clip-clip"
        )
        .is_some()
    );
}
