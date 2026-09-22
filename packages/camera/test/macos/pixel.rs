#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn macos_sample_timestamp_uses_the_native_rational() {
    let time = unsafe { CMTime::new(3, 2) };
    assert_eq!(time_to_ns(time), Some(1_500_000_000));
    assert_eq!(time_to_ns(unsafe { CMTime::new(1, 0) }), None);
    assert_eq!(time_to_ns(unsafe { CMTime::new(-1, 2) }), None);
    assert_eq!(time_to_ns(unsafe { CMTime::new(i64::MAX, 1) }), None);
}
