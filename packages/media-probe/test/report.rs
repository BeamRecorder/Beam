#![allow(clippy::expect_used)]

use std::process::Command;

use beam_media_manifest::{
    PermissionSnapshot, PlatformMetadata, ProjectId, SCHEMA_VERSION, SegmentId, SegmentMetadata,
    SelectedSources, SessionId, SessionManifest, TrackFormat, TrackId, TrackKind, TrackMetadata,
    TrackMetrics, TrackStatus,
};
use beam_media_session::{PreviewMeasurements, ProcessSample, SessionMeasurements};

#[test]
fn report_rejects_record_only_flags_before_reading_files() {
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args(["report", "--duration", "1"])
        .output()
        .expect("report arguments");
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("--output"));
}

#[test]
fn saved_measurements_report_real_cpu_rss_and_gpu_peaks() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path();
    let manifest = SessionManifest {
        schema_version: SCHEMA_VERSION,
        project_id: ProjectId::new(),
        session_id: SessionId::new(),
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        session_start_monotonic_ns: 0,
        duration_ns: 2_000_000_000,
        platform: PlatformMetadata {
            os: "linux".into(),
            architecture: "x86_64".into(),
            backend: "test".into(),
        },
        selected_sources: SelectedSources {
            screen: None,
            system_audio: None,
            microphone: None,
            camera: None,
        },
        tracks: Vec::new(),
        permissions: PermissionSnapshot::default(),
        warnings: Vec::new(),
        completed: false,
    };
    let mut measurements = SessionMeasurements {
        process_samples: vec![
            ProcessSample {
                session_ns: 1,
                process_count: 1,
                rss_bytes: 20,
                cpu_percent_x100: 150,
                gpu_memory_bytes: None,
                preview_frames_uploaded: None,
            },
            ProcessSample {
                session_ns: 2,
                process_count: 1,
                rss_bytes: 30,
                cpu_percent_x100: 100,
                gpu_memory_bytes: Some(4096),
                preview_frames_uploaded: Some(12),
            },
        ],
        ..Default::default()
    };
    measurements.camera.native_clock_discontinuous = true;
    std::fs::write(
        output.join("manifest.json"),
        serde_json::to_vec(&manifest).expect("manifest JSON"),
    )
    .expect("manifest file");
    std::fs::write(
        output.join("measurements.json"),
        serde_json::to_vec(&measurements).expect("measurements JSON"),
    )
    .expect("measurements file");
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args(["report", "--output", output.to_str().expect("path")])
        .output()
        .expect("report");
    assert!(result.status.success());
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).expect("report JSON");
    assert_eq!(report["peakRssBytes"], 30);
    assert_eq!(report["peakCpuPercentX100"], 150);
    assert_eq!(report["peakGpuMemoryBytes"], 4096);
    assert_eq!(report["cameraNativeClockDiscontinuous"], true);
    assert!(report["cameraDriftPpm"].is_null());
    assert_eq!(report["probeLoop"]["polls"], 0);
    assert!(report["cameraEncodedFps"].is_null());
}

