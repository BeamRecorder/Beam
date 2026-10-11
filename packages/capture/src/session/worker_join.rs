use crate::CaptureError;
use std::{
    thread::JoinHandle,
    time::{Duration, Instant},
};

/// Never let a native polling call or filesystem operation hold the engine's
/// command loop indefinitely. Dropping a JoinHandle detaches; it cannot safely
/// terminate a driver call. The caller must signal cancellation first.
pub(crate) fn join_worker(
    thread: JoinHandle<Result<(), CaptureError>>,
    name: &str,
) -> Result<(), CaptureError> {
    join_until(thread, name, Duration::from_secs(2))
}

fn join_until(
    thread: JoinHandle<Result<(), CaptureError>>,
    name: &str,
    timeout: Duration,
) -> Result<(), CaptureError> {
    let deadline = Instant::now() + timeout;
    while !thread.is_finished() {
        if Instant::now() >= deadline {
            return Err(CaptureError::Backend(format!(
                "{name} did not stop within {timeout:?}; its journal was preserved"
            )));
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    thread
        .join()
        .map_err(|_| CaptureError::Backend(format!("{name} thread panicked")))?
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used, clippy::panic)]
    use super::*;

    #[test]
    fn a_blocked_worker_does_not_block_the_command_loop() {
        let (release, blocked) = std::sync::mpsc::channel();
        let (done, finished) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            blocked.recv().expect("release");
            done.send(()).expect("signal");
            Ok(())
        });
        let started = Instant::now();
        let error = join_until(worker, "blocked", Duration::from_millis(20)).expect_err("deadline");
        assert!(error.to_string().contains("journal was preserved"));
        assert!(started.elapsed() < Duration::from_secs(1));
        release.send(()).expect("release detached worker");
        finished
            .recv_timeout(Duration::from_secs(1))
            .expect("worker cleans up later");
    }

    #[test]
    fn failures_and_panics_are_never_reported_as_success() {
        let worker = std::thread::spawn(|| Err(CaptureError::Backend("disk full".into())));
        assert!(
            join_worker(worker, "writer")
                .expect_err("failure")
                .to_string()
                .contains("disk full")
        );
        let worker = std::thread::spawn(|| panic!("native worker panic"));
        assert!(
            join_worker(worker, "writer")
                .expect_err("panic")
                .to_string()
                .contains("panicked")
        );
    }
}
