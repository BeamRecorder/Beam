#![allow(clippy::expect_used)]

use super::*;
use crate::{model::SegmentMetadata, storage::segment};

fn started() -> ScreenCaptureMetrics {
    let metrics = ScreenCaptureMetrics::default();
    begin(&metrics, (1920, 1080), 12_000_000, 60, 3);
    metrics
}

#[test]
fn records_configuration_without_claiming_hardware_success() {
    let metrics = started();
    let report = metrics.encoding().expect("encoding report");
    assert_eq!(report.backend, "windows-media-transcoder");
    assert_eq!((report.width, report.height, report.fps), (1920, 1080, 60));
    assert_eq!((report.bitrate_bps, report.queue_capacity), (12_000_000, 3));
    assert!(report.requested_mode.is_none());
    assert!(report.initialization_ms.is_none());
    assert!(report.finalization.is_none());
}

#[test]
fn retains_rejected_acceleration_and_successful_software_attempts() {
    let metrics = started();
    attempt(
        &metrics,
        "accelerated",
        Duration::from_millis(350),
        Some("0xC00D6D60"),
    );
    attempt(&metrics, "software", Duration::from_millis(170), None);
    initialized(&metrics, Duration::from_millis(550), None);
    let report = metrics.encoding().expect("report");
    assert_eq!(report.requested_mode.as_deref(), Some("software"));
    assert_eq!(report.attempts.len(), 2);
    assert_eq!(report.attempts[0].error.as_deref(), Some("0xC00D6D60"));
    assert_eq!(report.attempts[1].elapsed_ms, 170);
    assert_eq!(report.initialization_ms, Some(550));
    assert!(report.initialization_error.is_none());
}

#[test]
fn retains_initialization_failure_without_a_selected_encoder() {
    let metrics = started();
    attempt(
        &metrics,
        "accelerated",
        Duration::from_millis(500),
        Some("device lost"),
    );
    initialized(&metrics, Duration::from_millis(600), Some("device lost"));
    let report = metrics.encoding().expect("report");
    assert!(report.requested_mode.is_none());
    assert_eq!(report.initialization_error.as_deref(), Some("device lost"));
    assert!(report.finalization.is_none());
}

#[test]
fn initialization_file_errors_do_not_fabricate_encoder_attempts() {
    let metrics = started();
    initialized(&metrics, Duration::from_millis(1), Some("access denied"));
    assert!(metrics.encoding().expect("report").attempts.is_empty());
}

#[test]
fn successful_finalization_after_fifteen_seconds_retains_actual_elapsed_time() {
    let metrics = started();
    finalized(&metrics, Duration::from_millis(42_500), None);
    let result = metrics
        .encoding()
        .expect("report")
        .finalization
        .expect("finalization");
    assert!(result.success);
    assert_eq!(result.elapsed_ms, 42_500);
    assert_eq!(result.timeout_ms, 60_000);
    assert!(result.error.is_none());
    assert!(WINDOWS_STOP_TIMEOUT > WINDOWS_ENCODER_FINALIZATION_TIMEOUT);
}

#[test]
fn failed_and_timed_out_finalization_preserve_the_error() {
    for (elapsed, reason) in [
        (20, "storage failure"),
        (60, "encoder did not finish within 60 seconds"),
    ] {
        let metrics = started();
        finalized(&metrics, Duration::from_secs(elapsed), Some(reason));
        let result = metrics
            .encoding()
            .expect("report")
            .finalization
            .expect("finalization");
        assert!(!result.success);
        assert_eq!(result.error.as_deref(), Some(reason));
        assert_eq!(result.elapsed_ms, elapsed * 1000);
    }
}

#[test]
fn snapshots_are_owned_and_new_segments_reset_diagnostics() {
    let metrics = started();
    let mut snapshot = metrics.encoding().expect("report");
    snapshot.backend.clear();
    assert_eq!(
        metrics.encoding().expect("report").backend,
        "windows-media-transcoder"
    );
    finalized(&metrics, Duration::from_secs(1), None);
    begin(&metrics, (1280, 720), 4_000_000, 30, 2);
    assert!(
        metrics
            .encoding()
            .expect("new segment")
            .finalization
            .is_none()
    );
}

#[test]
fn missing_capture_diagnostics_remain_absent() {
    let metrics = ScreenCaptureMetrics::default();
    attempt(&metrics, "software", Duration::ZERO, None);
    initialized(&metrics, Duration::ZERO, None);
    finalized(&metrics, Duration::ZERO, None);
    assert!(metrics.encoding().is_none());
}

#[test]
fn segment_diagnostics_round_trip_and_old_manifests_omit_the_field() {
    let mut original = segment("screen/segment-0001.mp4".into(), 0);
    let old = serde_json::to_value(&original).expect("old segment");
    assert!(old.get("encoding").is_none());
    assert!(
        serde_json::from_value::<SegmentMetadata>(old)
            .expect("old recording")
            .encoding
            .is_none()
    );
    let metrics = started();
    finalized(&metrics, Duration::from_secs(16), None);
    original.encoding = metrics.encoding();
    let saved = serde_json::to_value(&original).expect("new segment");
    assert_eq!(saved["encoding"]["finalization"]["timeoutMs"], 60_000);
    assert_eq!(
        serde_json::from_value::<SegmentMetadata>(saved).expect("new recording"),
        original
    );
}
