#![allow(clippy::expect_used)]

use std::collections::HashSet;

use capture::input::{
    INPUT_SIDECAR_VERSION, InputAccessState, InputAccessStatus, InputEvent, InputEventSidecar,
    InputKey, InputModifier, ShortcutSampler,
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
