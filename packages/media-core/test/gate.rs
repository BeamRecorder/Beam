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

#[test]
fn pause_excludes_wall_time_and_resume_advances_epoch() {
    let gate = StartGate::new();
    gate.release(100).expect("release");
    assert_eq!(gate.pause(200).expect("pause"), 100);
    assert_eq!(gate.session_ns(300), None);
    assert_eq!(gate.elapsed_ns(300), Some(100));
    gate.resume(400).expect("resume");
    assert_eq!(gate.session_ns(450), Some(150));
    assert_eq!(gate.epoch(), 1);
    assert_eq!(gate.pause(500).expect("pause"), 200);
    gate.resume(600).expect("resume");
    assert_eq!(gate.session_ns(700), Some(300));
    assert_eq!(gate.epoch(), 2);
}

#[test]
fn invalid_pause_resume_preserves_timeline() {
    let gate = StartGate::new();
    assert!(gate.pause(10).is_err());
    assert!(gate.resume(10).is_err());
    gate.release(100).expect("release");
    assert!(gate.pause(90).is_err());
    gate.pause(200).expect("pause");
    assert!(gate.pause(210).is_err());
    assert!(gate.resume(199).is_err());
    assert_eq!(gate.elapsed_ns(400), Some(100));
    gate.resume(400).expect("resume");
    gate.close();
    assert!(gate.pause(500).is_err());
    assert!(gate.resume(500).is_err());
    assert_eq!(gate.elapsed_ns(500), Some(200));
}

#[test]
fn release_wakes_waiter_and_cancel_wakes_with_error() {
    use std::sync::Arc;
    for cancel in [false, true] {
        let gate = Arc::new(StartGate::new());
        let waiting = gate.clone();
        let worker = std::thread::spawn(move || waiting.wait());
        if cancel {
            gate.cancel();
        } else {
            gate.release(42).expect("release");
        }
        let result = worker.join().expect("join");
        if cancel {
            assert!(result.is_err());
        } else {
            assert_eq!(result.expect("origin"), 42);
        }
        assert_eq!(gate.is_released(), !cancel);
    }
}
