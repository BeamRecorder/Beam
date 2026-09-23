#![allow(clippy::expect_used)]

use beam_audio::AudioTimeline;

#[test]
fn callback_capture_latency_sets_first_audio_anchor() {
    let mut timeline = AudioTimeline::new(48_000);
    let first = timeline
        .packet(900_000_000, 910_000_000, 100_000_000, 480)
        .expect("first packet");
    let anchor = first.new_anchor.expect("anchor");
    assert_eq!(anchor.session_ns, 90_000_000);
    assert_eq!(first.start_ns, 90_000_000);
    assert_eq!(first.end_ns, 100_000_000);
    assert_eq!(first.first_sample, 0);
}

#[test]
fn sample_positions_ignore_callback_jitter() {
    let mut timeline = AudioTimeline::new(48_000);
    timeline.packet(1_000, 1_000, 0, 480).expect("first");
    let second = timeline
        .packet(2_000, 2_000, 250_000_000, 480)
        .expect("second");
    assert_eq!(second.first_sample, 480);
    assert_eq!(second.start_ns, 10_000_000);
    assert_eq!(second.end_ns, 20_000_000);
    assert!(second.new_anchor.is_none());
}

#[test]
fn zero_rate_and_sample_counter_overflow_report_errors() {
    let mut zero = AudioTimeline::new(0);
    assert!(zero.packet(1, 1, 1, 1).is_err());
    let mut timeline = AudioTimeline::new(1);
    for index in 0..4 {
        timeline
            .packet(index, index, index, u32::MAX)
            .expect("within u64 nanoseconds");
    }
    assert!(timeline.packet(5, 5, 5, u32::MAX).is_err());
}

#[test]
fn native_capture_regression_disables_later_timestamp_anchors() {
    let mut timeline = AudioTimeline::new(48_000);
    let first = timeline
        .packet(1_000_000_000, 1_001_000_000, 100_000_000, 480)
        .expect("first packet");
    assert!(!first.clock_discontinuity);
    assert!(first.native_timestamp_usable);
    let regressed = timeline
        .packet(999_000_000, 1_011_000_000, 110_000_000, 480)
        .expect("regressed packet");
    assert!(regressed.clock_discontinuity);
    assert!(!regressed.native_timestamp_usable);
    let later = timeline
        .packet(1_020_000_000, 1_021_000_000, 120_000_000, 480)
        .expect("later packet");
    assert!(!later.clock_discontinuity);
    assert!(!later.native_timestamp_usable);
}

#[test]
fn large_capture_clock_leap_is_a_discontinuity_but_jitter_is_not() {
    let mut timeline = AudioTimeline::new(48_000);
    timeline
        .packet(1_000_000_000, 4_000_000_000, 100_000_000, 480)
        .expect("first packet");
    let jitter = timeline
        .packet(1_010_000_000, 4_015_000_000, 110_000_000, 480)
        .expect("normal jitter");
    assert!(!jitter.clock_discontinuity);
    let leapt = timeline
        .packet(3_000_000_000, 4_025_000_000, 120_000_000, 480)
        .expect("clock leap");
    assert!(leapt.clock_discontinuity);
    assert!(!leapt.native_timestamp_usable);
}

#[test]
fn capture_time_after_callback_time_is_not_a_usable_native_anchor() {
    let mut timeline = AudioTimeline::new(48_000);
    let invalid = timeline
        .packet(2_000_000_000, 1_999_000_000, 100_000_000, 480)
        .expect("packet with invalid capture time");
    assert!(invalid.clock_discontinuity);
    assert!(!invalid.native_timestamp_usable);
}

#[test]
fn anchor_latency_saturates_at_session_zero() {
    let mut timeline = AudioTimeline::new(48_000);
    let first = timeline
        .packet(1_000, 11_000, 5_000, 0)
        .expect("zero-frame packet");
    assert_eq!(first.new_anchor.expect("anchor").session_ns, 0);
    assert_eq!(first.start_ns, 0);
    assert_eq!(first.end_ns, 0);
    assert_eq!(first.first_sample, 0);
    let next = timeline.packet(12_000, 13_000, 6_000, 480).expect("next");
    assert!(next.new_anchor.is_none());
    assert_eq!(next.end_ns, 10_000_000);
}

#[test]
fn capture_clock_leap_at_one_second_threshold_remains_usable() {
    let mut timeline = AudioTimeline::new(48_000);
    timeline
        .packet(1_000, 3_000_001_000, 1_000, 1)
        .expect("first");
    let boundary = timeline
        .packet(1_000_001_000, 3_000_001_000, 2_000, 1)
        .expect("boundary");
    assert!(!boundary.clock_discontinuity);
    assert!(boundary.native_timestamp_usable);
    let beyond = timeline
        .packet(2_000_001_001, 3_000_001_000, 3_000, 1)
        .expect("over threshold");
    assert!(beyond.clock_discontinuity);
    assert!(!beyond.native_timestamp_usable);
}

#[test]
fn callback_clock_regression_invalidates_timestamps_without_moving_sample_timeline() {
    let mut timeline = AudioTimeline::new(48_000);
    timeline
        .packet(1_000_000, 2_000_000, 10_000_000, 480)
        .expect("first");
    let second = timeline
        .packet(1_001_000, 1_999_999, 900_000_000, 480)
        .expect("regressed callback");
    assert!(second.clock_discontinuity);
    assert!(!second.native_timestamp_usable);
    assert_eq!(second.first_sample, 480);
    assert_eq!(second.start_ns, 19_000_000);
    assert_eq!(second.end_ns, 29_000_000);
}

#[test]
fn resume_epoch_reanchors_without_counting_paused_time_or_resetting_samples() {
    let mut timeline = AudioTimeline::new(48_000);
    timeline.packet(1_000, 1_000, 0, 480).expect("first packet");
    timeline.set_epoch(1, 20_000_000).expect("resume");
    let resumed = timeline
        .packet(5_000_000_000, 5_000_000_000, 20_000_000, 480)
        .expect("resumed");
    assert_eq!(resumed.start_ns, 20_000_000);
    assert_eq!(resumed.first_sample, 480);
    assert!(!resumed.clock_discontinuity);
    timeline.set_epoch(1, 900_000_000).expect("same epoch");
    assert_eq!(
        timeline
            .packet(5_001_000_000, 5_001_000_000, 900_000_000, 480)
            .expect("next")
            .start_ns,
        30_000_000
    );
    assert!(AudioTimeline::new(0).set_epoch(1, 0).is_err());
}
