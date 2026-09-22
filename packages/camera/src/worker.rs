use std::{
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use crate::CameraError;

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn camera_read_timed_out(started: Instant, now: Instant) -> bool {
    now.saturating_duration_since(started) >= Duration::from_secs(10)
}

/// Keep the handle on timeout so a later halt can join a stalled capture thread.
pub(crate) fn join_camera_worker(
    worker: &mut Option<JoinHandle<Result<(), CameraError>>>,
    timeout: Duration,
    backend: &str,
) -> Result<(), CameraError> {
    let Some(running) = worker.as_ref() else {
        return Ok(());
    };
    let deadline = Instant::now() + timeout;
    while !running.is_finished() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    if !running.is_finished() {
        return Err(CameraError::Backend(format!(
            "{backend} camera worker did not stop within {} ms",
            timeout.as_millis()
        )));
    }
    let Some(finished) = worker.take() else {
        return Ok(());
    };
    finished
        .join()
        .map_err(|_| CameraError::Backend("camera worker panicked".into()))?
}

#[path = "../test/worker.rs"]
mod worker_checks;
