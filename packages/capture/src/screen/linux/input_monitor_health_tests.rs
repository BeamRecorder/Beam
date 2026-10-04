#![allow(clippy::expect_used)]
use super::*;
use std::time::Duration;

#[test]
fn idle_broker_with_a_recent_heartbeat_is_available_without_events() {
    let broker = LinuxInputBroker::default();
    broker.shared.ready.store(true, Ordering::Release);
    broker.shared.health.received(Instant::now());
    broker.shared.mouse_devices.store(1, Ordering::Release);
    broker.shared.keyboard_devices.store(1, Ordering::Release);
    assert_eq!(
        linux_input_access_status_from(&broker),
        InputAccessStatus::available(Some(1), Some(1))
    );
    assert!(
        broker
            .shared
            .subscribers
            .lock()
            .expect("subscribers")
            .is_empty()
    );
}

#[test]
fn an_open_but_silent_stream_reports_a_retryable_failure() {
    let broker = LinuxInputBroker::default();
    broker.shared.ready.store(true, Ordering::Release);
    broker.shared.health.received(
        Instant::now()
            .checked_sub(Duration::from_secs(4))
            .expect("past instant"),
    );
    let status = linux_input_access_status_from(&broker);
    assert_eq!(status.state, crate::input::InputAccessState::Unavailable);
    assert!(status.can_request);
    assert!(!status.clicks);
    assert!(!status.shortcuts);
    assert!(
        status
            .error
            .expect("liveness error")
            .message
            .contains("no valid event or heartbeat")
    );
}

#[test]
fn live_broker_reports_missing_devices_instead_of_claiming_click_support() {
    let broker = LinuxInputBroker::default();
    broker.shared.health.received(Instant::now());
    broker.shared.keyboard_devices.store(1, Ordering::Release);
    let status = linux_input_access_status_from(&broker);
    assert!(!status.clicks);
    assert!(status.shortcuts);
    assert_eq!(status.mouse_devices, Some(0));
}
