#![allow(clippy::expect_used)]

use beam_media_manifest::{
    SegmentId, SegmentMetadata, TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics,
    TrackStatus,
};

#[test]
fn track_formats_and_statuses_keep_v2_tags() {
    let track = TrackMetadata {
        track_id: TrackId::new(),
        kind: TrackKind::SystemAudio,
        source_id: None,
        format: TrackFormat::Audio {
            sample_format: "f32".into(),
            sample_rate: 48_000,
            channels: 2,
        },
        segments: vec![SegmentMetadata {
            segment_id: SegmentId::new(),
            path: "system-audio.wav".into(),
            start_ns: 0,
            end_ns: Some(1_000_000_000),
            complete: true,
        }],
        metrics: TrackMetrics::default(),
        status: TrackStatus::Completed,
        termination_reason: None,
    };
    let json = serde_json::to_value(&track).expect("serialize");
    assert_eq!(json["kind"], "system-audio");
    assert_eq!(json["format"]["mediaType"], "audio");
    assert_eq!(json["format"]["sampleRate"], 48_000);
    assert_eq!(json["status"], "completed");
    assert_eq!(
        serde_json::from_value::<TrackMetadata>(json).expect("deserialize"),
        track
    );
}

#[test]
fn older_track_metrics_default_new_observability_fields() {
    let metrics: TrackMetrics =
        serde_json::from_str(r#"{"framesReceived":7}"#).expect("old metrics");
    assert_eq!(metrics.frames_received, 7);
    assert_eq!(metrics.frames_acquired, 0);
    assert_eq!(metrics.samples_dropped, 0);
}
