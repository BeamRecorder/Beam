use beam_screen::screen::ScreenCaptureMetrics;

#[test]
fn new_screen_metrics_report_zero_counts_and_no_native_pts() {
    let metrics = ScreenCaptureMetrics::default();
    let snapshot = metrics.snapshot();
    assert_eq!(snapshot.frames_received, 0);
    assert_eq!(snapshot.frames_dropped, 0);
    assert_eq!(snapshot.cursor_samples, 0);
    assert_eq!(snapshot.format_changes, 0);
    assert_eq!(metrics.last_native_pts_ns(), None);
}

#[test]
fn screen_metrics_default_snapshot_is_stable_across_shared_references() {
    use std::sync::Arc;
    let metrics = Arc::new(ScreenCaptureMetrics::default());
    let clone = metrics.clone();
    assert!(Arc::ptr_eq(&metrics, &clone));
    assert_eq!(metrics.snapshot(), clone.snapshot());
    assert_eq!(
        format!("{:?}", metrics.snapshot()),
        "ScreenCaptureMetricsSnapshot { frames_received: 0, frames_dropped: 0, cursor_samples: 0, format_changes: 0 }"
    );
}
