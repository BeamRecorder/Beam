#![cfg(test)]
#![allow(clippy::expect_used)]
use super::{LinuxRecording, validate_portal_request};
use crate::{
    gate::StartGate,
    model::{PortalSourceKind, ScreenRegion, ScreenSelection, SourceId},
    screen::{PixelFormat, ScreenCaptureMetrics, VideoFormat},
};
use std::sync::Arc;
pub(crate) fn stopped() -> LinuxRecording {
    LinuxRecording {
        portal: None,
        pipewire: None,
        metrics: Arc::new(ScreenCaptureMetrics::default()),
    }
}
#[test]
fn stopped_recording_rejects_lifecycle_commands_and_stop_is_idempotent() {
    let mut recording = stopped();
    assert!(recording.start().is_err());
    assert!(recording.pause().is_err());
    assert!(
        recording
            .prepare_resume(0, Arc::new(StartGate::new()), None)
            .is_err()
    );
    recording.stop().expect("stop");
    recording.stop().expect("second stop");
    assert!(recording.source_id().is_none());
}
#[test]
fn raw_video_format_is_never_adjusted_for_an_encoder() {
    let recording = stopped();
    let format = VideoFormat {
        width: 3,
        height: 5,
        stride: 12,
        pixel_format: PixelFormat::Bgra8,
    };
    assert!(recording.video_format().is_none());
    recording.metrics.observe_video_format(format);
    assert_eq!(recording.video_format(), Some(format));
    assert!(Arc::ptr_eq(&recording.metrics(), &recording.metrics()));
}
#[test]
fn unsupported_selection_is_rejected_before_opening_portal() {
    assert!(
        validate_portal_request(
            &ScreenSelection::Source {
                source_id: SourceId::new("display:1").expect("id")
            },
            None
        )
        .is_err()
    );
}
#[test]
fn persistence_token_is_rejected() {
    assert!(
        validate_portal_request(
            &ScreenSelection::Portal {
                kind: PortalSourceKind::Monitor,
                restore_token: Some("token".into())
            },
            None
        )
        .is_err()
    );
}
#[test]
fn region_applies_to_whichever_source_portal_selects() {
    for kind in [
        PortalSourceKind::Monitor,
        PortalSourceKind::Window,
        PortalSourceKind::MonitorOrWindow,
    ] {
        let source = ScreenSelection::Portal {
            kind: kind.clone(),
            restore_token: None,
        };
        let region = ScreenRegion {
            x: 0.5,
            y: 0.5,
            width: 0.5,
            height: 0.5,
        };
        assert_eq!(
            validate_portal_request(&source, Some(region)).expect("region"),
            kind
        );
        assert!(
            validate_portal_request(
                &source,
                Some(ScreenRegion {
                    x: f64::NAN,
                    ..region
                })
            )
            .is_err()
        );
    }
}
