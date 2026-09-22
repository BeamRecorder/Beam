#![cfg(test)]

#[test]
fn windows_cursor_facade_exposes_recording_metrics() {
    let metrics = super::CursorCaptureMetrics::default();
    assert_eq!(metrics.events(), 0);
    assert_eq!(metrics.interruptions(), 0);
}
