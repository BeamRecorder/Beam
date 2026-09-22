use capture::clock::{MonotonicClock, SessionClock};

#[test]
fn cloned_session_clock_preserves_one_monotonic_origin() {
    let clock = SessionClock::start();
    let copy = clock.clone();
    let before = clock.now_ns();
    let after = copy.now_ns();
    assert!(after >= before);
    assert!(after < 1_000_000_000, "the session origin should be recent");
}
