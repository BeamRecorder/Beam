#![cfg(test)]
#![allow(clippy::expect_used)]

use super::{LinuxRecording, validate_portal_request};
use crate::{
    CaptureError,
    model::{
        CursorSelection, PortalSourceKind, RecordingSettings, ScreenRegion, ScreenSelection,
        SourceId,
    },
    screen::{PixelFormat, ScreenCaptureMetrics, ScreenConsumer, ScreenOpenRequest, VideoFormat},
    session::StartGate,
};
use std::sync::Arc;

fn stopped(encoded_output: bool, encoded_codec: Option<&str>) -> LinuxRecording {
    LinuxRecording {
        portal: None,
        pipewire: None,
        metrics: Arc::new(ScreenCaptureMetrics::default()),
        encoded_output,
        encoded_codec: encoded_codec.map(str::to_owned),
    }
}

#[test]
fn stopped_linux_recording_rejects_start_and_pause_without_portal_hardware() {
    let mut recording = stopped(false, None);
    assert!(recording.start().is_err());
    assert!(recording.pause().is_err());
    assert!(recording.is_available());
    assert!(recording.video_format().is_none());
    assert!(recording.encoded_codec().is_none());
    assert!(recording.stop().is_ok());
}

#[test]
fn stopped_recording_rejects_resume_and_remains_idempotently_stopped() {
    let mut recording = stopped(false, None);
    let gate = Arc::new(StartGate::new());
    for error in [
        recording.start().expect_err("start"),
        recording.pause().expect_err("pause"),
        recording
            .prepare_resume(100, gate, None)
            .expect_err("resume"),
    ] {
        assert_eq!(error.code(), "invalid-transition");
        assert!(
            matches!(error, CaptureError::InvalidTransition { ref from, .. } if from == "Stopped")
        );
    }
    recording.stop().expect("first stop");
    recording.stop().expect("second stop");
    assert!(recording.is_available());
}

#[test]
fn stopped_recording_exposes_shared_metrics_and_encoded_video_metadata() {
    let raw = VideoFormat {
        width: 3,
        height: 5,
        stride: 12,
        pixel_format: PixelFormat::Bgra8,
    };
    let plain = stopped(false, None);
    plain.metrics.observe_video_format(raw);
    assert!(Arc::ptr_eq(&plain.metrics(), &plain.metrics()));
    assert_eq!(plain.video_format(), Some(raw));
    assert_eq!(plain.encoded_codec(), None);
    let encoded = stopped(true, Some("h264"));
    encoded.metrics.observe_video_format(raw);
    assert_eq!(encoded.encoded_codec(), Some("h264"));
    let format = encoded.video_format().expect("encoded format");
    assert_eq!((format.width, format.height, format.stride), (4, 6, 16));
    assert_eq!(format.pixel_format, PixelFormat::Bgra8);
}

#[test]
fn opening_rejects_non_portal_source_before_encoder_or_portal_access() {
    let selection = ScreenSelection::Source {
        source_id: SourceId::new("display:test").expect("source id"),
    };
    let settings = RecordingSettings::default();
    let error = LinuxRecording::open(ScreenOpenRequest {
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
    })
    .err()
    .expect("unsupported source");
    assert_eq!(error.code(), "unsupported-operation");
}

#[test]
fn opening_rejects_restore_tokens_and_non_monitor_regions_before_portal_access() {
    let settings = RecordingSettings::default();
    let region = ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 0.5,
        height: 0.5,
    };
    for (selection, request_region, expected) in [
        (
            ScreenSelection::Portal {
                kind: PortalSourceKind::Monitor,
                restore_token: Some("token".into()),
            },
            None,
            "restore tokens",
        ),
        (
            ScreenSelection::Portal {
                kind: PortalSourceKind::Window,
                restore_token: None,
            },
            Some(region),
            "monitor source",
        ),
        (
            ScreenSelection::Portal {
                kind: PortalSourceKind::MonitorOrWindow,
                restore_token: None,
            },
            Some(region),
            "monitor source",
        ),
    ] {
        let error = LinuxRecording::open(ScreenOpenRequest {
            selection: &selection,
            recording: &settings,
            region: request_region,
            cursor: CursorSelection::Disabled,
            excluded_window_handles: &[],
            start_ns: 0,
            start_gate: Arc::new(StartGate::new()),
            consumer: ScreenConsumer::EncodedFile {
                path: "unused.mp4".into(),
                cursor_directory: None,
            },
        })
        .err()
        .expect("invalid selection");
        assert_eq!(error.code(), "invalid-configuration");
        assert!(error.to_string().contains(expected));
    }
}

#[test]
fn portal_request_accepts_supported_source_and_region_combinations() {
    let region = ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 0.5,
        height: 0.5,
    };
    for (kind, selected_region) in [
        (PortalSourceKind::Monitor, Some(region)),
        (PortalSourceKind::Monitor, None),
        (PortalSourceKind::Window, None),
        (PortalSourceKind::MonitorOrWindow, None),
    ] {
        let selection = ScreenSelection::Portal {
            kind: kind.clone(),
            restore_token: None,
        };
        assert_eq!(
            validate_portal_request(&selection, selected_region).expect("valid Portal request"),
            kind
        );
    }
}

#[test]
fn portal_request_rejects_restore_token_before_invalid_region() {
    let selection = ScreenSelection::Portal {
        kind: PortalSourceKind::Window,
        restore_token: Some("unusable".into()),
    };
    let region = ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 0.5,
        height: 0.5,
    };
    let error = validate_portal_request(&selection, Some(region)).expect_err("restore token");
    assert!(error.to_string().contains("restore tokens"));
}
