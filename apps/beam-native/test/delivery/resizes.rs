use beam_native::{ServiceOutcome, ServiceResponse, coalesce_window_resizes};
use serde_json::{Value, json};

fn event(session: u32, window: &str, value: Value) -> ServiceResponse {
    ServiceResponse {
        session,
        window: window.into(),
        request_id: 0,
        outcome: ServiceOutcome::Event(value),
    }
}

fn resize(session: u32, window: &str, width: u32) -> ServiceResponse {
    event(
        session,
        window,
        json!({"type":"windowResized","physicalWidth":width,"physicalHeight":252}),
    )
}

#[test]
fn resize_bursts_keep_the_latest_size_for_the_same_scene() {
    let retained = coalesce_window_resizes(vec![
        resize(1, "main", 440),
        resize(1, "main", 500),
        resize(1, "main", 680),
    ]);
    assert_eq!(retained.len(), 1);
    assert_eq!(retained[0].json()["value"]["physicalWidth"], 680);
    assert!(coalesce_window_resizes(Vec::new()).is_empty());

    let retained = coalesce_window_resizes(vec![
        resize(1, "main", 440),
        resize(2, "main", 500),
        resize(2, "settings", 680),
    ]);
    assert_eq!(retained.len(), 3);
}

#[test]
fn dpi_visibility_and_service_replies_preserve_resize_order() {
    let retained = coalesce_window_resizes(vec![
        resize(1, "main", 440),
        event(1, "main", json!({"type":"windowResized","scaleFactor":2})),
        resize(1, "main", 500),
        event(
            1,
            "main",
            json!({"type":"windowVisibility","visible":false}),
        ),
        resize(1, "main", 540),
        ServiceResponse {
            session: 1,
            window: "main".into(),
            request_id: 9,
            outcome: ServiceOutcome::Ok(json!("saved")),
        },
        resize(1, "main", 680),
    ]);
    assert_eq!(retained.len(), 7);
    assert_eq!(retained[1].json()["value"]["scaleFactor"], 2);
    assert_eq!(retained[3].json()["value"]["visible"], false);
    assert_eq!(retained[5].json()["requestId"], 9);
    assert_eq!(retained[6].json()["value"]["physicalWidth"], 680);
}

#[test]
fn malformed_or_requested_resize_events_are_not_discarded() {
    for value in [
        json!({"type":"windowResized","physicalWidth":440}),
        json!({"type":"windowResized","physicalWidth":440,"physicalHeight":252,"scaleFactor":2}),
        json!({"type":"windowResized","physicalWidth":null,"physicalHeight":252}),
    ] {
        assert_eq!(
            coalesce_window_resizes(vec![event(1, "main", value), resize(1, "main", 680)]).len(),
            2
        );
    }
    let mut requested = resize(1, "main", 440);
    requested.request_id = 1;
    assert_eq!(
        coalesce_window_resizes(vec![requested, resize(1, "main", 680)]).len(),
        2
    );
}
