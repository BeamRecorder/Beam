#![allow(clippy::expect_used)]

use beam_media_core::{GateError, StartGate};

#[test]
fn gate_has_no_timeline_before_release() {
    let gate = StartGate::new();
    assert_eq!(gate.release_ns(), None);
    assert_eq!(gate.session_ns(100), None);
}

#[test]
fn gate_maps_clock_time_to_shared_zero() {
    let gate = StartGate::new();
    gate.release(100).expect("release");
    assert_eq!(gate.session_ns(99), None);
    assert_eq!(gate.session_ns(100), Some(0));
    assert_eq!(gate.session_ns(125), Some(25));
}

#[test]
fn gate_cannot_release_twice_or_use_sentinel() {
    let gate = StartGate::new();
    assert_eq!(gate.release(u64::MAX), Err(GateError::InvalidTimestamp));
    gate.release(10).expect("first release");
    assert_eq!(gate.release(20), Err(GateError::AlreadyReleased));
    assert_eq!(gate.release_ns(), Some(10));
}

#[test]
fn closed_gate_rejects_new_capture_timestamps() {
    let gate = StartGate::new();
    gate.release(10).expect("release");
    gate.close();
    assert_eq!(gate.session_ns(20), None);
}
