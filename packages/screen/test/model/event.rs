#![allow(clippy::expect_used)]

use beam_screen::model::HealthEvent;

#[test]
fn warning_events_keep_the_v2_tag_and_timeline_timestamp() {
    let event = HealthEvent::Warning {
        session_ns: 123,
        message: "device changed".into(),
    };
    let json = serde_json::to_value(&event).expect("serialize");
    assert_eq!(json["event"], "warning");
    assert_eq!(json["sessionNs"], 123);
    assert_eq!(
        serde_json::from_value::<HealthEvent>(json).expect("deserialize"),
        event
    );
}
