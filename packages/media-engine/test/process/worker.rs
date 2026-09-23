#![cfg(test)]
#![allow(clippy::unwrap_used)]
use crate::{
    RecordingController, backend::backend_checks::fixtures, process::handle, protocol::Request,
};
use serde_json::{Value, json};
fn send(controller: &RecordingController, command: Value) -> crate::protocol::Response {
    handle(
        controller,
        serde_json::from_value::<Request>(json!({"version":1,"id":"client","command":command}))
            .unwrap(),
    )
}
#[test]
fn process_drives_exclusive_session_lifecycle_without_a_ui() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::with_prepare(root.path(), fixtures::prepare).unwrap();
    let prepared = send(
        &controller,
        json!({"type":"prepare","config":{
            "projectId":crate::ProjectId::new(),"screen":null,
            "camera":{"mode":"default","width":640,"height":480,"fps":30},
            "microphone":{"mode":"device","deviceId":"fake"},"systemAudio":{"mode":"default"}
        }}),
    );
    assert!(prepared.ok);
    let id = prepared.result.unwrap()["sessionId"].clone();
    for (command, state) in [
        ("start", "recording"),
        ("pause", "paused"),
        ("resume", "recording"),
    ] {
        let response = send(&controller, json!({"type":command,"sessionId":id}));
        assert!(response.ok);
        assert_eq!(response.result.unwrap()["state"], state);
    }
    for command in ["camera-preview", "screen-preview", "levels"] {
        assert!(send(&controller, json!({"type":command,"sessionId":id})).ok);
    }
    assert!(
        send(&controller, json!({"type":"events","afterSequence":0}))
            .result
            .unwrap()["events"]
            .as_array()
            .unwrap()
            .len()
            >= 4
    );
    assert_eq!(
        send(&controller, json!({"type":"stop","sessionId":id}))
            .result
            .unwrap()["state"],
        "completed"
    );
    assert!(!send(&controller, json!({"type":"cancel","sessionId":id})).ok);
}
#[test]
fn process_preserves_validation_errors_without_touching_devices() {
    let root = tempfile::tempdir().unwrap();
    let controller = RecordingController::with_prepare(root.path(), fixtures::prepare).unwrap();
    for command in [
        "start",
        "pause",
        "resume",
        "stop",
        "cancel",
        "camera-preview",
        "levels",
    ] {
        let response = send(
            &controller,
            json!({"type":command,"sessionId":crate::SessionId::new()}),
        );
        assert!(!response.ok);
        assert_eq!(response.request_id, "client");
    }
    assert!(
        !send(
            &controller,
            json!({"type":"source-preview","sourceId":"","width":32,"height":32})
        )
        .ok
    );
    assert!(!send(&controller,json!({"type":"screenshot","config":{
        "projectId":crate::ProjectId::new(),"screen":{"mode":"portal","kind":"monitor","restoreToken":null},
        "region":{"x":0.0,"y":0.0,"width":0.0,"height":1.0}
    }})).ok);
    #[cfg(not(target_os = "macos"))]
    assert!(send(&controller, json!({"type":"permissions"})).ok);
    #[cfg(target_os = "linux")]
    {
        assert!(send(&controller, json!({"type":"input-access"})).ok);
        assert!(!send(&controller, json!({"type":"resolve-display","x":0,"y":0})).ok);
    }
}
