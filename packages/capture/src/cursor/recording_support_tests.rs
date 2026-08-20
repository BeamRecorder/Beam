#![allow(clippy::expect_used)]

use crate::{
    CaptureError,
    cursor::{CursorEvent, CursorRecordingPaths, finalize_after_worker},
    input::InputEventSidecar,
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
