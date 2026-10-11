#![allow(clippy::expect_used, clippy::panic)]
use super::*;
use std::time::Instant;

#[test]
fn blocked_native_calls_return_by_the_deadline_and_retries_do_not_spawn_workers() {
    let operations = NativeOperations::default();
    let (release, blocked) = crossbeam_channel::bounded(1);
    let started = Instant::now();
    assert!(
        operations
            .run("blocked-driver", Duration::from_millis(20), move || {
                blocked.recv().expect("release");
                Ok(())
            })
            .is_err()
    );
    assert!(started.elapsed() < Duration::from_secs(1));
    for _ in 0..10_000 {
        assert!(
            operations
                .run::<()>("retry", Duration::from_millis(20), || panic!(
                    "must not spawn another native worker"
                ))
                .is_err()
        );
    }
    release.send(()).expect("release original worker");
    let deadline = Instant::now() + Duration::from_secs(1);
    while operations.busy.load(Ordering::Acquire) {
        assert!(Instant::now() < deadline);
        std::thread::yield_now();
    }
    assert_eq!(
        operations
            .run("recovered", Duration::from_secs(1), || Ok(42))
            .expect("recovered"),
        42
    );
}

#[test]
fn native_failure_is_returned_unchanged_and_does_not_poison_later_operations() {
    let operations = NativeOperations::default();
    for _ in 0..100 {
        let failure = operations.run("failure", Duration::from_secs(1), || {
            Err::<(), _>(CaptureError::Cancelled)
        });
        assert!(matches!(failure, Err(CaptureError::Cancelled)));
    }
    assert!(
        operations
            .run("success", Duration::from_secs(1), || Ok(()))
            .is_ok()
    );
}

#[test]
fn a_panicking_native_worker_unquarantines_and_is_reported_as_failure() {
    let operations = NativeOperations::default();
    assert!(
        operations
            .run(
                "panic",
                Duration::from_secs(1),
                || -> Result<(), CaptureError> { panic!("native callback panic") }
            )
            .is_err()
    );
    assert!(
        operations
            .run("success", Duration::from_secs(1), || Ok(()))
            .is_ok()
    );
}

#[test]
fn abandoned_startup_results_are_cleaned_up_inside_the_quarantined_worker() {
    struct Recording {
        operations: NativeOperations,
        started: crossbeam_channel::Sender<()>,
        release: crossbeam_channel::Receiver<()>,
    }
    impl Drop for Recording {
        fn drop(&mut self) {
            let started = self.started.clone();
            let release = self.release.clone();
            self.operations
                .run(
                    "late-recording-stop",
                    Duration::from_millis(20),
                    move || {
                        started.send(()).expect("cleanup started");
                        release.recv().expect("release cleanup");
                        Ok(())
                    },
                )
                .expect("cleanup must run even while its outer worker is quarantined");
        }
    }
    let operations = NativeOperations::default();
    let owned = operations.clone();
    let (finish_startup, startup) = crossbeam_channel::bounded(1);
    let (cleanup_started, cleanup) = crossbeam_channel::bounded(1);
    let (finish_cleanup, release) = crossbeam_channel::bounded(1);
    assert!(
        operations
            .run("late-startup", Duration::from_millis(20), move || {
                startup.recv().expect("finish startup after deadline");
                Ok(Recording {
                    operations: owned,
                    started: cleanup_started,
                    release,
                })
            })
            .is_err()
    );
    finish_startup.send(()).expect("startup returns late");
    cleanup
        .recv_timeout(Duration::from_secs(1))
        .expect("cleanup must actually start");
    for _ in 0..10_000 {
        assert!(
            operations
                .run::<()>(
                    "retry-during-cleanup",
                    Duration::from_millis(20),
                    || panic!("must stay quarantined")
                )
                .is_err()
        );
    }
    finish_cleanup.send(()).expect("cleanup returns");
    let deadline = Instant::now() + Duration::from_secs(1);
    while operations.busy.load(Ordering::Acquire) {
        assert!(Instant::now() < deadline);
        std::thread::yield_now();
    }
    operations
        .run("recovered", Duration::from_secs(1), || Ok(()))
        .expect("recovered");
}
