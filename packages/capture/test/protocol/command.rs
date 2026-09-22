#![allow(clippy::expect_used)]

use capture::protocol::{Command, RequestEnvelope};

#[test]
fn request_envelope_flattens_the_command_and_rejects_unknown_actions() {
    let request = RequestEnvelope {
        id: "request-1".into(),
        command: Command::ResolveDisplay { x: -50, y: 20 },
    };
    let json = serde_json::to_value(request).expect("serialize");
    assert_eq!(json["id"], "request-1");
    assert_eq!(json["command"], "resolve-display");
    assert_eq!(json["x"], -50);
    assert!(
        serde_json::from_value::<RequestEnvelope>(serde_json::json!({
            "id": "request-2", "command": "unsupported"
        }))
        .is_err()
    );
}
