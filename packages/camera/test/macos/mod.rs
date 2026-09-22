#![cfg(target_os = "macos")]
#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraError, CameraQueueLimits, CameraRequest, open_camera};
use beam_media_core::{SessionClock, StartGate};

#[test]
fn invalid_camera_request_does_not_prompt_for_permission() {
    let request = CameraRequest {
        device_id: "missing".into(),
        width: 0,
        height: 480,
        fps: 30,
    };
    assert!(matches!(
        open_camera(
            request,
            SessionClock::start(),
            Arc::new(StartGate::new()),
            CameraQueueLimits::default(),
        ),
        Err(CameraError::UnsupportedFormat(_))
    ));
}
