use capture::session::StartGate;

#[test]
fn start_barrier_is_one_shot_and_cancellation_wakes_waiters() {
    let cancelled = StartGate::new();
    cancelled.cancel();
    assert!(!cancelled.is_released());
    assert!(cancelled.wait().is_err());
    assert!(cancelled.release(10).is_err());

    let started = StartGate::new();
    started.release(123).expect("release");
    assert!(started.is_released());
    assert_eq!(started.wait().expect("start time"), 123);
    assert!(started.release(456).is_err());
}
