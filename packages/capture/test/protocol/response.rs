#![allow(clippy::expect_used)]

use capture::protocol::ResponseEnvelope;

#[test]
fn success_and_failure_responses_omit_the_opposite_payload() {
    let success = serde_json::to_value(ResponseEnvelope::success(
        "request-1",
        serde_json::json!({"ready": true}),
    ))
    .expect("success JSON");
    assert_eq!(success["requestId"], "request-1");
    assert_eq!(success["result"]["ready"], true);
    assert!(success.get("error").is_none());

    let failure = serde_json::to_value(ResponseEnvelope::failure(
        "request-2",
        "device-unavailable",
        "camera disconnected",
    ))
    .expect("failure JSON");
    assert_eq!(failure["ok"], false);
    assert!(failure.get("result").is_none());
    assert_eq!(failure["error"]["code"], "device-unavailable");
}
