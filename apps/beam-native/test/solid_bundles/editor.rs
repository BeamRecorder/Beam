use argui_core::Color;
use argui_paint::Fill;
use argui_ui::{Element, ElementKind};
use serde_json::{Value, json};

thread_local! {
    static HAS_CLIPS: std::cell::Cell<bool> = const { std::cell::Cell::new(true) };
    static REVISION: std::cell::Cell<u64> = const { std::cell::Cell::new(1) };
    static CLIP_DURATION: std::cell::Cell<u64> = const { std::cell::Cell::new(10_000) };
}

/// Exercises the live compiled clip selection and its native contextual controls.
pub(super) fn validate_selection(scene: &super::localization::Scene<'_>) {
    resize(scene, 1440, 900);
    validate_theme(scene);
    validate_geometry(scene);
    super::editor_controls_layout::validate(scene);
    super::editor_controls::validate_hover(scene);
    super::editor_splitters::validate(scene);
    super::editor_pointer::select_clip(scene);
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    super::assert_no_rejections(scene.rejections, scene.name);
    let host = scene.host.borrow();
    let root = host.root_element().unwrap();
    let region_id = "timeline-region-00000000-0000-0000-0000-00000000002a";
    let region = super::keyed_element(&root, region_id).expect("loaded effect region");
    assert!(
        super::contains_text(region, "Color correction"),
        "region label is initialized on mount"
    );
    let retained_region = region
        .source_identity()
        .cloned()
        .expect("region native identity");
    for text in [
        "Source zoom suggestions",
        "Speed numerator",
        "00:00:10:00 · Original preserved",
    ] {
        assert!(
            super::contains_text(&root, text),
            "missing selected-clip control: {text}"
        );
    }
    drop(host);
    select_clip(scene, "timeline-clip-clip");
    super::click_named(scene.gallery, scene.operations, "editor-undo").unwrap();
    super::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        super::DEFAULT_OUTPUT_LABEL,
    );
    let root = scene.host.borrow().root_element().unwrap();
    let region = super::keyed_element(&root, region_id).expect("refreshed effect region");
    assert_eq!(
        region.source_identity(),
        Some(&retained_region),
        "metadata refresh retains effect controls"
    );
    assert!(
        super::contains_text(&root, "00:00:05:00 · Original preserved"),
        "a fresh native edit snapshot must update retained clip controls"
    );
    super::assert_no_rejections(scene.rejections, scene.name);
    super::editor_controls::validate_pending_edit(scene);
    validate_responsive(scene);
    validate_sequences(scene);
}

/// Native keyboard selection uses the clip's FocusScope callback, without synthesizing a click.
fn select_clip(scene: &super::localization::Scene<'_>, public_id: &str) {
    let contract: Value = serde_json::from_str(super::CONTRACT).unwrap();
    let id_property = super::contract_member(&contract, "FocusScope", "properties", "id");
    let key_event = super::contract_member(&contract, "FocusScope", "events", "key");
    let (node, callback) = {
        let trace = scene.operations.borrow();
        let node = super::native_id(&trace, id_property, public_id);
        let callback = trace
            .iter()
            .rev()
            .find_map(|operation| match operation {
                argui_runtime::WireOperation::SetListener {
                    id,
                    event,
                    callback,
                } if *id == node && *event == key_event => *callback,
                _ => None,
            })
            .expect("clip keyboard listener");
        (node, callback)
    };
    scene.gallery.deliver(&json!({"node":{"slot":node.slot,"generation":node.generation},"callback":callback,"payload":{"kind":"key","key":"Enter","state":"pressed"}}).to_string()).unwrap();
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
                "assets":[{"id":"source","name":"Screen.webm","width":1920,"height":1080,"durationMs":10_000,"hasVideo":true,"hasAudio":true,"hasCursor":true,"zoomCount":2,"recording":true,"cursorMode":"separated"}],
                "tracks":[{"id":"video","name":"Video","kind":"video","hidden":false,"muted":false},{"id":"audio","name":"Audio","kind":"audio","hidden":false,"muted":false}],
                "clips":[{"id":"clip","assetId":"source","trackId":"video","startMs":0,"sourceInMs":0,"durationMs":10_000,
                    "effectCount":1,"regionCount":1}],"warnings":[],
                "definitions":beam_editor_engine::domain::effects::catalog::builtins(),
                "recordingStyle":beam_editor_engine::domain::recording::style_types::RecordingStyle::default()},
            "exportFormats":[{"container":"mp4","codec":"AV1","encoder":"vaav1enc"}],
            "revision":REVISION.get(),"canUndo":true,"canRedo":false,"recovered":false,"transport":transport
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
            REVISION.set(2);
            CLIP_DURATION.set(
                snapshot["project"]["clips"]
                    .as_array()
                    .unwrap()
                    .first()
                    .map_or(10_000, |clip| clip["durationMs"].as_u64().unwrap()),
            );
            snapshot
        }
        "query" => match payload["kind"].as_str() {
            Some("clip") => {
                let mut clip = service("bootstrap", &Value::Null)["project"]["clips"][0].clone();
                clip["durationMs"] = json!(CLIP_DURATION.get());
                clip["effects"] = json!(beam_editor_engine::Effects::default());
                let definitions = beam_editor_engine::domain::effects::catalog::builtins();
                let mut instance =
                    beam_editor_engine::domain::effects::definition(&definitions, "beam.color", 1)
                        .unwrap()
                        .instantiate();
                instance.id = uuid::Uuid::from_u128(42);
                clip["instances"] = json!([instance]);
                clip["rate"] = json!({"numerator":1,"denominator":1});
                json!({"type":"clip","revision":REVISION.get(),"clip":clip})
            }
            Some("parameterValues") => json!({"type":"parameterValues","values":{}}),
            Some("presets") => {
                json!({"type":"presets","page":{"revision":REVISION.get(),"items":beam_editor_engine::domain::effects::presets::builtins(),"next":null,"total":5}})
            }
            Some("regions") => {
                let items = if HAS_CLIPS.get() {
                    vec![json!({"id":"00000000-0000-0000-0000-00000000002a",
                        "definitionId":"beam.color","definitionVersion":1,"name":null,
                        "target":{"kind":"clip","sequenceId":"first","clipId":"clip"},
                        "kind":"effect","enabled":true,"start":{"ticks":0,"timescale":1000},
                        "end":{"ticks":CLIP_DURATION.get(),"timescale":1000}})]
                } else {
                    Vec::new()
                };
                json!({"type":"regions","page":{"revision":REVISION.get(),"total":items.len(),"items":items,"next":null}})
            }
            other => panic!("unexpected editor query {other:?}"),
        },
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
