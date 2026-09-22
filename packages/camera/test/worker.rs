#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;
use std::sync::mpsc;

#[test]
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn camera_read_timeout_starts_after_ten_seconds() {
    let started = Instant::now();
    assert!(!camera_read_timed_out(started, started));
    assert!(!camera_read_timed_out(
        started,
        started + Duration::from_secs(10) - Duration::from_nanos(1)
    ));
    assert!(camera_read_timed_out(
        started,
        started + Duration::from_secs(10)
    ));
    assert!(!camera_read_timed_out(
        started + Duration::from_secs(1),
        started
    ));
}

#[test]
fn joining_an_absent_camera_worker_is_idempotent() {
    let mut worker = None;
    join_camera_worker(&mut worker, Duration::from_millis(1), "V4L2").expect("first join");
    join_camera_worker(&mut worker, Duration::from_millis(1), "V4L2").expect("second join");
}

#[test]
fn a_timed_out_camera_worker_remains_joinable_after_it_returns() {
    let (release, waiting) = mpsc::sync_channel::<()>(1);
    let mut worker = Some(thread::spawn(move || {
        waiting
            .recv()
            .map_err(|error| CameraError::Backend(error.to_string()))?;
        Ok(())
    }));
    let error = join_camera_worker(&mut worker, Duration::from_millis(20), "native")
        .expect_err("worker still waiting");
    assert!(error.to_string().contains("native camera worker"));
    assert!(error.to_string().contains("20 ms"));
    assert!(worker.is_some());
    release.send(()).expect("release worker");
    join_camera_worker(&mut worker, Duration::from_secs(1), "native").expect("retry joins worker");
    assert!(worker.is_none());
}

#[test]
fn camera_worker_failure_is_returned_once() {
    let mut worker = Some(thread::spawn(|| {
        Err(CameraError::Backend("read failed".into()))
    }));
    let error = join_camera_worker(&mut worker, Duration::from_secs(1), "V4L2")
        .expect_err("worker failure");
    assert!(error.to_string().contains("read failed"));
    assert!(worker.is_none());
    join_camera_worker(&mut worker, Duration::from_millis(1), "V4L2")
        .expect("worker already joined");
}

#[test]
fn camera_worker_panic_is_reported() {
    let mut worker = Some(thread::spawn(|| -> Result<(), CameraError> {
        std::panic::resume_unwind(Box::new("synthetic panic"))
    }));
    let error =
        join_camera_worker(&mut worker, Duration::from_secs(1), "V4L2").expect_err("worker panic");
    assert!(error.to_string().contains("panicked"));
    assert!(worker.is_none());
}
