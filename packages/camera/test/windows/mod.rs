#![cfg(target_os = "windows")]
#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraError, CameraQueueLimits, CameraRequest, open_camera};
use beam_media_core::{SessionClock, StartGate};

#[test]
fn invalid_queue_budget_fails_before_media_foundation_discovery() {
    let request = CameraRequest {
        device_id: "missing".into(),
        width: 640,
        height: 480,
        fps: 30,
    };
    assert!(matches!(
        open_camera(
            request,
            SessionClock::start(),
            Arc::new(StartGate::new()),
            CameraQueueLimits {
                frames: 0,
                bytes: 1
            },
        ),
        Err(CameraError::UnsupportedFormat(_))
    ));
}
