#![allow(clippy::expect_used)]

use crate::{
    CaptureError,
    cursor::{
        CursorEvent, CursorKind, CursorRecordingPaths, CursorShapeCatalogEntry,
        CursorTelemetrySidecar, Hotspot, finalize_after_worker,
    },
    input::{InputEvent, InputEventSidecar},
};

fn paths(root: &std::path::Path) -> CursorRecordingPaths {
    CursorRecordingPaths {
        partial: root.join("cursor.partial.jsonl"),
        final_path: root.join("cursor.json"),
        telemetry: root.join("telemetry.json"),
        shapes: root.join("shapes.json"),
        input_partial: root.join("input.partial.jsonl"),
        input: root.join("input.json"),
    }
}

fn write_recoverable_partials(paths: &CursorRecordingPaths) {
    let visibility = serde_json::to_string(&CursorEvent::Visibility {
        session_ns: 0,
        visible: true,
    })
    .expect("visibility JSON");
    std::fs::write(&paths.partial, format!("{visibility}\n")).expect("cursor partial");
    std::fs::write(&paths.input_partial, "").expect("input partial");
}

fn write_successful_cursor_partials(paths: &CursorRecordingPaths) {
    let events = [
        CursorEvent::Visibility {
            session_ns: 0,
            visible: true,
        },
        CursorEvent::Shape {
            session_ns: 1_000_000,
            cursor_id: "macos:arrow".into(),
            cursor_kind: CursorKind::Default,
            native_cursor_id: "macos:arrow".into(),
            hotspot: Hotspot { x: 10, y: 7 },
        },
        CursorEvent::Move {
            session_ns: 2_000_000,
            cursor_id: Some("macos:arrow".into()),
            pixel_x: 100,
            pixel_y: 200,
            normalized_x: 0.25,
            normalized_y: 0.5,
            visible: true,
        },
        CursorEvent::Button {
            session_ns: 3_000_000,
            button: 1,
            pressed: true,
            normalized_x: 0.25,
            normalized_y: 0.5,
        },
        CursorEvent::Button {
            session_ns: 4_000_000,
            button: 1,
            pressed: false,
            normalized_x: 0.25,
            normalized_y: 0.5,
        },
    ];
    let cursor_lines = events
        .iter()
        .map(|event| serde_json::to_string(event).expect("cursor event JSON"))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&paths.partial, format!("{cursor_lines}\n")).expect("cursor partial");

    let input_events = [
        InputEvent::MouseButton {
            session_ns: 3_000_000,
            button: 1,
            pressed: true,
        },
        InputEvent::MouseButton {
            session_ns: 4_000_000,
            button: 1,
            pressed: false,
        },
    ];
    let input_lines = input_events
        .iter()
        .map(|event| serde_json::to_string(event).expect("input event JSON"))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&paths.input_partial, format!("{input_lines}\n")).expect("input partial");
}

#[test]
fn worker_error_still_publishes_recoverable_sidecars_and_cleans_partials() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let paths = paths(temporary.path());
    write_recoverable_partials(&paths);

    let result = finalize_after_worker(
        Err(CaptureError::Backend("CGEventCreate failed".into())),
        paths,
    );

    assert!(
        matches!(result, Err(CaptureError::Backend(message)) if message == "CGEventCreate failed")
    );
    let events: Vec<CursorEvent> = serde_json::from_slice(
        &std::fs::read(temporary.path().join("cursor.json")).expect("cursor JSON"),
    )
    .expect("cursor events");
    assert_eq!(events.len(), 1);
    let input: InputEventSidecar = serde_json::from_slice(
        &std::fs::read(temporary.path().join("input.json")).expect("input JSON"),
    )
    .expect("input sidecar");
    assert!(input.events.is_empty());
    assert!(temporary.path().join("telemetry.json").is_file());
    assert!(temporary.path().join("shapes.json").is_file());
    assert!(!temporary.path().join("cursor.partial.jsonl").exists());
    assert!(!temporary.path().join("input.partial.jsonl").exists());
}

#[test]
fn successful_worker_publishes_empty_sidecars_without_partials() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let paths = paths(temporary.path());
    std::fs::write(&paths.partial, "").expect("cursor partial");
    std::fs::write(&paths.input_partial, "").expect("input partial");

    finalize_after_worker(Ok(()), paths).expect("finalization");

    let events: Vec<CursorEvent> = serde_json::from_slice(
        &std::fs::read(temporary.path().join("cursor.json")).expect("cursor JSON"),
    )
    .expect("cursor events");
    assert!(events.is_empty());
    assert!(!temporary.path().join("cursor.partial.jsonl").exists());
    assert!(!temporary.path().join("input.partial.jsonl").exists());
}

