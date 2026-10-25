use super::MacCursorMetrics;

#[test]
fn healthy_idle_mouse_capture_has_no_input_failure() {
    let metrics = MacCursorMetrics::new(super::super::MacCursorShapeSource::default());
    assert_eq!(metrics.failure_reason(), None);
    assert_eq!(metrics.events(), 0);
    assert_eq!(metrics.interruptions(), 0);
}

#[test]
fn listener_failures_retain_the_first_actionable_reason_once() {
    let metrics = MacCursorMetrics::new(super::super::MacCursorShapeSource::default());
    metrics.record_input_failure("mouse event listener disabled".into());
    metrics.record_input_failure("mouse event run loop stopped".into());
    assert_eq!(
        metrics.failure_reason().as_deref(),
        Some("mouse event listener disabled")
    );
    assert_eq!(metrics.interruptions(), 1);
}

#[test]
fn reading_the_failure_does_not_consume_the_recording_health_warning() {
    let metrics = MacCursorMetrics::new(super::super::MacCursorShapeSource::default());
    metrics.record_input_failure("mouse event queue overflowed".into());
    for _ in 0..3 {
        assert_eq!(
            metrics.failure_reason().as_deref(),
            Some("mouse event queue overflowed")
        );
    }
    assert_eq!(metrics.interruptions(), 1);
}