#[test]
fn report_joins_three_track_files_and_preview_metrics_without_guessing_missing_media() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let output = temporary.path();
    let track = |kind, path: &str, metrics: TrackMetrics| TrackMetadata {
        track_id: TrackId::new(),
        kind,
        source_id: None,
        format: match kind {
            TrackKind::Camera => TrackFormat::Video {
                codec: "vp8".into(),
                width: 16,
                height: 16,
                nominal_fps: 30,
            },
            _ => TrackFormat::Audio {
                sample_format: "f32le".into(),
                sample_rate: 48_000,
                channels: 1,
            },
        },
        segments: vec![SegmentMetadata {
            segment_id: SegmentId::new(),
            path: path.into(),
            start_ns: 0,
            end_ns: Some(2_000_000_000),
            complete: true,
        }],
        metrics,
        status: TrackStatus::Completed,
        termination_reason: None,
    };
    let manifest = SessionManifest {
        schema_version: SCHEMA_VERSION,
        project_id: ProjectId::new(),
        session_id: SessionId::new(),
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        session_start_monotonic_ns: 0,
        duration_ns: 2_000_000_000,
        platform: PlatformMetadata {
            os: "linux".into(),
            architecture: "x86_64".into(),
            backend: "test".into(),
        },
        selected_sources: SelectedSources {
            screen: None,
            system_audio: None,
            microphone: None,
            camera: None,
        },
        tracks: vec![
            track(
                TrackKind::Camera,
                "camera.webm",
                TrackMetrics {
                    frames_acquired: 62,
                    frames_encoded: 60,
                    frames_dropped: 2,
                    ..Default::default()
                },
            ),
            track(
                TrackKind::Microphone,
                "microphone.wav",
                TrackMetrics {
                    samples_received: 96_000,
                    ..Default::default()
                },
            ),
            track(
                TrackKind::SystemAudio,
                "system-audio.wav",
                TrackMetrics {
                    samples_received: 95_000,
                    ..Default::default()
                },
            ),
        ],
        permissions: PermissionSnapshot::default(),
        warnings: Vec::new(),
        completed: true,
    };
    let mut measurements = SessionMeasurements::default();
    measurements.camera.queue_peaks.observe_source(3, 300);
    measurements.microphone.queue_peaks.observe_encoder(2, 128);
    measurements.system_audio.queue_peaks.observe_source(4, 256);
    measurements.preview = Some(PreviewMeasurements {
        frames_uploaded: 50,
        bytes_uploaded: 25_600,
        cpu_color_conversion_bytes: 20_000,
        cpu_padding_copy_count: 10,
        cpu_padding_copy_bytes: 4_000,
        cpu_buffer_reallocations: 2,
        cpu_buffer_growth_bytes: 1_000,
        submission_latency_samples: 2,
        submission_latency_sum_ns: 600,
        submission_latency_max_ns: 400,
        ..Default::default()
    });
    std::fs::write(output.join("camera.webm"), b"media").expect("camera fixture");
    std::fs::write(
        output.join("manifest.json"),
        serde_json::to_vec(&manifest).expect("manifest JSON"),
    )
    .expect("manifest file");
    std::fs::write(
        output.join("measurements.json"),
        serde_json::to_vec(&measurements).expect("measurements JSON"),
    )
    .expect("measurements file");
    let result = Command::new(env!("CARGO_BIN_EXE_beam-media-probe"))
        .args(["report", "--output", output.to_str().expect("path")])
        .output()
        .expect("report");
    assert!(result.status.success());
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).expect("report JSON");
    assert_eq!(report["cameraAcquiredFps"], 31.0);
    assert_eq!(report["cameraEncodedFps"], 30.0);
    assert_eq!(report["previewFps"], 25.0);
    assert_eq!(report["previewSubmissionLatencyMeanNs"], 300);
    assert_eq!(report["previewSubmissionLatencyMaxNs"], 400);
    assert_eq!(report["previewCpuBufferGrowthPerFrameBytes"], 20.0);
    assert_eq!(report["previewCpuColorConversionBytesPerFrame"], 400.0);
    assert_eq!(report["previewCpuPaddingCopyBytesPerFrame"], 80.0);
    assert_eq!(report["previewGpuUploadBytesPerFrame"], 512.0);
    assert_eq!(report["preview"]["cpuPaddingCopyCount"], 10);
    assert_eq!(report["preview"]["cpuBufferReallocations"], 2);
    assert!(report["peakGpuMemoryBytes"].is_null());
    assert_eq!(report["tracks"][0]["files"][0]["exists"], true);
    assert_eq!(report["tracks"][1]["files"][0]["exists"], false);
    assert_eq!(report["tracks"][0]["queuePeaks"]["sourcePackets"], 3);
    assert_eq!(report["tracks"][1]["queuePeaks"]["encoderBytes"], 128);
    assert_eq!(report["tracks"][2]["queuePeaks"]["sourcePackets"], 4);
}
