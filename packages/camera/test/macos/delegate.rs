#![cfg(test)]

use super::*;

#[test]
fn callback_state_keeps_sequence_and_failure_independent() {
    let state = CallbackState::default();
    assert_eq!(state.next_sequence(), 1);
    assert_eq!(state.next_sequence(), 2);
    assert!(state.failure().is_none());
    state.fail("camera disconnected".into());
    state.fail("later failure".into());
    assert_eq!(state.failure().as_deref(), Some("camera disconnected"));
}

#[test]
fn callback_sequence_saturates_at_the_integer_limit() {
    let state = CallbackState::default();
    state.sequence.store(u64::MAX - 1, Ordering::Release);
    assert_eq!(state.next_sequence(), u64::MAX);
    assert_eq!(state.next_sequence(), u64::MAX);
}
