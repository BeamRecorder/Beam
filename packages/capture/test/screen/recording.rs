use capture::screen::ScreenCaptureMetrics;

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

#[cfg(target_os = "linux")]
#[test]
fn shared_screen_recording_dispatch_rejects_unsupported_source_without_hardware()
-> Result<(), Box<dyn std::error::Error>> {
    use capture::{
        model::{CursorSelection, RecordingSettings, ScreenSelection, SourceId},
        screen::{ScreenConsumer, ScreenOpenRequest, ScreenRecording},
        session::StartGate,
    };
    use std::sync::Arc;
    let selection = ScreenSelection::Source {
        source_id: SourceId::new("display:test")?,
    };
    let settings = RecordingSettings::default();
    let request = ScreenOpenRequest {
        selection: &selection,
        recording: &settings,
        region: None,
        cursor: CursorSelection::Disabled,
        excluded_window_handles: &[],
        start_ns: 0,
        start_gate: Arc::new(StartGate::new()),
        consumer: ScreenConsumer::EncodedFile {
            path: "unused.mp4".into(),
            cursor_directory: None,
        },
    };
    let error = ScreenRecording::open(request).err();
    assert_eq!(
        error.as_ref().map(capture::CaptureError::code),
        Some("unsupported-operation")
    );
    Ok(())
}
