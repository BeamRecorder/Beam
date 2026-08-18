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
