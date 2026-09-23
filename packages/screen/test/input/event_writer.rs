#![allow(clippy::expect_used)]

use beam_screen::input::{InputEvent, InputEventWriter, finalize_input_events};

#[test]
fn reopening_the_partial_writer_appends_events_before_finalization() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let partial = temporary.path().join("input.partial.jsonl");
    let final_path = temporary.path().join("input.json");
    let event = InputEvent::MouseButton {
        session_ns: 3,
        button: 1,
        pressed: true,
    };
    for _ in 0..2 {
        let mut writer = InputEventWriter::open(&partial).expect("open");
        writer.push(&event).expect("event");
        writer.flush().expect("flush");
    }
    finalize_input_events(&partial, &final_path).expect("finalize");
    let sidecar: serde_json::Value =
        serde_json::from_slice(&std::fs::read(final_path).expect("sidecar")).expect("JSON");
    assert_eq!(sidecar["events"].as_array().expect("events").len(), 2);
    assert!(!partial.exists());
}
