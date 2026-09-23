#![cfg(test)]
#![allow(clippy::unwrap_used)]
use super::*;
use evdev::{AbsoluteAxisCode, EventType, RelativeAxisCode};
fn send(
    output: &mut impl Write,
    filter: &mut InputFilter,
    motion: &mut MotionAccumulator,
    kind: EventType,
    code: u16,
    value: i32,
) -> bool {
    write_event(
        output,
        filter,
        motion,
        InputEvent::new(kind.0, code, value),
        100,
    )
    .unwrap()
}
#[test]
fn motion_precedes_buttons_but_plain_text_is_never_written() {
    let mut output = Vec::new();
    let mut filter = InputFilter::default();
    let mut motion = MotionAccumulator::default();
    assert!(!send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::RELATIVE,
        RelativeAxisCode::REL_X.0,
        3
    ));
    assert!(send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::KEY,
        KeyCode::BTN_LEFT.0,
        1
    ));
    assert!(!send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::KEY,
        KeyCode::KEY_A.0,
        1
    ));
    let lines = String::from_utf8(output).unwrap();
    let events: Vec<serde_json::Value> = lines
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0]["event"], "mouse-motion");
    assert_eq!(events[0]["deltaX"], 3);
    assert_eq!(events[1]["event"], "mouse-button");
}
#[test]
fn sync_drops_and_touch_release_reset_pending_motion() {
    let mut output = Vec::new();
    let mut filter = InputFilter::default();
    let mut motion = MotionAccumulator::default();
    for x in [10, 15] {
        send(
            &mut output,
            &mut filter,
            &mut motion,
            EventType::ABSOLUTE,
            AbsoluteAxisCode::ABS_X.0,
            x,
        );
    }
    assert!(send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::SYNCHRONIZATION,
        SynchronizationCode::SYN_REPORT.0,
        0
    ));
    assert!(!send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::KEY,
        KeyCode::BTN_TOUCH.0,
        0
    ));
    send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::ABSOLUTE,
        AbsoluteAxisCode::ABS_X.0,
        200,
    );
    assert!(!send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::SYNCHRONIZATION,
        SynchronizationCode::SYN_REPORT.0,
        0
    ));
    send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::RELATIVE,
        RelativeAxisCode::REL_X.0,
        7,
    );
    send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::SYNCHRONIZATION,
        SynchronizationCode::SYN_DROPPED.0,
        0,
    );
    assert!(!send(
        &mut output,
        &mut filter,
        &mut motion,
        EventType::SYNCHRONIZATION,
        SynchronizationCode::SYN_REPORT.0,
        0
    ));
    assert!(
        !write_event(
            &mut output,
            &mut filter,
            &mut motion,
            InputEvent::new(0xffff, 0, 0),
            100
        )
        .unwrap()
    );
}
#[test]
fn closed_output_propagates_failure_for_motion_and_button_events() {
    for motion_first in [false, true] {
        let mut output = std::io::Cursor::new([0u8; 0]);
        let mut filter = InputFilter::default();
        let mut motion = MotionAccumulator::default();
        if motion_first {
            motion.push(RelativeAxisCode::REL_X, 2);
        }
        assert!(
            write_event(
                &mut output,
                &mut filter,
                &mut motion,
                InputEvent::new(EventType::KEY.0, KeyCode::BTN_LEFT.0, 1),
                100
            )
            .is_err()
        );
    }
}
