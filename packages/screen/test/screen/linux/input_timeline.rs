#![cfg(test)]
#![allow(clippy::expect_used)]

use super::super::input_monitor::InputEventQueue;
use crate::input::{InputKey, InputModifier};
use std::sync::{Arc, Mutex};

use super::*;

#[test]
fn maps_motion_without_turning_it_into_a_persisted_input_event() {
    let mapped = map_input_event(
        NativeInputEvent::MouseMotion {
            monotonic_ns: 120,
            delta_x: 3,
            delta_y: -2,
        },
        100,
        1_000,
    );
    assert!(matches!(
        mapped,
        MappedInputEvent::Motion {
            session_ns: 1_020,
            delta_x: 3,
            delta_y: -2,
        }
    ));
}

#[test]
fn maps_buttons_to_the_session_clock() {
    let mapped = map_input_event(
        NativeInputEvent::MouseButton {
            monotonic_ns: 150,
            button: 1,
            pressed: false,
        },
        100,
        1_000,
    );
    assert!(matches!(
        mapped,
        MappedInputEvent::Persistent(InputEvent::MouseButton {
            session_ns: 1_050,
            button: 1,
            pressed: false,
        })
    ));
}

#[test]
fn maps_shortcuts_without_changing_their_structure() {
    let mapped = map_input_event(
        NativeInputEvent::Shortcut {
            monotonic_ns: 90,
            pressed: true,
            modifiers: vec![InputModifier::Control],
            key: InputKey::K,
        },
        100,
        1_000,
    );
    assert!(matches!(
        mapped,
        MappedInputEvent::Persistent(InputEvent::Shortcut {
            session_ns: 1_000,
            pressed: true,
            key: InputKey::K,
            ..
        })
    ));
}

fn timeline_fixture(directory: PathBuf) -> (InputTimeline, Arc<Mutex<InputEventQueue>>) {
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    (
        InputTimeline {
            directory,
            monitor: Some(LinuxInputMonitor {
                queue: queue.clone(),
            }),
            anchor: None,
            events: Vec::new(),
            capture_clicks: true,
            capture_shortcuts: true,
        },
        queue,
    )
}

#[test]
fn drain_discards_events_before_the_first_screen_frame_and_sets_one_anchor() {
    let (mut timeline, queue) = timeline_fixture(PathBuf::new());
    queue
        .lock()
        .expect("input queue")
        .events
        .push_back(NativeInputEvent::MouseButton {
            monotonic_ns: 10,
            button: 1,
            pressed: true,
        });
    assert!(timeline.drain(None).expect("preframe drain").is_empty());
    assert!(timeline.anchor.is_none());
    assert!(queue.lock().expect("input queue").events.is_empty());

    assert!(timeline.drain(Some(80)).expect("first frame").is_empty());
    assert_eq!(timeline.anchor.map(|(_, session)| session), Some(80));
    let anchored = timeline.anchor;
    assert!(timeline.drain(Some(100)).expect("later frame").is_empty());
    assert_eq!(timeline.anchor, anchored);
}

#[test]
fn drain_filters_preanchor_events_maps_motion_and_persists_only_structured_events() {
    let (mut timeline, queue) = timeline_fixture(PathBuf::new());
    timeline.anchor = Some((100, 1_000));
    queue.lock().expect("input queue").events.extend([
        NativeInputEvent::MouseButton {
            monotonic_ns: 99,
            button: 1,
            pressed: true,
        },
        NativeInputEvent::MouseMotion {
            monotonic_ns: 101,
            delta_x: 3,
            delta_y: -2,
        },
        NativeInputEvent::MouseButton {
            monotonic_ns: 102,
            button: 2,
            pressed: false,
        },
        NativeInputEvent::Shortcut {
            monotonic_ns: 103,
            pressed: true,
            modifiers: vec![InputModifier::Control],
            key: InputKey::K,
        },
    ]);
    let mapped = timeline.drain(None).expect("mapped input");
    assert_eq!(mapped.len(), 3);
    assert!(matches!(
        mapped[0],
        MappedInputEvent::Motion {
            session_ns: 1_001,
            ..
        }
    ));
    assert_eq!(timeline.events.len(), 2);
    assert_eq!(timeline.events[0].session_ns(), 1_002);
    assert_eq!(timeline.events[1].session_ns(), 1_003);
    assert!(queue.lock().expect("input queue").events.is_empty());
}

#[test]
fn reset_and_stop_prevent_old_input_from_crossing_recording_segments() {
    let (mut timeline, queue) = timeline_fixture(PathBuf::new());
    timeline.anchor = Some((100, 1_000));
    timeline.reset_anchor();
    assert!(timeline.anchor.is_none());
    timeline.stop();
    assert!(!queue.lock().expect("input queue").accepting);
    queue
        .lock()
        .expect("input queue")
        .push(NativeInputEvent::MouseButton {
            monotonic_ns: 120,
            button: 1,
            pressed: true,
        });
    assert!(timeline.drain(None).expect("stopped drain").is_empty());
    assert!(timeline.events.is_empty());
}

#[test]
fn finalize_orders_persistent_events_and_reports_output_obstructions() {
    let temporary = tempfile::tempdir().expect("test directory");
    let (mut timeline, _) = timeline_fixture(temporary.path().join("input"));
    timeline.events.extend([
        InputEvent::MouseButton {
            session_ns: 20,
            button: 1,
            pressed: true,
        },
        InputEvent::MouseButton {
            session_ns: 10,
            button: 1,
            pressed: false,
        },
    ]);
    timeline.finalize().expect("write input sidecar");
    let bytes = std::fs::read(temporary.path().join("input/input.json")).expect("sidecar");
    let sidecar: InputEventSidecar = serde_json::from_slice(&bytes).expect("valid sidecar");
    assert_eq!(
        sidecar
            .events
            .iter()
            .map(InputEvent::session_ns)
            .collect::<Vec<_>>(),
        [10, 20]
    );

    let blocked = temporary.path().join("blocked");
    std::fs::write(&blocked, b"not a directory").expect("obstruction");
    let (mut blocked_timeline, _) = timeline_fixture(blocked);
    assert!(matches!(
        blocked_timeline.finalize(),
        Err(CaptureError::Storage { .. })
    ));
}

#[test]
fn disabled_interaction_categories_are_neither_returned_nor_persisted() {
    for (clicks, shortcuts) in [(false, false), (true, false), (false, true)] {
        let (mut timeline, queue) = timeline_fixture(PathBuf::new());
        timeline.capture_clicks = clicks;
        timeline.capture_shortcuts = shortcuts;
        timeline.anchor = Some((100, 0));
        queue.lock().expect("queue").events.extend([
            NativeInputEvent::MouseButton {
                monotonic_ns: 101,
                button: 1,
                pressed: true,
            },
            NativeInputEvent::Shortcut {
                monotonic_ns: 102,
                pressed: true,
                modifiers: vec![],
                key: InputKey::Escape,
            },
        ]);
        assert_eq!(
            timeline.drain(Some(1)).expect("drain").len(),
            usize::from(clicks) + usize::from(shortcuts)
        );
        assert_eq!(
            timeline.events.len(),
            usize::from(clicks) + usize::from(shortcuts)
        );
    }
}
