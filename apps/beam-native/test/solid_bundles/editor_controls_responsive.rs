//! Retained native panel resizing, painted labels and control alignment.

use super::{FONT, bounds, element_mut, layout, node, vector_node};
use argui_core::{Point, PointerButton, PointerEvent, PointerPhase, Size};
use argui_layout::LayoutEngine;
use argui_text::TextEngine;
use argui_ui::{Element, UiTree};

/// Exercises the compiled editor's responsive children before any JS size commit.
pub(super) fn validate(authored: &Element) {
    let (ui, output) = layout(authored.clone());
    for id in ["editor-undo", "editor-redo", "editor-add-sequence"] {
        let control = bounds(&output, node(&ui, id));
        let icon = bounds(&output, vector_node(&ui, node(&ui, id)));
        assert!(
            (center(control).x - center(icon).x).abs() <= 0.5,
            "{id}: horizontal icon alignment"
        );
        assert!(
            (center(control).y - center(icon).y).abs() <= 0.5,
            "{id}: vertical icon alignment: {icon:?}/{control:?}"
        );
    }
    let tabs = bounds(&output, node(&ui, "editor-sequences"));
    let bar = bounds(&output, node(&ui, "editor-sequence-bar"));
    assert!(
        (tabs.origin.x - bar.origin.x - 8.).abs() <= 0.5,
        "sequence tabs must start at the left inset"
    );
    let label = ui
        .element_for(node(&ui, "editor-sequences-first-label"))
        .unwrap();
    let argui_ui::ElementKind::Text { style, .. } = &label.children[0].children[0].kind else {
        panic!("sequence label")
    };
    assert_eq!(style.align, argui_text::TextAlign::Start);

    let mut view = authored.clone();
    element_mut(&mut view, "editor-library-pane")
        .style
        .size
        .width = argui_ui::length(600.);
    let mut ui = UiTree::new(view);
    let mut engine = LayoutEngine::new();
    let mut text = TextEngine::from_embedded_fonts([FONT], "Noto Sans", "Noto Sans", "Noto Sans");
    let viewport = Size::new(1440., 900.);
    let mut output = engine.compute(&mut ui, &mut text, viewport).unwrap();
    let pane = bounds(&output, node(&ui, "editor-library-pane"));
    let header_inset = pane.size.width - bounds(&output, node(&ui, "editor-library")).size.width;
    let origin = center(bounds(&output, node(&ui, "editor-library-divider-handle")));
    let revision = ui.revision();
    ui.pointer_event(pointer(PointerPhase::Pressed, origin), &output.hit_regions);
    for (width, labeled) in [
        (600., true),
        (463. + header_inset, false),
        (464. + header_inset, true),
        (465. + header_inset, true),
        (320., false),
        (600., true),
        (320., false),
    ] {
        let position = Point::new(origin.x + width - pane.size.width, origin.y);
        let change = ui.pointer_event(pointer(PointerPhase::Moved, position), &output.hit_regions);
        assert!(change.events.is_empty(), "resizing must not enter JS");
        output = engine.compute(&mut ui, &mut text, viewport).unwrap();
        assert_eq!(
            bounds(&output, node(&ui, "editor-library-pane")).size.width,
            width
        );
        for key in [
            "media",
            "text",
            "transitions",
            "effects",
            "filters",
            "templates",
        ] {
            let label = node(&ui, &format!("editor-library-{key}-label"));
            assert_eq!(
                bounds(&output, label).size.height > 0.,
                labeled,
                "native label height at {width}"
            );
            let label_text = ui.element_for(label).unwrap().children[0].children[0].clone();
            let text_node = super::native_node(&ui, &label_text);
            let text_layout = output
                .nodes
                .iter()
                .find(|entry| entry.node == text_node)
                .unwrap();
            let visible = text_layout.clip.is_some_and(|clip| {
                clip.size.height > 0. && clip.intersection(text_layout.bounds).is_some()
            });
            assert_eq!(
                visible, labeled,
                "painted labels must change during drag at {width}: {text_layout:?}"
            );
            let painted = text_layout.text_index.is_some_and(|index| {
                output.display_list.commands().iter().any(|command| {
            matches!(command, argui_paint::DisplayCommand::Text { block, .. } if *block == index)
        })
            });
            assert_eq!(
                painted, labeled,
                "label must follow the actual paint clip during drag at {width}"
            );
            let hint = node(&ui, &format!("editor-library-{key}-hint"));
            assert_eq!(
                output.hit_regions.iter().any(|region| region.node == hint),
                !labeled,
                "library hints are available only without their visible label at {width}"
            );
            let tab_node = node(&ui, &format!("editor-library-{key}"));
            let tab = bounds(&output, tab_node);
            let indicator = bounds(&output, node(&ui, "editor-library-indicator"));
            assert!(
                (tab.size.width - indicator.size.width).abs() <= 1.,
                "indicator follows native tab width during resize"
            );
            if !labeled {
                let icon = bounds(&output, vector_node(&ui, tab_node));
                assert!(
                    (center(tab).x - center(icon).x).abs() <= 0.5,
                    "icon-only horizontal centering"
                );
                assert!(
                    (center(tab).y - center(icon).y).abs() <= 0.5,
                    "icon-only content is centered"
                );
            }
        }
        assert_eq!(ui.revision(), revision);
    }
}

