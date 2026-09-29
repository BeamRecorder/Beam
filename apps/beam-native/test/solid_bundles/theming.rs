//! Live theme changes on the native measurement and reader surfaces.

use crate::{
    keyed_element,
    localization::{Scene, preferences},
};
use argui_core::Color;
use argui_paint::Fill;
use argui_ui::{Element, ElementKind};
use beam_native::{ServiceOutcome, ServiceResponse};
use serde_json::json;

/// Finds the script editor without coupling tests to its generated native identity.
fn editor(root: &Element) -> Option<&Element> {
    if matches!(root.kind, ElementKind::TextEditor { .. }) {
        return Some(root);
    }
    root.children.iter().find_map(editor)
}

/// Verifies measurement and reader surfaces preserve contrast in both theme variants.
pub(super) fn validate(scene: &Scene<'_>) {
    let window = match scene.name {
        "app.mjs:mountRegionControls" => "regionControls",
        "app.mjs:mountTeleprompter" => "teleprompter",
        _ => return,
    };
    for (variant, foreground, background) in [
        ("dark", "#f5f5f7", "#212123f0"),
        ("light", "#16161a", "#f7f7f8f0"),
        ("dark", "#f5f5f7", "#212123f0"),
    ] {
        let mut value = preferences("en");
        value["theme"] = json!(variant);
        scene
            .gallery
            .deliver_service(
                &ServiceResponse {
                    session: 1,
                    window: window.into(),
                    request_id: 0,
                    outcome: ServiceOutcome::Event(
                        json!({ "type": "preferencesChanged", "preferences": value }),
                    ),
                }
                .json()
                .to_string(),
            )
            .unwrap();
        scene.gallery.tick(0.0).unwrap();
        let root = scene.host.borrow().root_element().unwrap();
        if window == "regionControls" {
            let label = keyed_element(&root, "region-dimensions").unwrap();
            let ElementKind::Text { style, .. } = &label.kind else {
                panic!("measurement text")
            };
            assert_eq!(
                style.color,
                Color::from_hex(foreground).unwrap(),
                "{variant} capture label contrast"
            );
            let surface = keyed_element(&root, "region-dimensions-pill").unwrap();
            let background = if variant == "light" {
                "#ffffff"
            } else {
                "#2b2b2e"
            };
            assert_eq!(
                surface.paint.quad.background,
                Some(Fill::Solid(Color::from_hex(background).unwrap()))
            );
        } else {
            let title = keyed_element(&root, "teleprompter-title").unwrap();
            let ElementKind::Text { style, .. } = &title.kind else {
                panic!("reader title")
            };
            assert_eq!(style.color, Color::from_hex(foreground).unwrap());
            let surface = keyed_element(&root, "teleprompter-surface").unwrap();
            assert_eq!(
                surface.paint.quad.background,
                Some(Fill::Solid(Color::from_hex(background).unwrap()))
            );
            let ElementKind::TextEditor { text, .. } = &editor(&root).unwrap().kind else {
                panic!("script editor")
            };
            assert_eq!(text.color, Color::from_hex(foreground).unwrap());
        }
    }
    crate::hydrate_services(
        scene.gallery,
        scene.requests,
        scene.rejections,
        scene.name,
        crate::DEFAULT_OUTPUT_LABEL,
    );
}
