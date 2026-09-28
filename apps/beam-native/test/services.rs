use super::*;
use serde_json::json;
use std::{sync::mpsc, time::Duration};

#[test]
fn typed_reply_envelopes_preserve_the_host_contract() {
    for (outcome, expected) in [
        (ServiceOutcome::Ok(json!(2)), "ok"),
        (ServiceOutcome::Cancelled, "cancelled"),
        (ServiceOutcome::Event(json!({"type":"example"})), "event"),
        (ServiceOutcome::Error("failure".into()), "error"),
        (ServiceOutcome::Unsupported("absent".into()), "unsupported"),
    ] {
        let value = ServiceResponse {
            session: 1,
            window: "main".into(),
            request_id: 3,
            outcome,
        }
        .json();
        assert_eq!(value["status"], expected);
        assert_eq!(value["window"], "main");
        assert_eq!(value["requestId"], 3);
    }
}

#[test]
fn native_events_reach_only_the_matching_live_window_session() {
    let registry = ServiceRegistry::new();
    let (picker, picker_events) = mpsc::channel();
    let (settings, settings_events) = mpsc::channel();
    registry.register_session(5, "windowPicker", picker);
    registry.register_session(6, "settings", settings);
    let event = ServiceResponse {
        session: u32::MAX,
        window: "windowPicker".into(),
        request_id: 0,
        outcome: ServiceOutcome::Event(json!({"type":"windowPickerOpened"})),
    };
    registry.route_event(&event);
    assert_eq!(
        picker_events
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .session,
        5
    );
    assert!(settings_events.try_recv().is_err());
    registry.cancel_session(5);
    registry.route_event(&event);
    assert!(picker_events.try_recv().is_err());
}

#[path = "services/events.rs"]
mod events;

#[test]
fn malformed_requests_never_start_the_handler() {
    let registry = Arc::new(ServiceRegistry::new());
    registry.register("example", "run", |_| {
        panic!("invalid request started a worker")
    });
    let (sender, _received) = mpsc::channel();
    for request in [
        "{bad".to_owned(),
        json!({"requestId":0,"window":"main","service":"example","method":"run"}).to_string(),
        json!({"requestId":1,"window":"main","service":3,"method":"run"}).to_string(),
        json!({"requestId":1,"window":"","service":"example","method":"run"}).to_string(),
    ] {
        assert!(registry.submit(1, &request, sender.clone()).is_err());
    }
    assert!(!registry.has_pending(1));
}

#[test]
fn cancelled_requests_cannot_deliver_after_their_session_closes() {
    let registry = Arc::new(ServiceRegistry::new());
    let (started, start_signal) = mpsc::channel();
    let (release, release_signal) = mpsc::channel();
    let wait = Mutex::new(release_signal);
    registry.register("example", "run", move |_| {
        started.send(()).unwrap();
        wait.lock()
            .unwrap()
            .recv_timeout(Duration::from_secs(2))
            .unwrap();
        ServiceOutcome::Ok(Value::Null)
    });
    let (reply, response) = mpsc::channel();
    registry
        .submit(
            1,
            &json!({"requestId":1,"window":"main","service":"example","method":"run"}).to_string(),
            reply,
        )
        .unwrap();
    start_signal.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(registry.has_pending(1));
    registry.cancel_session(1);
    assert!(!registry.has_pending(1));
    release.send(()).unwrap();
    assert!(response.recv_timeout(Duration::from_secs(2)).is_err());
}
