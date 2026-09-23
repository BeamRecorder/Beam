#![cfg(test)]

use super::CursorCaptureMetrics;
use std::sync::atomic::Ordering;

#[test]
fn windows_cursor_metrics_count_events_and_interruptions_separately() {
    let metrics = CursorCaptureMetrics::default();
    metrics.events.fetch_add(3, Ordering::Relaxed);
    metrics.interruptions.fetch_add(1, Ordering::Relaxed);
    assert_eq!(metrics.events(), 3);
    assert_eq!(metrics.interruptions(), 1);
}
