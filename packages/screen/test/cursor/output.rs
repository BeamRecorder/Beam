#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::*;
#[test]
fn unknown_cursor_emits_no_fabricated_motion_and_finalizes_empty_sidecars() {
    let directory = tempfile::tempdir().unwrap();
    let mut output = CursorOutput::new(directory.path().to_owned());
    output.push_sample(10, CursorSampleState::Unknown).unwrap();
    output.finish().unwrap();
    let events: Vec<serde_json::Value> =
        serde_json::from_slice(&std::fs::read(directory.path().join("cursor.json")).unwrap())
            .unwrap();
    assert!(events.is_empty());
    assert!(!directory.path().join("cursor.partial.jsonl").exists());
}
#[test]
fn output_failure_is_reported_without_overwriting_existing_file() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("occupied");
    std::fs::write(&target, b"keep").unwrap();
    let mut output = CursorOutput::new(target.clone());
    assert!(output.finish().is_err());
    assert_eq!(std::fs::read(target).unwrap(), b"keep");
}

fn known(id: &str, visible: bool, x: f64) -> CursorSampleState {
    CursorSampleState::Known {
        native_cursor_id: id.into(),
        cursor_kind: crate::cursor::CursorKind::Default,
        pixel_x: x as i32,
        pixel_y: 20,
        normalized_x: x / 100.0,
        normalized_y: 0.2,
        visible,
        hotspot: Some(Hotspot { x: 1, y: 2 }),
    }
}
#[test]
fn cursor_output_fuses_motion_clicks_shapes_and_visibility_into_recoverable_files() {
    let directory = tempfile::tempdir().unwrap();
    let mut output = CursorOutput::new(directory.path().to_owned());
    output.push_sample(0, known("pointer", true, 10.0)).unwrap();
    output
        .push_input(CursorInputEvent {
            session_ns: 5,
            delta_x: 2,
            delta_y: 0,
        })
        .unwrap();
    output
        .push_button(RecordedButton {
            session_ns: 5,
            button: 1,
            pressed: true,
        })
        .unwrap();
    output
        .push_sample(10, known("pointer", true, 12.0))
        .unwrap();
    output.push_sample(20, known("text", false, 15.0)).unwrap();
    output
        .push_input(CursorInputEvent {
            session_ns: 25,
            delta_x: 1,
            delta_y: 0,
        })
        .unwrap();
    assert!(directory.path().join("cursor.partial.jsonl").is_file());
    output.finish().unwrap();
    let events: Vec<CursorEvent> =
        serde_json::from_slice(&std::fs::read(directory.path().join("cursor.json")).unwrap())
            .unwrap();
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, CursorEvent::Shape { .. }))
            .count(),
        2
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, CursorEvent::Visibility { .. }))
            .count(),
        2
    );
    assert!(
        events
            .iter()
            .any(|event| matches!(event, CursorEvent::Move { session_ns: 5, .. }))
    );
    assert_eq!(output.shapes.len(), 2);
    assert!(directory.path().join("telemetry.json").is_file());
    assert!(directory.path().join("shapes.json").is_file());
    assert!(!directory.path().join("cursor.partial.jsonl").exists());
}
#[test]
fn input_budget_and_failed_partial_writer_do_not_grow_memory() {
    let directory = tempfile::tempdir().unwrap();
    let mut output = CursorOutput::new(directory.path().to_owned());
    output.input_count = 1_000_000;
    assert!(
        output
            .push_input(CursorInputEvent {
                session_ns: 1,
                delta_x: 0,
                delta_y: 0
            })
            .is_err()
    );
    std::fs::create_dir(directory.path().join("cursor.partial.jsonl")).unwrap();
    assert!(output.push_sample(0, known("pointer", true, 10.0)).is_err());
    assert!(output.events.is_empty());
}
