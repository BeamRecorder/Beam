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
