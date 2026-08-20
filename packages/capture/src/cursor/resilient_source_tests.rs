#![allow(clippy::expect_used, clippy::panic)]

use super::ResilientSource;

#[test]
fn refresh_replaces_the_current_value_after_success() {
    let source = ResilientSource::new(1_i32);

    assert!(source.refresh(|| Ok::<_, ()>(2)));
    assert_eq!(source.current(), 2);
}

#[test]
fn refresh_keeps_the_last_value_after_an_error() {
    let source = ResilientSource::new(1_i32);

    assert!(!source.refresh(|| Err::<i32, _>("shape unavailable")));
    assert_eq!(source.current(), 1);
}

#[test]
fn refresh_keeps_the_last_value_after_a_panic() {
    let source = ResilientSource::new(1_i32);

    assert!(!source.refresh(|| -> Result<i32, &'static str> {
        panic!("shape provider panicked");
    }));
    assert_eq!(source.current(), 1);
}

#[test]
fn refresh_recovers_with_a_new_value_after_a_failure() {
    let source = ResilientSource::new(1_i32);

    assert!(!source.refresh(|| Err::<i32, _>("shape unavailable")));
    assert_eq!(source.current(), 1);

    assert!(source.refresh(|| Ok::<_, ()>(2)));
    assert_eq!(source.current(), 2);
}