#[test]
fn successful_worker_publishes_cursor_events_telemetry_shapes_and_input() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let paths = paths(temporary.path());
    write_successful_cursor_partials(&paths);

    finalize_after_worker(Ok(()), paths).expect("finalization");

    let events: Vec<CursorEvent> = serde_json::from_slice(
        &std::fs::read(temporary.path().join("cursor.json")).expect("cursor JSON"),
    )
    .expect("cursor events");
    assert!(matches!(
        events.first(),
        Some(CursorEvent::Visibility { visible: true, .. })
    ));
    assert!(matches!(
        events.get(1),
        Some(CursorEvent::Shape {
            cursor_id,
            cursor_kind: CursorKind::Default,
            native_cursor_id,
            hotspot: Hotspot { x: 10, y: 7 },
            ..
        }) if cursor_id == "macos:arrow" && native_cursor_id == "macos:arrow"
    ));
    assert!(matches!(
        events.get(2),
        Some(CursorEvent::Move {
            cursor_id: Some(cursor_id),
            pixel_x: 100,
            pixel_y: 200,
            normalized_x,
            normalized_y,
            ..
        }) if cursor_id == "macos:arrow" && *normalized_x == 0.25 && *normalized_y == 0.5
    ));
    assert!(matches!(
        events.get(3),
        Some(CursorEvent::Button {
            button: 1,
            pressed: true,
            ..
        })
    ));
    assert!(matches!(
        events.get(4),
        Some(CursorEvent::Button {
            button: 1,
            pressed: false,
            ..
        })
    ));

    let telemetry: CursorTelemetrySidecar = serde_json::from_slice(
        &std::fs::read(temporary.path().join("telemetry.json")).expect("telemetry JSON"),
    )
    .expect("telemetry sidecar");
    assert_eq!(telemetry.version, 2);
    assert_eq!(telemetry.samples.len(), 3);
    assert_eq!(telemetry.samples[0].time_ms, 2);
    assert_eq!(
        telemetry.samples[0].interaction_type,
        Some(crate::cursor::CursorInteractionType::Move)
    );
    assert_eq!(telemetry.samples[1].time_ms, 3);
    assert_eq!(
        telemetry.samples[1].interaction_type,
        Some(crate::cursor::CursorInteractionType::Click)
    );
    assert_eq!(telemetry.samples[2].time_ms, 4);
    assert_eq!(
        telemetry.samples[2].interaction_type,
        Some(crate::cursor::CursorInteractionType::Mouseup)
    );

    let shapes: std::collections::BTreeMap<String, CursorShapeCatalogEntry> =
        serde_json::from_slice(
            &std::fs::read(temporary.path().join("shapes.json")).expect("shapes JSON"),
        )
        .expect("shape catalog");
    assert_eq!(
        shapes.get("macos:arrow"),
        Some(&CursorShapeCatalogEntry {
            cursor_kind: CursorKind::Default,
            native_cursor_id: "macos:arrow".into(),
            hotspot: Hotspot { x: 10, y: 7 },
        })
    );

    let input: InputEventSidecar = serde_json::from_slice(
        &std::fs::read(temporary.path().join("input.json")).expect("input JSON"),
    )
    .expect("input sidecar");
    assert_eq!(input.events.len(), 2);
    assert!(matches!(
        input.events[0],
        InputEvent::MouseButton {
            session_ns: 3_000_000,
            button: 1,
            pressed: true
        }
    ));
    assert!(matches!(
        input.events[1],
        InputEvent::MouseButton {
            session_ns: 4_000_000,
            button: 1,
            pressed: false
        }
    ));
    assert!(!temporary.path().join("cursor.partial.jsonl").exists());
    assert!(!temporary.path().join("input.partial.jsonl").exists());
}

#[test]
fn invalid_cursor_partial_is_preserved_for_recovery() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let paths = paths(temporary.path());
    std::fs::write(&paths.partial, "{invalid\n").expect("cursor partial");
    std::fs::write(&paths.input_partial, "").expect("input partial");

    assert!(finalize_after_worker(Ok(()), paths).is_err());

    assert!(temporary.path().join("cursor.partial.jsonl").is_file());
    assert!(!temporary.path().join("input.partial.jsonl").exists());
    assert!(temporary.path().join("input.json").is_file());
}
