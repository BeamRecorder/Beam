#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use std::sync::Arc;

use beam_camera::{CameraError, CameraQueueLimits, CameraRequest, open_camera};
use beam_media_core::{SessionClock, StartGate};

fn open(request: CameraRequest, limits: CameraQueueLimits) -> Result<(), CameraError> {
    let capture = open_camera(
        request,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        limits,
    )?;
    capture.stop()
}

#[test]
fn invalid_camera_request_and_queue_limits_fail_before_opening_a_device() {
    let request = CameraRequest {
        device_id: "/dev/video999999".into(),
        width: 0,
        height: 480,
        fps: 30,
    };
    assert!(matches!(
        open(request.clone(), CameraQueueLimits::default()),
        Err(CameraError::UnsupportedFormat(_))
    ));
    let request = CameraRequest {
        width: 640,
        ..request
    };
    assert!(matches!(
        open(
            request,
            CameraQueueLimits {
                frames: 0,
                bytes: 1024
            }
        ),
        Err(CameraError::UnsupportedFormat(_))
    ));
}

#[test]
fn every_zero_dimension_and_queue_limit_is_rejected_before_device_access() {
    let request = CameraRequest {
        device_id: "/dev/video999999".into(),
        width: 640,
        height: 480,
        fps: 30,
    };
    for invalid in [
        CameraRequest {
            width: 0,
            ..request.clone()
        },
        CameraRequest {
            height: 0,
            ..request.clone()
        },
        CameraRequest {
            fps: 0,
            ..request.clone()
        },
    ] {
        let error = open(invalid, CameraQueueLimits::default()).expect_err("invalid dimensions");
        assert!(matches!(error, CameraError::UnsupportedFormat(_)));
    }
    for limits in [
        CameraQueueLimits {
            frames: 0,
            bytes: 1,
        },
        CameraQueueLimits {
            frames: 1,
            bytes: 0,
        },
    ] {
        let error = open(request.clone(), limits).expect_err("invalid queue");
        assert!(matches!(error, CameraError::UnsupportedFormat(_)));
    }
}

#[test]
fn nonexistent_or_nonvideo_paths_do_not_become_camera_streams() {
    let request = CameraRequest {
        device_id: "/dev/video999999".into(),
        width: 640,
        height: 480,
        fps: 30,
    };
    assert!(matches!(
        open(request.clone(), CameraQueueLimits::default()),
        Err(CameraError::DeviceUnavailable(_))
    ));
    let temporary = tempfile::tempdir().expect("tempdir");
    let file = temporary.path().join("ordinary-file");
    std::fs::write(&file, b"not a camera").expect("create file");
    let request = CameraRequest {
        device_id: file.to_string_lossy().into_owned(),
        ..request
    };
    assert!(matches!(
        open(request, CameraQueueLimits::default()),
        Err(CameraError::DeviceUnavailable(_))
    ));
}

#[test]
fn symlink_to_nonvideo_file_is_rejected_after_canonicalization() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let file = temporary.path().join("regular-file");
    std::fs::write(&file, b"ordinary bytes").expect("regular file");
    let alias = temporary.path().join("camera-alias");
    std::os::unix::fs::symlink(&file, &alias).expect("symlink");
    let request = CameraRequest {
        device_id: alias.to_string_lossy().into_owned(),
        width: 640,
        height: 480,
        fps: 30,
    };
    assert!(matches!(
        open(request, CameraQueueLimits::default()),
        Err(CameraError::DeviceUnavailable(reason)) if reason.contains("does not resolve")
    ));
}
