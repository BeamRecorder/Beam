#![cfg(test)]

use super::*;

#[test]
fn preroll_cursor_buffers_defer_timestamp_origin_until_video_geometry_exists() {
    assert!(should_defer_timestamp_origin(false, true, 0));
    assert!(should_defer_timestamp_origin(false, false, 0));
    assert!(should_defer_timestamp_origin(false, true, 128));
    assert!(!should_defer_timestamp_origin(true, true, 0));
    assert!(!should_defer_timestamp_origin(true, false, 0));
    assert!(!should_defer_timestamp_origin(false, false, 128));
}

#[test]
fn deferred_cursor_preroll_does_not_anchor_mapper_before_first_video_frame() {
    let mut mapper = TimestampMapper::new(10_000);

    let preroll_is_deferred = should_defer_timestamp_origin(false, true, 0);
    assert!(preroll_is_deferred);

    let first_video = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(500),
                sequence: 2,
                ..Default::default()
            },
            200,
        )
        .expect("first valid video timestamp");
    assert_eq!(first_video.session_ns, 10_000);

    let following_cursor = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(525),
                sequence: 3,
                ..Default::default()
            },
            225,
        )
        .expect("following cursor timestamp");
    assert_eq!(following_cursor.session_ns, 10_025);
}

#[test]
fn native_timestamps_are_anchored_and_monotone() {
    let mut mapper = TimestampMapper::new(1_000);
    let first = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(80),
                sequence: 1,
                ..Default::default()
            },
            10,
        )
        .expect("first timestamp");
    let second = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(95),
                sequence: 2,
                ..Default::default()
            },
            20,
        )
        .expect("second timestamp");
    assert_eq!(first.session_ns, 1_000);
    assert_eq!(second.session_ns, 1_015);
    assert_eq!(second.native_pts_ns, Some(95));
    assert_eq!(second.source, TimestampSource::NativePresentation);
}

#[test]
fn arrival_timestamp_source_stays_locked_and_ignores_late_pts() {
    let mut mapper = TimestampMapper::new(50);
    let first = mapper
        .map(HeaderMetadata::default(), 100)
        .expect("arrival timestamp");
    let second = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(999),
                ..Default::default()
            },
            125,
        )
        .expect("arrival remains selected");
    assert_eq!(first.session_ns, 50);
    assert_eq!(second.session_ns, 75);
    assert_eq!(second.native_pts_ns, None);
    assert_eq!(second.source, TimestampSource::MonotonicArrival);
}

#[test]
fn timestamp_mapper_rejects_flags_regressions_missing_pts_and_overflow() {
    for header in [
        HeaderMetadata {
            gap: true,
            ..Default::default()
        },
        HeaderMetadata {
            corrupted: true,
            ..Default::default()
        },
        HeaderMetadata {
            discont: true,
            ..Default::default()
        },
    ] {
        assert!(TimestampMapper::new(0).map(header, 0).is_err());
    }
    let mut native = TimestampMapper::new(0);
    native
        .map(
            HeaderMetadata {
                pts_ns: Some(5),
                ..Default::default()
            },
            0,
        )
        .expect("initial native timestamp");
    assert!(
        native
            .map(
                HeaderMetadata {
                    pts_ns: Some(4),
                    ..Default::default()
                },
                1
            )
            .is_err()
    );

    let mut missing = TimestampMapper::new(0);
    missing
        .map(
            HeaderMetadata {
                pts_ns: Some(5),
                ..Default::default()
            },
            0,
        )
        .expect("initial native timestamp");
    assert!(missing.map(HeaderMetadata::default(), 1).is_err());

    let mut overflow = TimestampMapper::new(u64::MAX);
    overflow
        .map(
            HeaderMetadata {
                pts_ns: Some(1),
                ..Default::default()
            },
            0,
        )
        .expect("first timestamp fits");
    assert!(
        overflow
            .map(
                HeaderMetadata {
                    pts_ns: Some(2),
                    ..Default::default()
                },
                1
            )
            .is_err()
    );
}

#[test]
fn arrival_regression_and_overflow_report_the_last_good_session_timestamp() {
    let mut regressing = TimestampMapper::new(50);
    regressing
        .map(HeaderMetadata::default(), 100)
        .expect("first arrival");
    regressing
        .map(HeaderMetadata::default(), 120)
        .expect("second arrival");
    let error = regressing
        .map(HeaderMetadata::default(), 119)
        .expect_err("arrival regression");
    assert_eq!(error.session_ns, 70);
    assert!(error.message.contains("regressed"));
    assert_eq!(error.lost_frames, 1);

    let mut overflowing = TimestampMapper::new(u64::MAX - 1);
    overflowing
        .map(HeaderMetadata::default(), 100)
        .expect("first arrival");
    let error = overflowing
        .map(HeaderMetadata::default(), 102)
        .expect_err("arrival overflow");
    assert_eq!(error.session_ns, u64::MAX - 1);
    assert!(error.message.contains("overflowed"));
}

#[test]
fn flagged_buffer_does_not_advance_origin_and_later_native_pts_can_recover() {
    let mut mapper = TimestampMapper::new(200);
    let first = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(50),
                ..Default::default()
            },
            10,
        )
        .expect("first native timestamp");
    assert_eq!(first.session_ns, 200);
    let flagged = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(80),
                gap: true,
                ..Default::default()
            },
            20,
        )
        .expect_err("gap marker");
    assert_eq!(flagged.session_ns, 200);
    let missing = mapper
        .map(HeaderMetadata::default(), 30)
        .expect_err("missing native PTS");
    assert_eq!(missing.session_ns, 200);
    let recovered = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(60),
                ..Default::default()
            },
            40,
        )
        .expect("native PTS recovers");
    assert_eq!(recovered.session_ns, 210);
    assert_eq!(recovered.native_pts_ns, Some(60));
}

#[test]
fn first_arrival_can_be_zero_and_source_remains_locked_without_pts() {
    let mut mapper = TimestampMapper::new(0);
    assert_eq!(
        mapper
            .map(HeaderMetadata::default(), 0)
            .expect("first")
            .session_ns,
        0
    );
    let next = mapper
        .map(
            HeaderMetadata {
                pts_ns: Some(u64::MAX),
                ..Default::default()
            },
            1,
        )
        .expect("late native PTS ignored");
    assert_eq!(next.session_ns, 1);
    assert_eq!(next.native_pts_ns, None);
    assert_eq!(next.source, TimestampSource::MonotonicArrival);
}
