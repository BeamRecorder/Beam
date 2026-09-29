use std::{
    sync::{Arc, mpsc},
    time::Duration,
};

use serde_json::{Value, json};

use super::*;

fn request(
    registry: &Arc<ServiceRegistry>,
    id: u64,
    window: &str,
    method: &str,
    payload: Value,
) -> Value {
    let (sender, response) = mpsc::channel();
    registry
        .submit(
            1,
            &json!({
                "requestId": id, "window": window, "service": "beamUi",
                "method": method, "payload": payload,
            })
            .to_string(),
            sender,
        )
        .expect("valid request");
    response
        .recv_timeout(Duration::from_secs(2))
        .expect("response")
        .json()
}

#[test]
fn auxiliary_state_and_actions_reach_the_hud_without_changing_window_identity() {
    let registry = Arc::new(ServiceRegistry::new());
    let (events, received) = mpsc::channel();
    register_ui_state_services(&registry, events);

    assert_eq!(
        request(
            &registry,
            1,
            "main",
            "update",
            json!({ "remaining": 2, "paused": true, "shortcut": "Ctrl+Shift+R", "pauseShortcut": "Alt+P" })
        )["status"],
        "ok"
    );
    for window in ["region", "countdown", "recorder"] {
        let event = received.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(event.window, window);
        assert_eq!(event.json()["value"]["type"], "beamUiState");
    }
    let state = request(&registry, 2, "recorder", "state", Value::Null);
    assert_eq!(state["value"]["remaining"], 2);
    assert_eq!(state["value"]["paused"], true);
    assert_eq!(state["value"]["shortcut"], "Ctrl+Shift+R");
    assert_eq!(state["value"]["pauseShortcut"], "Alt+P");

    let region = json!({ "x": 0.1, "y": 0.15, "width": 0.3, "height": 0.2 });
    assert_eq!(
        request(
            &registry,
            3,
            "region",
            "emit",
            json!({ "action": "regionSelected", "region": region })
        )["status"],
        "ok"
    );
    let event = received
        .recv_timeout(Duration::from_secs(2))
        .expect("HUD event");
    assert_eq!(event.window, "main");
    assert_eq!(event.json()["value"]["action"], "regionSelected");
    assert_eq!(event.json()["value"]["region"], region);

    assert_eq!(
        request(
            &registry,
            4,
            "region",
            "emit",
            json!({ "action": "regionSelected", "region": { "x": -1, "y": 0, "width": 20, "height": 20 } })
        )["status"],
        "error"
    );
    assert_eq!(
        request(&registry, 5, "main", "update", json!({ "remaining": 31 }))["status"],
        "error"
    );
}

#[test]
fn presentation_patches_reject_unknown_keys_and_fractional_revisions() {
    let registry = Arc::new(ServiceRegistry::new());
    let (events, _received) = mpsc::channel();
    register_ui_state_services(&registry, events);
    for (index, patch) in [
        json!({"remaining": -1}),
        json!({"regionRevision": 0.5}),
        json!({"busy": "true"}),
        json!({"unknown":true}),
        json!({"pauseShortcut": "P".repeat(81)}),
    ]
    .into_iter()
    .enumerate()
    {
        assert_eq!(
            request(&registry, index as u64 + 1, "main", "update", patch)["status"],
            "error"
        );
    }
    assert_eq!(
        request(&registry, 10, "main", "state", Value::Null)["value"]["regionRevision"],
        0
    );
}
