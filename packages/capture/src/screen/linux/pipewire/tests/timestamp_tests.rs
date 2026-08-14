use super::*;

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