/// Uses the compiled popup subtree to check intrinsic sizing and unclamped wrapping.
pub(super) fn validate_hint(authored: &Element, id: &str) {
    let mut short_height = 0.;
    let long_hint = "A delayed hint must fit its content and wrap longer descriptions without hiding any of their text. ".repeat(5);
    for (text, wrapped) in [("Media".to_owned(), false), (long_hint, true)] {
        let mut view = authored.clone();
        let element = element_mut(&mut view, &format!("{id}-text"));
        let argui_ui::ElementKind::Text { content, .. } = &mut element.kind else {
            panic!("hint text")
        };
        *content = argui_text::TextContent::plain(text);
        let (ui, output) = layout(view);
        let surface = bounds(&output, node(&ui, &format!("{id}-surface")));
        let popup = bounds(&output, node(&ui, &format!("{id}-popup")));
        let text = bounds(&output, node(&ui, &format!("{id}-text")));
        assert!(
            surface.size.width <= 280.,
            "hint exceeds maximum width: {surface:?}"
        );
        assert!(
            (popup.size.width - surface.size.width).abs() <= 1.,
            "popup fits its painted surface: {popup:?}/{surface:?}"
        );
        if wrapped {
            assert!(
                surface.size.height > short_height * 3.,
                "long content wraps without a three-line clamp: {surface:?}"
            );
            assert!(text.size.width <= surface.size.width - 20.);
        } else {
            assert!(
                surface.size.width < 100.,
                "short hints fit their text: {surface:?}"
            );
            short_height = surface.size.height;
        }
    }
    // A hint can remain mounted until JS sees pointer leave after native resizing.
    let mut view = authored.clone();
    element_mut(&mut view, "editor-library-pane")
        .style
        .size
        .width = argui_ui::length(600.);
    element_mut(&mut view, "editor-library").style.size.width = argui_ui::length(540.);
    let (ui, output) = layout(view);
    let hint_text = node(&ui, &format!("{id}-text"));
    let index = output
        .nodes
        .iter()
        .find(|entry| entry.node == hint_text)
        .unwrap()
        .text_index
        .unwrap();
    assert!(
        output.display_list.commands().iter().all(|command| {
            !matches!(command, argui_paint::DisplayCommand::Text { block, .. } if *block == index)
        }),
        "a mounted hint must stop painting when labels become visible"
    );
}

/// Returns a measured control's center in logical coordinates.
fn center(rect: argui_core::Rect) -> Point {
    Point::new(
        rect.origin.x + rect.size.width / 2.,
        rect.origin.y + rect.size.height / 2.,
    )
}

/// Builds captured native mouse input without delivering any producer callbacks.
fn pointer(phase: PointerPhase, position: Point) -> PointerEvent {
    PointerEvent {
        button: matches!(phase, PointerPhase::Pressed | PointerPhase::Released)
            .then_some(PointerButton::Primary),
        buttons: u16::from(matches!(phase, PointerPhase::Pressed | PointerPhase::Moved)),
        ..PointerEvent::mouse(phase, position)
    }
}
