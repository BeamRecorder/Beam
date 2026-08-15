#![allow(clippy::expect_used)]

use crate::input::{InputKey, NativeInputEvent};

use super::input_monitor::{INPUT_QUEUE_CAPACITY, InputEventQueue, parse_helper_version};

#[test]
fn parses_current_helper_version_and_policy_revision() {
    let output = format!(
        r#"{{"version":"{}","policyVersion":3}}"#,
        env!("CARGO_PKG_VERSION")
    );

    assert_eq!(
        parse_helper_version(output.as_bytes()),
        Some((env!("CARGO_PKG_VERSION").to_owned(), 3))
    );
}

#[test]
fn rejects_helper_version_without_policy_revision() {
    assert_eq!(
        parse_helper_version(
            format!(r#"{{"version":"{}"}}"#, env!("CARGO_PKG_VERSION")).as_bytes()
        ),
        None
    );
}

#[test]
fn rejects_helper_version_with_incorrect_metadata_types() {
    assert_eq!(
        parse_helper_version(br#"{"version":"0.1.0","policyVersion":"2"}"#),
        None
    );
    assert_eq!(
        parse_helper_version(br#"{"version":1,"policyVersion":2}"#),
        None
    );
}

#[test]
fn rejects_invalid_helper_version_json() {
    assert_eq!(parse_helper_version(b"not json"), None);
}

#[test]
fn policy_revision_change_is_detected_even_when_package_version_matches() {
    let current = parse_helper_version(
        format!(
            r#"{{"version":"{}","policyVersion":3}}"#,
            env!("CARGO_PKG_VERSION")
        )
        .as_bytes(),
    )
    .expect("current helper metadata");
    let previous = parse_helper_version(
        format!(
            r#"{{"version":"{}","policyVersion":1}}"#,
            env!("CARGO_PKG_VERSION")
        )
        .as_bytes(),
    )
    .expect("previous helper metadata");

    assert_ne!(current, previous);
}

#[test]
fn full_input_queue_coalesces_adjacent_motion() {
    let mut queue = InputEventQueue::default();
    for monotonic_ns in 0..INPUT_QUEUE_CAPACITY as u64 {
        queue.push(NativeInputEvent::MouseMotion {
            monotonic_ns,
            delta_x: 1,
            delta_y: -1,
        });
    }
    queue.push(NativeInputEvent::MouseMotion {
        monotonic_ns: 9_999,
        delta_x: 4,
        delta_y: -3,
    });

    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::MouseMotion {
            monotonic_ns: 9_999,
            delta_x: 5,
            delta_y: -4,
        })
    ));
}

#[test]
fn full_input_queue_preserves_a_button_by_discarding_motion_first() {
    let mut queue = InputEventQueue::default();
    for monotonic_ns in 0..INPUT_QUEUE_CAPACITY as u64 {
        queue.push(NativeInputEvent::MouseMotion {
            monotonic_ns,
            delta_x: 1,
            delta_y: 0,
        });
    }
    queue.push(NativeInputEvent::MouseButton {
        monotonic_ns: 10_000,
        button: 1,
        pressed: false,
    });

    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::MouseButton {
            monotonic_ns: 10_000,
            pressed: false,
            ..
        })
    ));
}

#[test]
fn full_non_motion_queue_remains_bounded() {
    let mut queue = InputEventQueue::default();
    for monotonic_ns in 0..INPUT_QUEUE_CAPACITY as u64 {
        queue.push(NativeInputEvent::MouseButton {
            monotonic_ns,
            button: 1,
            pressed: true,
        });
    }
    queue.push(NativeInputEvent::Shortcut {
        monotonic_ns: 10_000,
        pressed: true,
        modifiers: Vec::new(),
        key: InputKey::Escape,
    });

    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::Shortcut {
            key: InputKey::Escape,
            ..
        })
    ));
}

#[test]
fn stopped_input_queue_rejects_late_events_without_dropping_queued_events() {
    let mut queue = InputEventQueue::default();
    queue.push(NativeInputEvent::MouseButton {
        monotonic_ns: 10,
        button: 1,
        pressed: true,
    });
    queue.accepting = false;
    queue.push(NativeInputEvent::MouseButton {
        monotonic_ns: 20,
        button: 1,
        pressed: false,
    });

    assert_eq!(queue.events.len(), 1);
    assert!(matches!(
        queue.events.front(),
        Some(NativeInputEvent::MouseButton {
            monotonic_ns: 10,
            pressed: true,
            ..
        })
    ));
}
