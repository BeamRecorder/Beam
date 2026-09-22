#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn terminal_error_survives_a_saturated_regular_event_queue() {
    let (events, regular, terminal) = CameraEventQueue::new();
    for sequence in 0..64 {
        regular
            .try_send(CameraEvent::Dropped { sequence })
            .expect("fill regular queue");
    }
    assert!(
        regular
            .try_send(CameraEvent::Dropped { sequence: 64 })
            .is_err()
    );
    terminal
        .try_send(CameraEvent::Failed("device error".into()))
        .expect("terminal error");
    assert!(matches!(events.try_event(), Some(CameraEvent::Failed(_))));
    assert!(matches!(
        events.try_event(),
        Some(CameraEvent::Dropped { .. })
    ));
}

#[test]
fn disconnected_device_keeps_its_interrupted_classification() {
    assert!(matches!(
        terminal_camera_event(&CameraError::DeviceUnavailable("unplugged".into())),
        CameraEvent::Disconnected(_)
    ));
}

#[test]
fn backend_failure_keeps_its_failed_classification() {
    assert!(matches!(
        terminal_camera_event(&CameraError::Backend("invalid sample".into())),
        CameraEvent::Failed(_)
    ));
}

#[test]
fn drained_or_disconnected_queues_have_no_events() {
    let (events, regular, terminal) = CameraEventQueue::new();
    assert!(events.try_event().is_none());
    regular.try_send(CameraEvent::Started).expect("started");
    terminal
        .try_send(CameraEvent::Failed("failed".into()))
        .expect("failure");
    assert!(matches!(events.try_event(), Some(CameraEvent::Failed(_))));
    assert!(matches!(events.try_event(), Some(CameraEvent::Started)));
    drop(regular);
    drop(terminal);
    assert!(events.try_event().is_none());
}
