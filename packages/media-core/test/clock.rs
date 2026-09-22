#![allow(clippy::expect_used)]

use std::time::{Duration, Instant};

use beam_media_core::{
    AudioSampleClock, ClockError, MonotonicClock, NativeTimestampMapper, SessionClock,
};

#[test]
fn session_clock_maps_instants_from_its_epoch() {
    let clock = SessionClock::start();
    let after = Instant::now();
    assert!(clock.at(after).is_some());
    assert!(clock.now_ns() >= clock.at(after).unwrap_or_default());
    assert_eq!(clock.at(after - Duration::from_secs(1)), None);
}

#[test]
fn native_mapping_preserves_rate_and_rejects_regressions() {
    let mut mapper = NativeTimestampMapper::new(48_000, 5, 48_000).expect("rate is valid");
    assert_eq!(mapper.map(48_000), Ok(5));
    assert_eq!(mapper.map(96_000), Ok(1_000_000_005));
    assert_eq!(mapper.map(95_999), Err(ClockError::NativeTimeRegressed));
    assert_eq!(mapper.map(96_001), Ok(1_000_020_838));
}

#[test]
fn native_mapping_rejects_invalid_rate_and_overflow() {
    assert_eq!(
        NativeTimestampMapper::new(0, 0, 0).err(),
        Some(ClockError::InvalidRate)
    );
    let mut mapper = NativeTimestampMapper::new(10, 0, 1).expect("rate is valid");
    assert_eq!(mapper.map(9), Err(ClockError::NativeTimeBeforeAnchor));
    assert_eq!(mapper.map(u64::MAX), Err(ClockError::Overflow));
    assert_eq!(mapper.map(10), Ok(0));
}

#[test]
fn native_mapping_handles_subnanosecond_ticks_and_session_overflow() {
    let mut fine = NativeTimestampMapper::new(0, 0, 2_000_000_000).expect("valid rate");
    assert_eq!(fine.map(1), Ok(0));
    assert_eq!(fine.map(2), Ok(1));

    let mut near_limit = NativeTimestampMapper::new(0, u64::MAX, 1).expect("valid rate");
    assert_eq!(near_limit.map(1), Err(ClockError::Overflow));
    assert_eq!(near_limit.map(0), Ok(u64::MAX));
}

#[test]
fn audio_samples_keep_exact_timeline_across_jittery_callbacks() {
    let mut clock = AudioSampleClock::new(9, 48_000).expect("rate is valid");
    assert_eq!(clock.advance(480), Ok((9, 10_000_009)));
    assert_eq!(clock.advance(480), Ok((10_000_009, 20_000_009)));
    assert_eq!(clock.advance(0), Ok((20_000_009, 20_000_009)));
}

#[test]
fn audio_samples_reject_invalid_rate_and_overflow() {
    assert_eq!(
        AudioSampleClock::new(0, 0).err(),
        Some(ClockError::InvalidRate)
    );
    let mut clock = AudioSampleClock::new(u64::MAX, 48_000).expect("rate is valid");
    assert_eq!(clock.advance(48_000), Err(ClockError::Overflow));
    assert_eq!(clock.advance(0), Ok((u64::MAX, u64::MAX)));
}

#[test]
fn audio_samples_accumulate_fractional_nanoseconds_without_drift() {
    let mut clock = AudioSampleClock::new(0, 44_100).expect("valid rate");
    for _ in 0..44_100 {
        clock.advance(1).expect("one sample fits");
    }
    assert_eq!(clock.advance(0), Ok((1_000_000_000, 1_000_000_000)));
}
