#![allow(clippy::expect_used)]

use std::collections::HashSet;
use std::path::Path;

use capture::input::{
    INPUT_SIDECAR_VERSION, InputAccessState, InputAccessStatus, InputEvent, InputEventSidecar,
    InputKey, InputModifier, ShortcutSampler, finalize_input_events,
};

fn pressed(keys: &[InputKey]) -> HashSet<InputKey> {
    keys.iter().copied().collect()
}

#[test]
fn shortcut_sampler_accepts_ctrl_w_and_keeps_modifiers_on_release() {
    let mut sampler = ShortcutSampler::default();
    let mut keys = pressed(&[InputKey::W]);
    let press = sampler.sample(
        100,
        |modifier| modifier == InputModifier::Control,
        |key| keys.contains(&key),
    );
    assert_eq!(
        press,
        vec![InputEvent::Shortcut {
            session_ns: 100,
            pressed: true,
            modifiers: vec![InputModifier::Control],
            key: InputKey::W,
        }]
    );

    keys.clear();
    let release = sampler.sample(
        200,
        |modifier| modifier == InputModifier::Control,
        |key| keys.contains(&key),
    );
    assert_eq!(
        release,
        vec![InputEvent::Shortcut {
            session_ns: 200,
            pressed: false,
            modifiers: vec![InputModifier::Control],
            key: InputKey::W,
        }]
    );
}

#[test]
fn shortcut_sampler_ignores_bare_w_and_shift_w() {
    let mut sampler = ShortcutSampler::default();
    let mut keys = pressed(&[InputKey::W]);
    assert!(
        sampler
            .sample(100, |_| false, |key| keys.contains(&key))
            .is_empty()
    );
    keys.clear();
    assert!(
        sampler
            .sample(200, |_| false, |key| keys.contains(&key))
            .is_empty()
    );

    keys.insert(InputKey::W);
    assert!(
        sampler
            .sample(
                300,
                |modifier| modifier == InputModifier::Shift,
                |key| keys.contains(&key)
            )
            .is_empty()
    );
    keys.clear();
    assert!(
        sampler
            .sample(
                400,
                |modifier| modifier == InputModifier::Shift,
                |key| keys.contains(&key)
            )
            .is_empty()
    );
}

#[test]
fn shortcut_sampler_structures_ctrl_arrow_up() {
    let mut sampler = ShortcutSampler::default();
    let keys = pressed(&[InputKey::ArrowUp]);
    let events = sampler.sample(
        500,
        |modifier| modifier == InputModifier::Control,
        |key| keys.contains(&key),
    );

    assert_eq!(
        events,
        vec![InputEvent::Shortcut {
            session_ns: 500,
            pressed: true,
            modifiers: vec![InputModifier::Control],
            key: InputKey::ArrowUp,
        }]
    );
}

#[test]
fn input_sidecar_serializes_structured_shortcuts_without_text() {
    let sidecar = InputEventSidecar::new(vec![InputEvent::Shortcut {
        session_ns: 42,
        pressed: true,
        modifiers: vec![InputModifier::Control],
        key: InputKey::ArrowUp,
    }]);
    let value = serde_json::to_value(sidecar).expect("input sidecar JSON");

    assert_eq!(value["version"], INPUT_SIDECAR_VERSION);
    assert_eq!(value["events"][0]["event"], "shortcut");
    assert_eq!(value["events"][0]["sessionNs"], 42);
    assert_eq!(value["events"][0]["modifiers"][0], "control");
    assert_eq!(value["events"][0]["key"], "arrow-up");
    assert!(value["events"][0].get("text").is_none());
    assert!(
        !serde_json::to_string(&value)
            .expect("serialized JSON")
            .contains("text")
    );
}

#[test]
fn input_access_availability_reflects_known_device_counters() {
    let mouse_only = InputAccessStatus::available(Some(2), Some(0));
    assert!(mouse_only.clicks);
    assert!(!mouse_only.shortcuts);

    let keyboard_only = InputAccessStatus::available(Some(0), Some(2));
    assert!(!keyboard_only.clicks);
    assert!(keyboard_only.shortcuts);

    let unknown_devices = InputAccessStatus::available(None, None);
    assert!(unknown_devices.clicks);
    assert!(unknown_devices.shortcuts);
}

#[test]
fn input_access_distinguishes_an_explicit_helper_installation() {
    let status = InputAccessStatus::installation_required();

    assert_eq!(status.state, InputAccessState::InstallationRequired);
    assert!(status.can_request);
    assert!(!status.clicks);
    assert!(!status.shortcuts);
    assert!(!status.records_text);
}

#[test]
fn finalizing_input_events_sorts_events_and_removes_the_partial_sidecar() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let partial = temporary.path().join("input.partial.jsonl");
    let destination = temporary.path().join("input.json");
    std::fs::write(
        &partial,
        concat!(
            "{\"event\":\"mouse-button\",\"sessionNs\":30,\"button\":1,\"pressed\":true}\n",
            "{\"event\":\"mouse-button\",\"sessionNs\":10,\"button\":1,\"pressed\":false}\n",
        ),
    )
    .expect("write input partial");

    finalize_input_events(Path::new(&partial), Path::new(&destination))
        .expect("finalize input events");

    let sidecar: InputEventSidecar =
        serde_json::from_slice(&std::fs::read(&destination).expect("read input sidecar"))
            .expect("parse input sidecar");
    assert_eq!(sidecar.version, INPUT_SIDECAR_VERSION);
    assert_eq!(sidecar.events.len(), 2);
    assert_eq!(sidecar.events[0].session_ns(), 10);
    assert_eq!(sidecar.events[1].session_ns(), 30);
    assert!(
        !partial.exists(),
        "successful finalization must not leave a partial"
    );
}

#[test]
fn finalizing_an_empty_input_partial_still_writes_a_complete_sidecar() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let partial = temporary.path().join("input.partial.jsonl");
    let destination = temporary.path().join("input.json");
    std::fs::write(&partial, b"\n").expect("write empty input partial");

    finalize_input_events(&partial, &destination).expect("finalize empty input events");

    let sidecar: InputEventSidecar =
        serde_json::from_slice(&std::fs::read(&destination).expect("read input sidecar"))
            .expect("parse input sidecar");
    assert_eq!(sidecar, InputEventSidecar::new(Vec::new()));
    assert!(
        !partial.exists(),
        "empty successful finalization must clean up partial"
    );
}

#[test]
fn invalid_input_partial_is_preserved_for_recovery() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let partial = temporary.path().join("input.partial.jsonl");
    let destination = temporary.path().join("input.json");
    std::fs::write(&partial, b"{invalid\n").expect("write invalid input partial");

    assert!(finalize_input_events(&partial, &destination).is_err());

    assert!(partial.is_file());
    assert!(!destination.exists());
}
