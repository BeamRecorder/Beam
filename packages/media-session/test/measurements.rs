#![allow(clippy::expect_used)]

use beam_media_session::{
    MeasurementPoint, PreviewMeasurements, ProbeLoopMeasurements, ProcessSample,
    SessionMeasurements, TrackMeasurements,
};

#[test]
fn older_sessions_without_probe_loop_metrics_remain_readable() {
    let measurements: SessionMeasurements =
        serde_json::from_str(r#"{"processSamples":[]}"#).expect("older measurements");
    assert_eq!(measurements.probe_loop, ProbeLoopMeasurements::default());
}

#[test]
fn probe_loop_counters_saturate_and_keep_the_worst_duration() {
    let mut loop_metrics = ProbeLoopMeasurements {
        polls: u64::MAX,
        resource_samples: u64::MAX,
        ..Default::default()
    };
    loop_metrics.record_poll(25);
    loop_metrics.record_poll(10);
    loop_metrics.record_resource_sample(100);
    loop_metrics.record_resource_sample(50);
    assert_eq!(loop_metrics.polls, u64::MAX);
    assert_eq!(loop_metrics.poll_max_duration_ns, 25);
    assert_eq!(loop_metrics.resource_samples, u64::MAX);
    assert_eq!(loop_metrics.resource_sample_max_duration_ns, 100);
}

#[test]
fn older_process_samples_leave_live_preview_count_unknown() {
    let sample: ProcessSample = serde_json::from_str(
        r#"{"sessionNs":1,"processCount":1,"rssBytes":4096,"cpuPercentX100":120,"gpuMemoryBytes":null}"#,
    )
    .expect("older process sample");
    assert_eq!(sample.preview_frames_uploaded, None);
}

#[test]
fn measurement_drift_requires_two_native_anchors() {
    let mut track = TrackMeasurements::default();
    track.record(MeasurementPoint {
        session_ns: 0,
        native_ns: None,
        sample_position: Some(0),
    });
    assert_eq!(track.drift_ppm(), None);
    track.record(MeasurementPoint {
        session_ns: 1_000_000_000,
        native_ns: Some(1_000_100_000),
        sample_position: Some(48_000),
    });
    assert_eq!(track.drift_ppm(), None);
}

#[test]
fn native_timestamps_starting_after_the_first_packet_can_measure_drift() {
    let mut track = TrackMeasurements::default();
    track.record(MeasurementPoint {
        session_ns: 0,
        native_ns: None,
        sample_position: Some(0),
    });
    track.record(MeasurementPoint {
        session_ns: 100_000_000,
        native_ns: Some(5_000_000_000),
        sample_position: Some(4_800),
    });
    track.record(MeasurementPoint {
        session_ns: 1_100_000_000,
        native_ns: Some(6_000_100_000),
        sample_position: Some(52_800),
    });
    assert_eq!(track.points.len(), 3);
    assert!((track.drift_ppm().expect("native drift") - 100.0).abs() < 0.001);
}

#[test]
fn losing_native_timestamps_invalidates_drift_without_losing_raw_points() {
    let mut track = TrackMeasurements::default();
    for (session_ns, native_ns) in [
        (0, Some(1_000_000_000)),
        (1_000_000_000, Some(2_000_000_000)),
        (1_100_000_000, None),
        (2_100_000_000, Some(3_100_000_000)),
    ] {
        track.record(MeasurementPoint {
            session_ns,
            native_ns,
            sample_position: None,
        });
    }
    assert!(track.native_clock_discontinuous);
    assert_eq!(track.drift_ppm(), None);
    assert_eq!(track.points.len(), 4);
}

#[test]
fn older_measurements_default_to_no_native_clock_discontinuity() {
    let track: TrackMeasurements =
        serde_json::from_str(r#"{"points":[],"dropped":0}"#).expect("older track measurements");
    assert!(!track.native_clock_discontinuous);
}

#[test]
fn older_measurements_with_a_saved_native_gap_suppress_drift() {
    let track: TrackMeasurements = serde_json::from_str(
        r#"{"points":[{"sessionNs":0,"nativeNs":100},{"sessionNs":1000000000,"nativeNs":1000000100},{"sessionNs":1100000000}],"dropped":0}"#,
    )
    .expect("older timing points");
    assert!(!track.native_clock_discontinuous);
    assert!(track.has_native_clock_discontinuity());
    assert_eq!(track.drift_ppm(), None);
}

#[test]
fn high_rate_measurements_keep_one_anchor_per_second() {
    let mut track = TrackMeasurements::default();
    for tick in 0..1_200_u64 {
        track.record(MeasurementPoint {
            session_ns: tick * 10_000_000,
            native_ns: Some(tick * 10_000_000),
            sample_position: Some(tick * 480),
        });
    }
    assert_eq!(track.points.len(), 12);
    assert_eq!(track.points.first().expect("first").session_ns, 0);
    assert_eq!(
        track.points.last().expect("last").session_ns,
        11_000_000_000
    );
}

#[test]
fn measurement_at_exact_one_second_boundary_is_retained() {
    let mut track = TrackMeasurements::default();
    for session_ns in [0, 999_999_999, 1_000_000_000, 1_999_999_999, 2_000_000_000] {
        track.record(MeasurementPoint {
            session_ns,
            native_ns: Some(session_ns),
            sample_position: None,
        });
    }
    let anchors: Vec<_> = track.points.iter().map(|point| point.session_ns).collect();
    assert_eq!(anchors, [0, 1_000_000_000, 2_000_000_000]);
}

#[test]
fn regressing_measurement_does_not_replace_the_latest_anchor() {
    let mut track = TrackMeasurements::default();
    for session_ns in [1_000_000_000, 500_000_000, 2_000_000_000] {
        track.record(MeasurementPoint {
            session_ns,
            native_ns: Some(session_ns),
            sample_position: None,
        });
    }
    let anchors: Vec<_> = track.points.iter().map(|point| point.session_ns).collect();
    assert_eq!(anchors, [1_000_000_000, 2_000_000_000]);
}

#[test]
fn regressing_measurement_cannot_create_a_native_timestamp_transition() {
    let mut track = TrackMeasurements::default();
    track.record(MeasurementPoint {
        session_ns: 1_000_000_000,
        native_ns: None,
        sample_position: None,
    });
    track.record(MeasurementPoint {
        session_ns: 900_000_000,
        native_ns: Some(2_000_000_000),
        sample_position: None,
    });
    assert_eq!(track.points.len(), 1);
    assert!(!track.native_clock_discontinuous);
}

#[test]
fn queue_peaks_keep_the_highest_observation_and_read_older_measurements() {
    let mut track: TrackMeasurements =
        serde_json::from_str(r#"{"points":[],"dropped":0}"#).expect("older measurements");
    track.queue_peaks.observe_source(4, 4096);
    track.queue_peaks.observe_source(2, 8192);
    track.queue_peaks.observe_encoder(3, 1024);
    track.queue_peaks.observe_encoder(5, 512);
    assert_eq!(track.queue_peaks.source_packets, 4);
    assert_eq!(track.queue_peaks.source_bytes, 8192);
    assert_eq!(track.queue_peaks.encoder_packets, 5);
    assert_eq!(track.queue_peaks.encoder_bytes, 1024);
}

#[test]
fn older_preview_measurements_keep_zero_capacity_defaults() {
    let preview: PreviewMeasurements =
        serde_json::from_str(r#"{"framesUploaded":2,"textureRecreations":1,"bytesUploaded":4096}"#)
            .expect("older preview measurements");
    assert_eq!(preview.frames_uploaded, 2);
    assert_eq!(preview.synthetic_delay_ms, 0);
    assert_eq!(preview.cpu_buffer_reallocations, 0);
    assert_eq!(preview.cpu_buffer_growth_bytes, 0);
    assert_eq!(preview.cpu_color_conversion_bytes, 0);
    assert_eq!(preview.cpu_padding_copy_count, 0);
    assert_eq!(preview.cpu_padding_copy_bytes, 0);
    assert_eq!(preview.rgba_capacity_bytes, 0);
    assert_eq!(preview.staging_capacity_bytes, 0);
}

#[test]
fn preview_submission_latency_requires_a_real_sample() {
    let preview = PreviewMeasurements::default();
    assert_eq!(preview.mean_submission_latency_ns(), None);
    assert_eq!(preview.submission_latency_samples, 0);
}

#[test]
fn preview_submission_latency_reports_mean_and_max() {
    let mut preview = PreviewMeasurements::default();
    for latency_ns in [10, 30, 20] {
        preview.record_submission_latency(latency_ns);
    }
    assert_eq!(preview.submission_latency_samples, 3);
    assert_eq!(preview.mean_submission_latency_ns(), Some(20));
    assert_eq!(preview.submission_latency_max_ns, 30);
}

#[test]
fn preview_submission_latency_saturates_instead_of_overflowing() {
    let mut preview = PreviewMeasurements::default();
    preview.record_submission_latency(u64::MAX);
    preview.record_submission_latency(10);
    assert_eq!(preview.submission_latency_sum_ns, u64::MAX);
    assert_eq!(preview.submission_latency_max_ns, u64::MAX);
    assert_eq!(preview.submission_latency_samples, 2);
}
