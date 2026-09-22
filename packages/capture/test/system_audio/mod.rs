#![cfg(test)]

#[cfg(target_os = "linux")]
use super::SystemAudioRecording;
use super::{SystemAudioFormat, SystemAudioMetrics, SystemAudioOpenRequest, SystemAudioSegment};
use crate::{model::SystemAudioSelection, session::StartGate};
use std::{path::PathBuf, sync::Arc};

#[test]
fn system_audio_metrics_accumulate_samples_and_reset_peak_after_read() {
    let metrics = SystemAudioMetrics::default();
    #[cfg(target_os = "linux")]
    {
        metrics.received(512);
        metrics.dropped(128);
        metrics.peak(0.4);
        metrics.peak(0.8);
        metrics.peak(0.2);
    }
    #[cfg(target_os = "linux")]
    {
        assert_eq!(metrics.samples_received(), 512);
        assert_eq!(metrics.samples_dropped(), 128);
        assert_eq!(metrics.take_peak(), 0.8);
    }
    #[cfg(not(target_os = "linux"))]
    assert_eq!(metrics.take_peak(), 0.0);
    assert_eq!(metrics.take_peak(), 0.0);
}

#[test]
fn system_audio_format_and_segment_preserve_capture_metadata() {
    let format = SystemAudioFormat {
        sample_rate: 48_000,
        channels: 2,
    };
    assert_eq!(format, format);
    assert_ne!(
        format,
        SystemAudioFormat {
            sample_rate: 44_100,
            channels: 2
        }
    );
    let gate = Arc::new(StartGate::new());
    let request = SystemAudioOpenRequest {
        selection: SystemAudioSelection::DefaultOutput,
        segment: SystemAudioSegment {
            path: PathBuf::from("segment.wav"),
            start_ns: 123,
        },
        start_gate: gate.clone(),
        queue_capacity: 4,
    };
    assert_eq!(request.segment.path, PathBuf::from("segment.wav"));
    assert_eq!(request.segment.start_ns, 123);
    assert!(Arc::ptr_eq(&request.start_gate, &gate));
}

#[cfg(target_os = "linux")]
#[test]
fn zero_capacity_recording_is_rejected_before_pipewire_startup() {
    for start_ns in [0, u64::MAX] {
        let request = SystemAudioOpenRequest {
            selection: SystemAudioSelection::DefaultOutput,
            segment: SystemAudioSegment {
                path: PathBuf::from("unused.wav"),
                start_ns,
            },
            start_gate: Arc::new(StartGate::new()),
            queue_capacity: 0,
        };
        let error = SystemAudioRecording::open(request).err();
        assert_eq!(
            error.as_ref().map(crate::CaptureError::code),
            Some("invalid-configuration")
        );
        assert!(
            error
                .as_ref()
                .is_some_and(|error| error.to_string().contains("queue capacity"))
        );
    }
}

#[cfg(target_os = "linux")]
#[test]
fn peak_meter_clamps_out_of_range_values_and_resets_between_reads() {
    let metrics = SystemAudioMetrics::default();
    metrics.peak(-0.5);
    assert_eq!(metrics.take_peak(), 0.0);
    metrics.peak(1.5);
    metrics.peak(0.5);
    assert_eq!(metrics.take_peak(), 1.0);
    metrics.peak(0.125);
    assert_eq!(metrics.take_peak(), 0.125);
    assert_eq!(metrics.take_peak(), 0.0);
}

#[cfg(target_os = "linux")]
#[test]
fn audio_metrics_accumulate_independently_of_peak_meter() {
    let metrics = SystemAudioMetrics::default();
    metrics.received(10);
    metrics.dropped(2);
    metrics.received(4);
    metrics.dropped(3);
    metrics.peak(0.25);
    assert_eq!(
        (metrics.samples_received(), metrics.samples_dropped()),
        (14, 5)
    );
    assert_eq!(metrics.take_peak(), 0.25);
    assert_eq!(
        (metrics.samples_received(), metrics.samples_dropped()),
        (14, 5)
    );
}
