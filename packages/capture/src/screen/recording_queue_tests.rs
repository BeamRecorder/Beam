#![allow(clippy::expect_used)]

use super::{FrameCadence, FrameQueuePressure, frame_queue_capacity};
use std::time::{Duration, Instant};

#[test]
fn pressure_reports_a_stalled_encoder_at_the_deadline() {
    let mut pressure = FrameQueuePressure::default();
    let now = Instant::now();
    assert!(!pressure.check(false, 0, now).expect("initial backpressure"));
    assert!(
        !pressure
            .check(false, 0, now + Duration::from_millis(29999))
            .expect("temporary lag")
    );
    assert!(
        pressure
            .check(false, 0, now + Duration::from_secs(30))
            .is_err()
    );
}

#[test]
fn normal_encoder_progress_resets_the_stall_deadline() {
    let mut pressure = FrameQueuePressure::default();
    let now = Instant::now();
    pressure.check(false, 0, now).expect("pressure");
    assert!(
        pressure
            .check(true, 0, now + Duration::from_secs(4))
            .expect("progress")
    );
    assert!(
        !pressure
            .check(false, 0, now + Duration::from_secs(100))
            .expect("new pressure")
    );
}

#[test]
fn pressure_is_checked_even_without_another_captured_frame() {
    let mut pressure = FrameQueuePressure::default();
    let now = Instant::now();
    assert!(pressure.check(true, 0, now).expect("empty queue"));
    pressure.check(false, 0, now).expect("last frame queued");
    assert!(
        pressure
            .check(false, 0, now + Duration::from_secs(60))
            .is_err()
    );
}

#[test]
fn raw_frame_budget_scales_with_dimensions() {
    assert_eq!(frame_queue_capacity(1920, 1080).expect("1080p"), 3);
    assert_eq!(frame_queue_capacity(3840, 2160).expect("4K"), 2);
    assert_eq!(frame_queue_capacity(7680, 4320).expect("8K"), 1);
}

#[test]
fn invalid_dimensions_fail_instead_of_allocating_an_unbounded_queue() {
    assert!(frame_queue_capacity(0, 1080).is_err());
    assert!(frame_queue_capacity(1920, 0).is_err());
    assert!(frame_queue_capacity(u32::MAX, u32::MAX).is_err());
}

#[test]
fn slow_encoder_keeps_only_the_bounded_number_of_frames_over_ten_minutes() {
    let capacity = frame_queue_capacity(3840, 2160).expect("4K");
    let (sender, receiver) = crossbeam_channel::bounded(capacity);
    let mut dropped = 0;
    for frame in 0..600 * 144 {
        if sender.try_send(frame).is_err() {
            dropped += 1;
        }
        assert!(receiver.len() <= capacity);
    }
    assert_eq!(dropped, 600 * 144 - capacity);
    drop(sender);
    assert_eq!(receiver.iter().count(), capacity);
}

#[test]
fn cadence_accepts_the_first_frame_and_exact_interval() {
    let mut cadence = FrameCadence::new(50);
    assert!(cadence.accepts(9_000_000));
    assert!(!cadence.accepts(9_190_000));
    assert!(cadence.accepts(9_200_000));
}

#[test]
fn cadence_rejects_repeated_and_backwards_timestamps() {
    let mut cadence = FrameCadence::new(60);
    assert!(cadence.accepts(1_000_000));
    assert!(!cadence.accepts(1_000_000));
    assert!(!cadence.accepts(999_999));
    assert!(cadence.accepts(10_000_000));
}

#[test]
fn cadence_handles_zero_fps_and_timestamp_extremes() {
    let mut cadence = FrameCadence::new(0);
    assert!(cadence.accepts(i64::MIN));
    assert!(!cadence.accepts(i64::MIN + 1));
    assert!(cadence.accepts(i64::MAX));
}

#[test]
fn continuous_overload_with_real_progress_never_triggers_a_false_stall() {
    let mut pressure = FrameQueuePressure::default();
    let start = Instant::now();
    for second in 0..48 * 3600 {
        assert!(
            !pressure
                .check(false, second / 20, start + Duration::from_secs(second))
                .expect("a slow encoder still makes progress")
        );
    }
}

#[test]
fn stalled_encoder_deadline_restarts_at_the_last_progress() {
    let mut pressure = FrameQueuePressure::default();
    let start = Instant::now();
    pressure.check(false, 0, start).expect("initial pressure");
    pressure
        .check(false, 1, start + Duration::from_secs(29))
        .expect("progress");
    assert!(
        !pressure
            .check(false, 1, start + Duration::from_secs(58))
            .expect("grace")
    );
    assert!(
        pressure
            .check(false, 1, start + Duration::from_secs(59))
            .is_err()
    );
}

#[test]
fn cadence_preserves_rate_for_a_full_day_across_refresh_rates() {
    for (source_hz, target_fps) in [(144, 60), (165, 60), (240, 59), (60, 30), (120, 24)] {
        let mut cadence = FrameCadence::new(target_fps);
        let seconds = 24_u64 * 3600;
        let count = (0..seconds * source_hz)
            .filter(|frame| cadence.accepts((frame * 10_000_000 / source_hz) as i64))
            .count() as u64;
        assert!(
            count.abs_diff(seconds * u64::from(target_fps)) <= 1,
            "{source_hz} Hz -> {target_fps} fps yielded {count}"
        );
    }
}

#[test]
fn cadence_resists_jitter_clock_repeats_and_long_gaps() {
    let mut cadence = FrameCadence::new(30);
    let mut seed = 42_u64;
    let mut accepted = 0_u64;
    for frame in 0..60 * 3600 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let jitter = ((seed >> 32) % 2001) as i64 - 1000;
        let timestamp = frame * 10_000_000 / 60 + jitter;
        accepted += u64::from(cadence.accepts(timestamp));
        assert!(!cadence.accepts(timestamp));
        assert!(!cadence.accepts(timestamp - 1));
    }
    assert!(
        accepted.abs_diff(30 * 3600) <= 1,
        "jitter yielded {accepted}"
    );
    assert!(cadence.accepts(i64::MAX - 1));
    assert!(!cadence.accepts(i64::MAX - 1));
    assert!(!cadence.accepts(i64::MAX));
}
