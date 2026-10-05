#![allow(clippy::expect_used)]

use super::{FrameCadence, FrameQueuePressure, frame_queue_capacity};
use std::time::{Duration, Instant};

#[test]
fn pressure_reports_a_stalled_encoder_at_the_deadline() {
    let mut pressure = FrameQueuePressure::default();
    let now = Instant::now();
    assert!(!pressure.check(false, now).expect("initial backpressure"));
    assert!(
        !pressure
            .check(false, now + Duration::from_millis(4999))
            .expect("temporary lag")
    );
    assert!(pressure.check(false, now + Duration::from_secs(5)).is_err());
}

#[test]
fn normal_encoder_progress_resets_the_stall_deadline() {
    let mut pressure = FrameQueuePressure::default();
    let now = Instant::now();
    pressure.check(false, now).expect("pressure");
    assert!(
        pressure
            .check(true, now + Duration::from_secs(4))
            .expect("progress")
    );
    assert!(
        !pressure
            .check(false, now + Duration::from_secs(100))
            .expect("new pressure")
    );
}

#[test]
fn pressure_is_checked_even_without_another_captured_frame() {
    let mut pressure = FrameQueuePressure::default();
    let now = Instant::now();
    assert!(pressure.check(true, now).expect("empty queue"));
    pressure.check(false, now).expect("last frame queued");
    assert!(
        pressure
            .check(false, now + Duration::from_secs(60))
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
    assert!(!cadence.accepts(9_199_999));
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
