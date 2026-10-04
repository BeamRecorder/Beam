#![allow(clippy::expect_used)]
use super::*;

#[test]
fn heartbeat_is_a_control_message_not_a_recorded_event() {
    let line =
        serde_json::to_string(&InputHelperHeartbeat::Heartbeat).expect("serialize heartbeat");
    assert_eq!(line, r#"{"event":"heartbeat"}"#);
    assert!(matches!(
        serde_json::from_str::<InputHelperMessage>(&line).expect("read heartbeat"),
        InputHelperMessage::Heartbeat(_)
    ));
    assert!(serde_json::from_str::<NativeInputEvent>(&line).is_err());
}

#[test]
fn real_mouse_events_remain_typed_recorded_events() {
    let event = NativeInputEvent::MouseButton {
        monotonic_ns: 500,
        button: 1,
        pressed: true,
    };
    let line = serde_json::to_string(&event).expect("serialize button");
    assert_eq!(
        serde_json::from_str::<InputHelperMessage>(&line).expect("read button"),
        InputHelperMessage::Event(event)
    );
}

#[test]
fn malformed_and_unknown_messages_cannot_refresh_stream_liveness() {
    for line in [
        "not-json",
        r#"{"event":"mouse-button"}"#,
        r#"{"event":"unknown"}"#,
        r#"{"ready":true}"#,
    ] {
        assert!(
            serde_json::from_str::<InputHelperMessage>(line).is_err(),
            "{line}"
        );
    }
}
